import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

import { NetworkRepository, ShapeRepository } from '../data/repositories';
import { LatLon } from '../models/network.model';
import { MAX_AGE_MINUTES, madridInstant } from './realtime';
import { RealtimeService } from './realtime.service';
import { RouteTrack, buildTrack, positionFromReport } from './vehicle-position';

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

  readonly available = this.realtime.available;

  /** Autobuses de la red publicada con su posición estimada ahora. */
  readonly vehicles = computed<readonly TrackedVehicle[]>(() => {
    const now = this.nowSignal();
    const geometries = this.geometries();
    this.network.lines();
    return this.realtime.vehicles().flatMap((vehicle): TrackedVehicle[] => {
      if (vehicle.dateKey !== now.dateKey) return [];
      const age = Math.max(0, (now.seconds - vehicle.seconds) / 60);
      if (age > MAX_AGE_MINUTES) return [];
      const line = this.network.getLine(vehicle.lineId);
      const direction = line?.directions.find((d) => d.id === vehicle.directionId);
      if (!line || !direction) return [];
      const reported: LatLon = [vehicle.lat, vehicle.lon];
      const lastStop = direction.stopIds.indexOf(vehicle.lastStopId);
      const track = this.trackFor(
        `${line.id}|${direction.id}`,
        geometries.get(direction.shapeId),
        direction.stopIds,
      );
      if (!track || lastStop === -1 || !direction.minutes) {
        return [
          {
            ...base(vehicle),
            point: reported,
            bearing: 0,
            ageMinutes: age,
            nextStopId: null,
            estimated: false,
          },
        ];
      }
      const position = positionFromReport(track, direction.minutes, lastStop, reported, age);
      // Próxima parada: la primera cuyo punto sobre el trazado aún no se ha alcanzado.
      const along = nearestStopAhead(track, position.point, lastStop);
      return [
        {
          ...base(vehicle),
          point: position.point,
          bearing: position.bearing,
          ageMinutes: age,
          nextStopId: along === null ? null : (direction.stopIds[along] ?? null),
          estimated: true,
        },
      ];
    });
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

/** Índice de la primera parada por delante del punto (a partir de `from`), o null. */
function nearestStopAhead(track: RouteTrack, point: LatLon, from: number): number | null {
  // La posición viene de positionFromReport: basta comparar distancias sobre el trazado.
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < track.points.length; i++) {
    const p = track.points[i]!;
    const d = (p[0] - point[0]) ** 2 + (p[1] - point[1]) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  const along = track.cumulative[best]!;
  for (let k = from; k < track.stopDistances.length; k++) {
    if (track.stopDistances[k]! > along) return k;
  }
  return null;
}
