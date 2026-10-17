import { DestroyRef, Injectable, Signal, computed, inject, signal } from '@angular/core';

import { Direction } from '../models/network.model';
import { ScheduleClockService } from '../schedule/schedule-clock.service';
import {
  EstimatedArrival,
  FeedTripUpdate,
  FeedVehicle,
  LiveTrip,
  Vehicle,
  arrivalsAt,
  liveTrips,
  liveVehicles,
  nextStopIndex,
} from './realtime';

/** Lo que trae una descarga del tiempo real, ya leído. */
export interface LiveFeeds {
  readonly vehicles: readonly FeedVehicle[];
  readonly trips: readonly FeedTripUpdate[];
}

/**
 * Origen del tiempo real. Abstracto para poder cambiar de fuente (o falsearla
 * en pruebas) sin tocar las pantallas. Si nadie lo configura (pruebas, web),
 * no hay tiempo real.
 */
@Injectable({ providedIn: 'root', useFactory: () => new NoRealtimeSource() })
export abstract class RealtimeSource {
  /** false si no se puede leer desde aquí (en la web el servidor no permite CORS). */
  abstract readonly available: boolean;
  /** Descarga las posiciones y las llegadas previstas. */
  abstract fetchFeeds(): Promise<LiveFeeds>;
}

class NoRealtimeSource extends RealtimeSource {
  readonly available = false;
  fetchFeeds(): Promise<LiveFeeds> {
    return Promise.resolve({ vehicles: [], trips: [] });
  }
}

/** La EMT renueva el feed cada minuto: preguntando cada 30 s el dato llega como mucho medio minuto tarde. */
const POLL_MS = 30_000;

/** Paso de un autobús por una parada (lo primero que se vio al dejarla atrás), para los atascos. */
export interface StopPassage {
  readonly vehicleId: string;
  readonly lineId: string;
  readonly directionId: number;
  readonly stopId: string;
  /** Segundos Unix. */
  readonly at: number;
  /**
   * true si se vio el cambio (la parada anterior era otra): `at` es entonces la
   * hora de paso con un minuto de margen. La primera que se ve no sirve para medir.
   */
  readonly exact: boolean;
}

