import { DestroyRef, Injectable, Signal, computed, inject, signal } from '@angular/core';

import { MadridInstant, Vehicle, madridInstant, parseVehicles } from './realtime';

/**
 * Origen de las posiciones en tiempo real. Abstracto para poder cambiar de
 * fuente (o falsearla en pruebas) sin tocar las pantallas. Si nadie lo
 * configura (pruebas), no hay tiempo real.
 */
@Injectable({ providedIn: 'root', useFactory: () => new NoRealtimeSource() })
export abstract class RealtimeSource {
  /** false si no se puede leer desde aquí (en la web el servidor no permite CORS). */
  abstract readonly available: boolean;
  /** Descarga la lista de autobuses tal como la publica la fuente. */
  abstract fetchVehicles(): Promise<unknown>;
}

class NoRealtimeSource extends RealtimeSource {
  readonly available = false;
  fetchVehicles(): Promise<unknown> {
    return Promise.resolve([]);
  }
}

/** La fuente se actualiza cada ~5 min: pedirla cada minuto basta. */
const POLL_MS = 60_000;

/**
 * Posiciones de los autobuses (Fase 3). Solo se descargan mientras alguna
 * pantalla las usa (watch()) y la app está abierta; se piden cada minuto.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly source = inject(RealtimeSource);
  private readonly vehiclesSignal = signal<readonly Vehicle[]>([]);
  private readonly nowSignal = signal<MadridInstant>(madridInstant(new Date()));
  private readonly failedSignal = signal(false);
  private watchers = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly available = this.source.available;
  readonly vehicles = this.vehiclesSignal.asReadonly();
  /** Hora de Madrid de la última consulta: con ella se calcula la antigüedad del dato. */
  readonly now: Signal<MadridInstant> = this.nowSignal.asReadonly();
  /** true si la última descarga falló (sin conexión, fuente caída...). */
  readonly failed = this.failedSignal.asReadonly();
  readonly hasData = computed(() => this.vehiclesSignal().length > 0);

  /**
   * Empieza a recibir posiciones mientras viva quien llama (componente o
   * servicio con DestroyRef). Varias pantallas comparten la misma descarga.
   */
  watch(destroyRef: Pick<DestroyRef, 'onDestroy'> = inject(DestroyRef)): void {
    if (!this.available) return;
    this.watchers++;
    if (this.watchers === 1) {
      void this.refresh();
      this.timer = setInterval(() => void this.refresh(), POLL_MS);
    }
    destroyRef.onDestroy(() => {
      this.watchers--;
      if (this.watchers === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    });
  }

  private async refresh(): Promise<void> {
    try {
      this.vehiclesSignal.set(parseVehicles(await this.source.fetchVehicles()));
      this.failedSignal.set(false);
    } catch (error) {
      console.warn('No se pudieron descargar las posiciones en tiempo real', error);
      this.failedSignal.set(true);
    } finally {
      this.nowSignal.set(madridInstant(new Date()));
    }
  }
}
