import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

import { NetworkRepository } from '../data/repositories';
import { ArrivalAlert, LiveArrival, createAlert, parseAlert, updateAlert } from './arrival-alert';
import { ArrivalNotifier, NotificationText } from './arrival-notifier';
import { estimateArrivals } from './realtime';
import { RealtimeService } from './realtime.service';

const STORAGE_KEY = 'emt-remake.arrival-alert.v1';
const MINUTE_MS = 60_000;

/** Paso de un autobús sobre el que se pone el aviso. */
export interface AlertTarget {
  readonly stopId: string;
  readonly lineId: string;
  readonly directionId: number;
  /** Hora de paso (ms). */
  readonly at: number;
  /** Autobús en tiempo real, si el paso elegido es uno visto en tiempo real. */
  readonly vehicleId: string | null;
}

/**
 * Aviso de llegada activo (uno a la vez). Se guarda en el dispositivo y la
 * notificación queda programada en el sistema, así que vale para mañana y
 * aunque se cierre la app. Mientras la app está abierta sigue el tiempo real
 * y mueve la hora del aviso si el autobús se adelanta o se retrasa.
 */
@Injectable({ providedIn: 'root' })
export class ArrivalAlertService {
  private readonly realtime = inject(RealtimeService);
  private readonly network = inject(NetworkRepository);
  private readonly notifier = inject(ArrivalNotifier);
  private readonly transloco = inject(TranslocoService);
  private readonly alertSignal = signal<ArrivalAlert | null>(this.available() ? load() : null);
  private stopWatching: (() => void) | null = null;

  readonly alert = this.alertSignal.asReadonly();

  constructor() {
    if (this.alertSignal()) this.watchRealtime();
    effect(() => {
      const alert = this.alertSignal();
      const live = this.liveArrivals(alert);
      if (alert) untracked(() => this.apply(alert, updateAlert(alert, live, Date.now())));
    });
  }

  /** Los avisos necesitan notificaciones del sistema (solo en la app del móvil). */
  available(): boolean {
    return this.notifier.available;
  }

  /** Activa el aviso (sustituye al anterior); false si no hay permiso para notificar. */
  async start(target: AlertTarget, minutes: number): Promise<boolean> {
    if (!this.available() || !(await this.notifier.requestPermission())) return false;
    const alert = createAlert(target, minutes);
    await this.notifier.schedule(new Date(alert.notifyAt), this.text(alert, minutes));
    this.set(alert);
    this.watchRealtime();
    return true;
  }

  cancel(): void {
    void this.notifier.cancel();
    this.set(null);
  }

  /** Llegadas en tiempo real a la parada del aviso; null si aún no hay datos. */
  private liveArrivals(alert: ArrivalAlert | null): readonly LiveArrival[] | null {
    if (!alert || !this.realtime.hasData()) return null;
    const direction = this.network
      .getLine(alert.lineId)
      ?.directions.find((d) => d.id === alert.directionId);
    if (!direction) return null;
    const now = Date.now();
    return estimateArrivals(
      this.realtime.vehicles(),
      alert.lineId,
      direction,
      direction.stopIds.indexOf(alert.stopId),
      this.realtime.now(),
    ).map((a) => ({ vehicleId: a.vehicleId, at: now + a.minutes * MINUTE_MS }));
  }

  private apply(alert: ArrivalAlert, update: ReturnType<typeof updateAlert>): void {
    switch (update.kind) {
      case 'keep':
        return;
      case 'schedule':
        if (update.alert.notifyAt !== alert.notifyAt) {
          void this.notifier.schedule(
            new Date(update.alert.notifyAt),
            this.text(update.alert, update.alert.minutes),
          );
        }
        this.set(update.alert);
        return;
      case 'notify-now': {
        const minutes = Math.max(0, Math.round((update.alert.expectedAt - Date.now()) / MINUTE_MS));
        void this.notifier.showNow(this.text(update.alert, minutes));
        this.set(null);
        return;
      }
      case 'done':
        this.set(null);
    }
  }

  private set(alert: ArrivalAlert | null): void {
    this.alertSignal.set(alert);
    save(alert);
    if (!alert) {
      this.stopWatching?.();
      this.stopWatching = null;
    }
  }

  /** Mantiene la descarga del tiempo real mientras haya aviso. */
  private watchRealtime(): void {
    if (this.stopWatching || !this.realtime.available) return;
    const callbacks: (() => void)[] = [];
    this.realtime.watch({
      onDestroy: (fn: () => void) => {
        callbacks.push(fn);
        return () => undefined;
      },
    });
    this.stopWatching = () => callbacks.forEach((fn) => fn());
  }

  private text(alert: ArrivalAlert, minutes: number): NotificationText {
    const stop = this.network.getStop(alert.stopId);
    return {
      title: this.transloco.translate('alert.title', { line: alert.lineId }),
      body: this.transloco.translate(minutes === 0 ? 'alert.bodyNow' : 'alert.body', {
        minutes,
        stop: stop?.name ?? alert.stopId,
      }),
    };
  }
}

function load(): ArrivalAlert | null {
  try {
    return parseAlert(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function save(alert: ArrivalAlert | null): void {
  try {
    if (alert) localStorage.setItem(STORAGE_KEY, JSON.stringify(alert));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sin almacenamiento: el aviso vale mientras la app siga abierta.
  }
}
