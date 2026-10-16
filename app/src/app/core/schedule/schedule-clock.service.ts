import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { DataStatusService, NetworkRepository, ScheduleRepository } from '../data/repositories';
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
  /** Opcional: sin él (pruebas) el horario no se recarga al llegar datos nuevos. */
  private readonly dataStatus = inject(DataStatusService, { optional: true });
  /** Fecha de generación de los datos con los que se cargó el horario. */
  private loadedFor: number | null = null;

  /** El horario guardado ya no cubre hoy (hay que actualizar los datos). */
  readonly expired = computed(() => {
    const last = this.lastServiceDate();
    return last !== null && last < this.clock().dateKey;
  });

  constructor() {
    const timer = setInterval(() => this.nowSignal.set(new Date()), TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    // Si llegan datos nuevos con el horario ya cargado, se carga el nuevo. Antes se
    // seguía usando el viejo hasta cerrar la app (y podía decir que no había buses).
    effect(() => {
      const status = this.dataStatus?.status();
      if (!status) return;
      if (status.state !== 'ready') return;
      const generated = status.generatedAt.getTime();
      untracked(() => {
        if (this.loadedFor !== null && this.loadedFor !== generated) void this.reload(generated);
      });
    });
  }

  /** Pide el horario (una sola descarga; reintenta si la anterior falló). */
  load(): Promise<void> {
    if (this.timetablesSignal() && this.timetablesSignal() !== 'error') return Promise.resolve();
    const status = this.dataStatus?.status();
    this.loadedFor = status?.state === 'ready' ? status.generatedAt.getTime() : 0;
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

  /** Carga el horario de los datos nuevos; mientras, se sigue usando el anterior. */
  private async reload(generated: number): Promise<void> {
    this.loadedFor = generated;
    try {
      this.timetablesSignal.set(await this.scheduleRepository.getTimetables());
    } catch (error) {
      console.warn('No se pudo cargar el horario nuevo; se mantiene el anterior', error);
    }
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
