import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

import { NetworkRepository, ShapeRepository } from '../data/repositories';
import { LatLon } from '../models/network.model';
import { MAX_AGE_MINUTES, madridInstant } from './realtime';
import { RealtimeService } from './realtime.service';
import { LiveContextService } from './live-context.service';
import { vehicleProgress } from './live-estimate';
import {
  RouteTrack,
  SmoothState,
  buildTrack,
  pointAt,
  positionFromReport,
  smoothAlong,
} from './vehicle-position';

/** Cada cuánto se recalcula la posición estimada (el mapa la anima entre medias). */
const TICK_MS = 1_000;

/** Autobús con su posición estimada ahora mismo. */
export interface TrackedVehicle {
  readonly id: string;
  readonly lineId: string;
  readonly directionId: number;
  readonly point: LatLon;
  /** Rumbo en grados (0 = norte). */
  readonly bearing: number;
  /** Minutos desde el último dato de la fuente. */
  readonly ageMinutes: number;
  /** Próxima parada según la estimación (código), si se sabe. */
  readonly nextStopId: string | null;
  /** true si la posición se ha podido estimar sobre el recorrido (si no, es la publicada). */
  readonly estimated: boolean;
  /** Retraso frente a su viaje del horario, en minutos (null si no se sabe). */
  readonly delayMinutes: number | null;
}

/**
 * Posición estimada de los autobuses, segundo a segundo, para que se muevan
 * por el mapa entre un dato y el siguiente de la fuente (Fase 4).
 */
@Injectable({ providedIn: 'root' })
export class VehicleTrackerService {
  private readonly realtime = inject(RealtimeService);
  private readonly network = inject(NetworkRepository);
  private readonly shapes = inject(ShapeRepository);
  private readonly nowSignal = signal(madridInstant(new Date()));
  private readonly geometries = signal<ReadonlyMap<string, readonly LatLon[]>>(new Map());
  private shapesRequested = false;
  private watchers = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly tracks = new Map<string, RouteTrack | null>();
  private readonly live = inject(LiveContextService);
  /** Lo último dibujado de cada autobús, para moverlo con suavidad (Fase 6). */
  private smooth = new Map<string, SmoothState & { key: string }>();

  readonly available = this.realtime.available;

  /** Autobuses de la red publicada con su posición estimada ahora. */
  readonly vehicles = computed<readonly TrackedVehicle[]>(() => {
    const now = this.nowSignal();
    const geometries = this.geometries();
    const context = this.live.context();
    this.network.lines();
    const smooth = new Map<string, SmoothState & { key: string }>();
    const result = this.realtime.vehicles().flatMap((vehicle): TrackedVehicle[] => {
      if (vehicle.dateKey !== now.dateKey) return [];
      const age = Math.max(0, (now.seconds - vehicle.seconds) / 60);
      if (age > MAX_AGE_MINUTES) return [];
      const line = this.network.getLine(vehicle.lineId);
      const direction = line?.directions.find((d) => d.id === vehicle.directionId);
      if (!line || !direction) return [];
      const reported: LatLon = [vehicle.lat, vehicle.lon];
      const lastStop = direction.stopIds.indexOf(vehicle.lastStopId);
      const key = `${line.id}|${direction.id}`;
      const track = this.trackFor(key, geometries.get(direction.shapeId), direction.stopIds);
      const progress =
        lastStop === -1 ? null : vehicleProgress(vehicle, direction, lastStop, context);
      if (!track || !progress) {
        return [
          {
            ...base(vehicle),
            point: reported,
            bearing: 0,
            ageMinutes: age,
            nextStopId: null,
            estimated: false,
            delayMinutes:
              progress?.delay === undefined || progress?.delay === null
                ? null
                : Math.round(progress.delay),
          },
        ];
      }
      // Avanza al ritmo de su viaje del horario, corregido con el ritmo medido (Fase 6)…
      const target = positionFromReport(
        track,
        progress.profile,
        lastStop,
        reported,
        age * progress.pace,
      );
      // …y sin saltos cuando llega un dato nuevo.
      const previous = this.smooth.get(vehicle.id);
      const state = smoothAlong(previous?.key === key ? previous : undefined, target.along);
      smooth.set(vehicle.id, { ...state, key });
      const shown = pointAt(track, state.shown);
      const next = stopAhead(track, state.shown, lastStop);
      return [
        {
          ...base(vehicle),
          point: shown.point,
          bearing: shown.bearing,
          ageMinutes: age,
          nextStopId: next === null ? null : (direction.stopIds[next] ?? null),
          estimated: true,
          delayMinutes: progress.delay === null ? null : Math.round(progress.delay),
        },
      ];
    });
    this.smooth = smooth;
    return result;
  });

  /** Empieza a seguir a los autobuses mientras viva quien llama. */
  watch(destroyRef = inject(DestroyRef)): void {
    if (!this.available) return;
    this.realtime.watch(destroyRef);
    void this.loadShapes();
    this.watchers++;
    if (this.watchers === 1) {
      this.timer = setInterval(() => this.nowSignal.set(madridInstant(new Date())), TICK_MS);
    }
    destroyRef.onDestroy(() => {
      this.watchers--;
      if (this.watchers === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    });
  }

  private trackFor(
    key: string,
    points: readonly LatLon[] | undefined,
    stopIds: readonly string[],
  ): RouteTrack | null {
    if (!points) return null;
    if (!this.tracks.has(key)) {
      const stops = stopIds
        .map((id) => this.network.getStop(id))
        .map((stop): LatLon | null => (stop ? [stop.lat, stop.lon] : null));
      this.tracks.set(key, stops.every((s) => s) ? buildTrack(points, stops as LatLon[]) : null);
    }
    return this.tracks.get(key) ?? null;
  }

  private async loadShapes(): Promise<void> {
    if (this.shapesRequested) return;
    this.shapesRequested = true;
    try {
      this.tracks.clear();
      this.geometries.set(await this.shapes.getShapes('detail'));
    } catch (error) {
      this.shapesRequested = false;
      console.warn('No se pudieron cargar los trazados para los autobuses', error);
    }
  }
}

function base(vehicle: { id: string; lineId: string; directionId: number }) {
  return { id: vehicle.id, lineId: vehicle.lineId, directionId: vehicle.directionId };
}

/** Índice de la primera parada que queda por delante (a partir de `from`), o null. */
function stopAhead(track: RouteTrack, along: number, from: number): number | null {
  for (let k = from; k < track.stopDistances.length; k++) {
    if (track.stopDistances[k]! > along) return k;
  }
  return null;
}