/**
 * Tiempo real de la EMT (GTFS-RT). Solo se descarga mientras alguna pantalla
 * lo usa (watch()) y la app está abierta.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly source = inject(RealtimeSource);
  private readonly schedule = inject(ScheduleClockService);
  private readonly feedsSignal = signal<LiveFeeds>({ vehicles: [], trips: [] });
  private readonly nowSignal = signal(nowSeconds());
  private readonly failedSignal = signal(false);
  private readonly refreshingSignal = signal(false);
  /** Última parada que ha dejado atrás cada autobús y la anterior a esa. */
  private readonly passagesSignal = signal<ReadonlyMap<string, readonly StopPassage[]>>(new Map());
  private watchers = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly available = this.source.available;
  /** Viajes con llegada prevista, cruzados con sus recorridos del horario. */
  readonly trips: Signal<readonly LiveTrip[]> = computed(() => {
    const index = this.schedule.timetables()?.live;
    return index ? liveTrips(this.feedsSignal().trips, index) : [];
  });
  readonly vehicles: Signal<readonly Vehicle[]> = computed(() => {
    const index = this.schedule.timetables()?.live;
    return index ? liveVehicles(this.feedsSignal().vehicles, index) : [];
  });
  /** Hora de la última consulta (segundos Unix): con ella se calcula lo que falta. */
  readonly now = this.nowSignal.asReadonly();
  /** true si la última descarga falló (sin conexión, fuente caída...). */
  readonly failed = this.failedSignal.asReadonly();
  readonly hasData = computed(() => this.trips().length > 0 || this.vehicles().length > 0);
  /** true mientras se descarga (para el botón "Actualizar"). */
  readonly refreshing = this.refreshingSignal.asReadonly();
  readonly passages = this.passagesSignal.asReadonly();
  private readonly tripsById = computed(
    () => new Map(this.trips().map((trip) => [trip.tripId, trip])),
  );

  /** Llegadas previstas a la parada `stopIndex` de un sentido, de la más próxima a la más lejana. */
  arrivals(lineId: string, direction: Direction, stopIndex: number): EstimatedArrival[] {
    const stopId = direction.stopIds[stopIndex];
    if (stopId === undefined) return [];
    return arrivalsAt(this.trips(), lineId, direction.id, stopId, this.now());
  }

  /** Viaje en tiempo real que hace un autobús (para su próxima parada y su retraso). */
  tripOf(vehicle: Vehicle): LiveTrip | null {
    return (vehicle.tripId && this.tripsById().get(vehicle.tripId)) || null;
  }

  /** Pide ya el tiempo real, sin esperar a la siguiente consulta (botón "Actualizar"). */
  refreshNow(): Promise<void> {
    return this.available ? this.refresh() : Promise.resolve();
  }

  /**
   * Empieza a recibir el tiempo real mientras viva quien llama (componente o
   * servicio con DestroyRef). Varias pantallas comparten la misma descarga.
   */
  watch(destroyRef: Pick<DestroyRef, 'onDestroy'> = inject(DestroyRef)): void {
    if (!this.available) return;
    // Los recorridos para cruzar el feed vienen con el horario.
    void this.schedule.load();
    this.watchers++;
    if (this.watchers === 1) this.startPolling();
    destroyRef.onDestroy(() => {
      this.watchers--;
      if (this.watchers === 0) this.stopPolling();
    });
  }

  /** Con la app en segundo plano no se descarga nada; al volver, se pide al momento. */
  private readonly onVisibility = () => {
    if (this.watchers === 0) return;
    if (document.visibilityState === 'hidden') this.stopPolling();
    else this.startPolling();
  };

  constructor() {
    if (this.available) document.addEventListener('visibilitychange', this.onVisibility);
  }

  private startPolling(): void {
    if (this.timer || document.visibilityState === 'hidden') return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), POLL_MS);
  }

  private stopPolling(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async refresh(): Promise<void> {
    if (this.refreshingSignal()) return;
    this.refreshingSignal.set(true);
    try {
      this.feedsSignal.set(await this.source.fetchFeeds());
      this.failedSignal.set(false);
    } catch (error) {
      console.warn('No se pudo descargar el tiempo real', error);
      this.failedSignal.set(true);
    } finally {
      this.refreshingSignal.set(false);
      this.nowSignal.set(nowSeconds());
      this.passagesSignal.set(
        updatePassages(this.passagesSignal(), this.trips(), this.nowSignal()),
      );
    }
  }
}

function nowSeconds(): number {
  return Math.round(Date.now() / 1000);
}

/**
 * Apunta la parada que cada autobús acaba de dejar atrás (la anterior a su
 * próxima) cuando cambia, y conserva la anterior: con las dos se mide cuánto
 * ha tardado entre paradas (atascos, Fase 8).
 */
export function updatePassages(
  current: ReadonlyMap<string, readonly StopPassage[]>,
  trips: readonly LiveTrip[],
  now: number,
): ReadonlyMap<string, readonly StopPassage[]> {
  const next = new Map<string, readonly StopPassage[]>();
  for (const trip of trips) {
    if (!trip.vehicleId) continue;
    const ahead = nextStopIndex(trip, now);
    if (ahead === null || ahead === 0) continue;
    const passage: StopPassage = {
      vehicleId: trip.vehicleId,
      lineId: trip.lineId,
      directionId: trip.directionId,
      stopId: trip.stops[ahead - 1]!,
      at: now,
      exact: current.has(trip.vehicleId),
    };
    const known = current.get(trip.vehicleId) ?? [];
    const last = known.at(-1);
    next.set(
      trip.vehicleId,
      last && last.stopId === passage.stopId && last.lineId === passage.lineId
        ? known
        : [...known.slice(-1), passage],
    );
  }
  return next;
}
