import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

import { metresBetween } from '../location/geo';
import { NetworkRepository, ShapeRepository } from '../data/repositories';
import { LatLon } from '../models/network.model';
import { CongestionLevel, slowStretch } from './congestion';
import { MAX_AGE_MINUTES, ageMinutes, nextStopIndex } from './realtime';
import { RealtimeService } from './realtime.service';
import { RouteTrack, buildTrack, snapToTrack, trackSlice } from './vehicle-position';

/** A menos de esto de su próxima parada y casi quieto, el autobús está en ella. */
const AT_STOP_METRES = 35;

/** Autobús en el mapa: su posición GPS colocada sobre el recorrido. */
export interface TrackedVehicle {
  readonly id: string;
  readonly lineId: string;
  readonly directionId: number;
  readonly point: LatLon;
  /** Rumbo en grados (0 = norte). */
  readonly bearing: number;
  /** Minutos desde el dato. */
  readonly ageMinutes: number;
  /** Próxima parada (código), si se sabe. */
  readonly nextStopId: string | null;
  /** Parada en la que está ahora, si lo está. */
  readonly stoppedAtId: string | null;
  /** Retraso frente al horario en su próxima parada, en minutos (null si no se sabe). */
  readonly delayMinutes: number | null;
}

/** Tramo lento (Fase 8) listo para dibujar: el trozo de trazado que recorrió el autobús. */
export interface CongestedStretch {
  readonly id: string;
  readonly lineId: string;
  readonly level: CongestionLevel;
  readonly extraMinutes: number;
  readonly fromStopId: string;
  readonly toStopId: string;
  readonly points: readonly LatLon[];
}

/**
 * Autobuses para el mapa: su posición GPS (la EMT la renueva cada minuto)
 * sobre el recorrido de su línea, su próxima parada y los tramos lentos.
 */
@Injectable({ providedIn: 'root' })
export class VehicleTrackerService {
  private readonly realtime = inject(RealtimeService);
  private readonly network = inject(NetworkRepository);
  private readonly shapes = inject(ShapeRepository);
  private readonly geometries = signal<ReadonlyMap<string, readonly LatLon[]>>(new Map());
  private shapesRequested = false;
  private readonly tracks = new Map<string, RouteTrack | null>();
  /** Líneas que quiere cada pantalla que sigue a los autobuses (null = todas). */
  private readonly scopes = signal<readonly (() => ReadonlySet<string> | null)[]>([]);
  private readonly wantedLines = computed<ReadonlySet<string> | null>(() => {
    const wanted = new Set<string>();
    for (const scope of this.scopes()) {
      const lines = scope();
      if (lines === null) return null;
      for (const id of lines) wanted.add(id);
    }
    return wanted;
  });

  readonly available = this.realtime.available;

  /** Autobuses de las líneas que se están mirando, con datos recientes. */
  readonly vehicles = computed<readonly TrackedVehicle[]>(() => {
    const now = this.realtime.now();
    const geometries = this.geometries();
    const wanted = this.wantedLines();
    this.network.lines();
    return this.realtime.vehicles().flatMap((vehicle): TrackedVehicle[] => {
      if (wanted && !wanted.has(vehicle.lineId)) return [];
      const age = ageMinutes(vehicle, now);
      if (age > MAX_AGE_MINUTES) return [];
      const direction = this.network
        .getLine(vehicle.lineId)
        ?.directions.find((d) => d.id === vehicle.directionId);
      if (!direction) return [];
      const gps: LatLon = [vehicle.lat, vehicle.lon];
      const trip = this.realtime.tripOf(vehicle);
      const ahead = trip ? nextStopIndex(trip, now) : null;
      const nextStopId = trip && ahead !== null ? trip.stops[ahead]! : null;
      const delay = trip && ahead !== null ? trip.delays[ahead] : null;
      // Tramo del sentido entre la parada anterior y la próxima, para colocarlo bien.
      const nextIndex = nextStopId ? direction.stopIds.indexOf(nextStopId) : -1;
      const track = this.trackFor(
        `${vehicle.lineId}|${direction.id}`,
        geometries.get(direction.shapeId),
        direction.stopIds,
      );
      const placed =
        track && snapToTrack(track, gps, nextIndex > 0 ? [nextIndex - 1, nextIndex] : null);
      const nextStop = nextStopId ? this.network.getStop(nextStopId) : undefined;
      const atStop = nextStop && metresBetween(gps, [nextStop.lat, nextStop.lon]) < AT_STOP_METRES;
      return [
        {
          id: vehicle.id,
          lineId: vehicle.lineId,
          directionId: vehicle.directionId,
          point: placed?.point ?? gps,
          bearing: placed?.bearing ?? 0,
          ageMinutes: age,
          nextStopId,
          stoppedAtId: atStop ? nextStopId : null,
          delayMinutes: delay === null || delay === undefined ? null : Math.round(delay / 60),
        },
      ];
    });
  });

  /** Tramos que los autobuses acaban de recorrer (o recorren) más despacio que su horario (Fase 8). */
  readonly congestion = computed<readonly CongestedStretch[]>(() => {
    const now = this.realtime.now();
    const geometries = this.geometries();
    this.network.lines();
    return [...this.realtime.passages().values()].flatMap((passages): CongestedStretch[] => {
      const last = passages.at(-1);
      const direction = last
        ? this.network.getLine(last.lineId)?.directions.find((d) => d.id === last.directionId)
        : undefined;
      if (!last || !direction?.minutes) return [];
      const stretch = slowStretch(passages, now, direction, direction.minutes);
      const track = this.trackFor(
        `${last.lineId}|${direction.id}`,
        geometries.get(direction.shapeId),
        direction.stopIds,
      );
      if (!stretch || !track) return [];
      return [
        {
          id: last.vehicleId,
          lineId: last.lineId,
          level: stretch.level,
          extraMinutes: stretch.extraMinutes,
          fromStopId: direction.stopIds[stretch.fromIndex]!,
          toStopId: direction.stopIds[stretch.toIndex]!,
          points: trackSlice(
            track,
            track.stopDistances[stretch.fromIndex]!,
            track.stopDistances[stretch.toIndex]!,
          ),
        },
      ];
    });
  });

  /**
   * Empieza a seguir a los autobuses mientras viva quien llama. `lines` dice de
   * qué líneas necesita la posición (sin él, de todas).
   */
  watch(
    destroyRef: Pick<DestroyRef, 'onDestroy'> = inject(DestroyRef),
    lines: () => ReadonlySet<string> | null = () => null,
  ): void {
    if (!this.available) return;
    this.realtime.watch(destroyRef);
    void this.loadShapes();
    this.scopes.update((list) => [...list, lines]);
    destroyRef.onDestroy(() =>
      this.scopes.update((list) => list.filter((scope) => scope !== lines)),
    );
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
