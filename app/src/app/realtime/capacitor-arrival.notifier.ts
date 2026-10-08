import { Injectable } from '@angular/core';

import {
  ArrivalNotifier,
  NotificationText,
  TrackingRequest,
} from '../core/realtime/arrival-notifier';
import { VEHICLES_URL } from './capacitor-realtime.source';

/** La app solo tiene un aviso a la vez: siempre el mismo identificador. */
const ALERT_ID = 1;

/** Plugin propio de Android (android/.../tracker): "Siguiendo tu bus". */
interface BusTrackerPlugin {
  start(options: { alert: TrackingRequest & { feedUrl: string } }): Promise<void>;
  stop(): Promise<void>;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

/**
 * Avisos de llegada en el móvil.
 * - Android: los lleva el servicio nativo "Siguiendo tu bus", que consulta la
 *   posición del autobús cada 30 s aunque la app esté cerrada (Fase 6) y
 *   avisa él mismo, así no hay avisos repetidos.
 * - Resto (iOS): notificación local programada con @capacitor/local-notifications,
 *   que se reprograma con cada dato nuevo mientras la app está abierta.
 */
@Injectable()
export class CapacitorArrivalNotifier extends ArrivalNotifier {
  /** Se consulta el global de Capacitor para no cargarlo en el paquete inicial. */
  private readonly capacitor = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
  readonly available = this.capacitor?.isNativePlatform?.() ?? false;
  private readonly tracking = this.capacitor?.getPlatform?.() === 'android';

  async requestPermission(): Promise<boolean> {
    const plugin = (await this.load()).LocalNotifications;
    const current = await plugin.checkPermissions();
    if (current.display === 'granted') return true;
    return (await plugin.requestPermissions()).display === 'granted';
  }

  async schedule(at: Date, text: NotificationText, tracking?: TrackingRequest): Promise<void> {
    const plugin = (await this.load()).LocalNotifications;
    await plugin.cancel({ notifications: [{ id: ALERT_ID }] });
    if (this.tracking && tracking) {
      await this.startTracking(tracking);
      return;
    }
    await plugin.schedule({
      notifications: [{ id: ALERT_ID, ...text, schedule: { at, allowWhileIdle: true } }],
    });
  }

  async showNow(text: NotificationText, tracking?: TrackingRequest): Promise<void> {
    if (this.tracking && tracking) {
      // El servicio avisa en cuanto ve que ya es la hora.
      await this.startTracking({ ...tracking, notifyAt: Date.now() });
      return;
    }
    const plugin = (await this.load()).LocalNotifications;
    await plugin.cancel({ notifications: [{ id: ALERT_ID }] });
    await plugin.schedule({ notifications: [{ id: ALERT_ID, ...text }] });
  }

  async cancel(): Promise<void> {
    const plugin = (await this.load()).LocalNotifications;
    await plugin.cancel({ notifications: [{ id: ALERT_ID }] });
    if (this.tracking) {
      const { registerPlugin } = await import('@capacitor/core');
      await registerPlugin<BusTrackerPlugin>('BusTracker').stop();
    }
  }

  private async startTracking(tracking: TrackingRequest): Promise<void> {
    const { registerPlugin } = await import('@capacitor/core');
    await registerPlugin<BusTrackerPlugin>('BusTracker').start({
      alert: { ...tracking, feedUrl: VEHICLES_URL },
    });
  }

  /**
   * Se devuelve el módulo y no el plugin: el plugin es un proxy de Capacitor y
   * devolverlo desde una función async haría que se le pidiera `.then()`.
   */
  private load() {
    return import('@capacitor/local-notifications');
  }
}
