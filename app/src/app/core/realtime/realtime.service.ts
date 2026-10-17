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

/**
 * Cada cuánto se piden las posiciones (petición del desarrollador, 08/10/2026):
 * la fuente se renueva cada ~5 min, pero así el dato nuevo se coge antes.
 */
const POLL_MS = 30_000;
/**
 * Justo después de un dato nuevo no llega otro hasta pasados unos 5 min: en los
 * primeros 3 min no se pregunta (optimización 1, 17/10/2026). La fuente no
 * permite preguntar "solo si ha cambiado" (no envía ETag ni Last-Modified).
 */
const QUIET_AFTER_CHANGE_MS = 3 * 60_000;

/**
 * Posiciones de los autobuses (Fase 3). Solo se descargan mientras alguna
 * pantalla las usa (watch()) y la app está abierta; se piden cada 30 s.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly source = inject(RealtimeSource);
  private readonly vehiclesSignal = signal<readonly Vehicle[]>([]);
  private readonly nowSignal = signal<MadridInstant>(madridInstant(new Date()));
  private readonly failedSignal = signal(false);
  /** Dato anterior (distinto) de cada autobús, para medir a qué ritmo avanza (Fase 6). */
  private readonly previousSignal = signal<ReadonlyMap<string, Vehicle>>(new Map());
  private watchers = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Cuándo se vio cambiar la fuente por última vez (0 = nunca). */
  private lastChangeAt = 0;

  readonly available = this.source.available;
  readonly vehicles = this.vehiclesSignal.asReadonly();
  /** Hora de Madrid de la última consulta: con ella se calcula la antigüedad del dato. */
  readonly now: Signal<MadridInstant> = this.nowSignal.asReadonly();
  /** true si la última descarga falló (sin conexión, fuente caída...). */
  readonly failed = this.failedSignal.asReadonly();
  readonly hasData = computed(() => this.vehiclesSignal().length > 0);
  readonly previous = this.previousSignal.asReadonly();
  private readonly refreshingSignal = signal(false);
  /** true mientras se descarga (para el botón "Actualizar"). */
  readonly refreshing = this.refreshingSignal.asReadonly();

  /** Pide ya las posiciones, sin esperar al siguiente minuto (botón "Actualizar"). */
  refreshNow(): Promise<void> {
    return this.available ? this.refresh() : Promise.resolve();
  }

  /**
   * Empieza a recibir posiciones mientras viva quien llama (componente o
   * servicio con DestroyRef). Varias pantallas comparten la misma descarga.
   */
  watch(destroyRef: Pick<DestroyRef, 'onDestroy'> = inject(DestroyRef)): void {
    if (!this.available) return;
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
    this.timer = setInterval(() => {
      if (Date.now() - this.lastChangeAt >= QUIET_AFTER_CHANGE_MS) void this.refresh();
    }, POLL_MS);
  }

  private stopPolling(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async refresh(): Promise<void> {
    if (this.refreshingSignal()) return;
    this.refreshingSignal.set(true);
    try {
      const vehicles = parseVehicles(await this.source.fetchVehicles());
      if (newestReport(vehicles) !== newestReport(this.vehiclesSignal())) {
        this.lastChangeAt = Date.now();
      }
      this.previousSignal.set(
        previousReports(this.vehiclesSignal(), vehicles, this.previousSignal()),
      );
      this.vehiclesSignal.set(vehicles);
      this.failedSignal.set(false);
    } catch (error) {
      console.warn('No se pudieron descargar las posiciones en tiempo real', error);
      this.failedSignal.set(true);
    } finally {
      this.refreshingSignal.set(false);
      this.nowSignal.set(madridInstant(new Date()));
    }
  }
}

/** Hora del dato más reciente (para saber si la fuente ha cambiado). */
function newestReport(vehicles: readonly Vehicle[]): string {
  let newest = '';
  for (const v of vehicles) {
    const key = `${v.dateKey}${String(v.seconds).padStart(5, '0')}`;
    if (key > newest) newest = key;
  }
  return newest;
}

/**
 * Para cada autobús, su dato anterior: el actual si el nuevo es distinto (la
 * fuente repite el mismo dato durante ~5 min) y si no, el que ya se guardaba.
 */
export function previousReports(
  current: readonly Vehicle[],
  next: readonly Vehicle[],
  previous: ReadonlyMap<string, Vehicle>,
): ReadonlyMap<string, Vehicle> {
  const byId = new Map(current.map((v) => [v.id, v]));
  const result = new Map<string, Vehicle>();
  for (const vehicle of next) {
    const old = byId.get(vehicle.id);
    const changed = old && (old.seconds !== vehicle.seconds || old.dateKey !== vehicle.dateKey);
    const kept = changed ? old : previous.get(vehicle.id);
    if (kept) result.set(vehicle.id, kept);
  }
  return result;
}
