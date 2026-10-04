import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

import { NetworkRepository } from '../data/repositories';
import { ArrivalAlert, decideAlert } from './arrival-alert';
import { ArrivalNotifier, NotificationText } from './arrival-notifier';
import { estimateArrivals } from './realtime';
import { RealtimeService } from './realtime.service';

/** Cambios menores que esto en la hora del aviso no lo reprograman. */
const RESCHEDULE_MS = 20_000;

/**
 * Aviso de llegada activo (uno a la vez). Mientras existe, mantiene la descarga
 * del tiempo real y, con cada dato nuevo, reprograma la notificación del
 * sistema para cuando falten los minutos elegidos.
 */
@Injectable({ providedIn: 'root' })
export class ArrivalAlertService {
  private readonly realtime = inject(RealtimeService);
  private readonly network = inject(NetworkRepository);
  private readonly notifier = inject(ArrivalNotifier);
  private readonly transloco = inject(TranslocoService);
  private readonly alertSignal = signal<ArrivalAlert | null>(null);
  private scheduledAt: number | null = null;
  private stopWatching: (() => void) | null = null;

  readonly available = this.realtime.available && this.notifier.available;
  readonly alert = this.alertSignal.asReadonly();

  constructor() {
    effect(() => {
      const alert = this.alertSignal();
      this.realtime.vehicles();
      const now = this.realtime.now();
      if (alert) untracked(() => this.update(alert, now));
    });
  }

  /** Activa el aviso; false si no hay permiso para notificar. */
  async start(alert: ArrivalAlert): Promise<boolean> {
    if (!this.available || !(await this.notifier.requestPermission())) return false;
    this.scheduledAt = null;
    if (!this.stopWatching) {
      const callbacks: (() => void)[] = [];
      this.realtime.watch({
        onDestroy: (fn: () => void) => {
          callbacks.push(fn);
          return () => undefined;
        },
      });
      this.stopWatching = () => callbacks.forEach((fn) => fn());
    }
    this.alertSignal.set(alert);
    return true;
  }

  cancel(): void {
    void this.notifier.cancel();
    this.finish();
  }

  private update(alert: ArrivalAlert, now: ReturnType<RealtimeService['now']>): void {
    const direction = this.network
      .getLine(alert.lineId)
      ?.directions.find((d) => d.id === alert.directionId);
    const eta = direction
      ? (estimateArrivals(
          this.realtime.vehicles(),
          alert.lineId,
          direction,
          direction.stopIds.indexOf(alert.stopId),
          now,
        ).find((a) => a.vehicleId === alert.vehicleId)?.minutes ?? null)
      : null;
    const decision = decideAlert(alert.minutes, eta);
    switch (decision.kind) {
      case 'lost':
        // Ya no viene (o se perdió su señal): se quita el aviso programado.
        this.cancel();
        return;
      case 'now':
        void this.notifier.showNow(this.text(alert, decision.eta));
        this.finish();
        return;
      case 'later': {
        const at = Date.now() + decision.inMinutes * 60_000;
        if (this.scheduledAt !== null && Math.abs(at - this.scheduledAt) < RESCHEDULE_MS) return;
        this.scheduledAt = at;
        void this.notifier.schedule(new Date(at), this.text(alert, alert.minutes));
      }
    }
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

  private finish(): void {
    this.alertSignal.set(null);
    this.scheduledAt = null;
    this.stopWatching?.();
    this.stopWatching = null;
  }
}
