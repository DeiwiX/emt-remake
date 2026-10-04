import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

import { NetworkRepository, ScheduleRepository } from '../data/repositories';
import { ServiceClock, Timetables, madridClock, nextPassing } from './schedule';

/** Cada cuánto se refresca "ahora" para recalcular los próximos buses. */
const TICK_MS = 30_000;

export type NextBuses =
  | { readonly state: 'loading' }
  /** La línea no publica horario (91–93) o no se pudo descargar. */
  | { readonly state: 'unavailable' }
  | { readonly state: 'ready'; readonly times: readonly number[]; readonly clock: ServiceClock };

/**
 * Hora actual de servicio y horario programado compartidos por las pantallas
 * (parada, mapa y "Cómo llegar"). El horario se descarga la primera vez que
 * alguien lo pide.
 */
@Injectable({ providedIn: 'root' })
export class ScheduleClockService {
  private readonly scheduleRepository = inject(ScheduleRepository);
  private readonly network = inject(NetworkRepository);

  private readonly nowSignal = signal(new Date());
  /** Hora de Málaga, refrescada cada 30 s. */
  readonly clock = computed(() => madridClock(this.nowSignal()));
  private readonly timetablesSignal = signal<Timetables | null | 'error'>(null);
  readonly timetables = computed(() => {
    const value = this.timetablesSignal();
    return value === 'error' ? null : value;
  });
  /** Último día (AAAAMMDD) que cubre el horario publicado. */
  readonly lastServiceDate = computed(() => {
    const timetables = this.timetables();
    if (!timetables) return null;
    let last = '';
    for (const dates of timetables.services.values()) {
      for (const date of dates) if (date > last) last = date;
    }
    return last || null;
  });
  private loading: Promise<void> | null = null;

  constructor() {
    const timer = setInterval(() => this.nowSignal.set(new Date()), TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /** Pide el horario (una sola descarga; reintenta si la anterior falló). */
  load(): Promise<void> {
    if (this.timetablesSignal() && this.timetablesSignal() !== 'error') return Promise.resolve();
    this.loading ??= this.scheduleRepository
      .getTimetables()
      .then((timetables) => this.timetablesSignal.set(timetables))
      .catch((error: unknown) => {
        console.warn('No se pudo cargar el horario', error);
        this.timetablesSignal.set('error');
      })
      .finally(() => (this.loading = null));
    return this.loading;
  }

  /** Próximos pasos programados de una línea y sentido por una parada. */
  nextBuses(lineId: string, directionId: number, stopId: string, count = 2): NextBuses {
    const timetables = this.timetablesSignal();
    if (timetables === null) return { state: 'loading' };
    if (timetables === 'error') return { state: 'unavailable' };
    const direction = this.network.getLine(lineId)?.directions.find((d) => d.id === directionId);
    const index = direction?.stopIds.indexOf(stopId) ?? -1;
    if (!direction?.minutes || index === -1) return { state: 'unavailable' };
    const clock = this.clock();
    const times = nextPassing(
      timetables,
      lineId,
      directionId,
      { index, typical: direction.minutes[index]! },
      clock,
      count,
    );
    return times.length > 0 ? { state: 'ready', times, clock } : { state: 'unavailable' };
  }
}
