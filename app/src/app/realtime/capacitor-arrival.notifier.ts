import { Injectable } from '@angular/core';

import { ArrivalNotifier, NotificationText } from '../core/realtime/arrival-notifier';

/** La app solo tiene un aviso a la vez: siempre el mismo identificador. */
const ALERT_ID = 1;

/**
 * Avisos con las notificaciones locales de Capacitor. El aviso se programa en
 * el sistema, así que llega aunque la app esté en segundo plano; mientras está
 * abierta se reprograma con cada dato nuevo del autobús.
 */
@Injectable()
export class CapacitorArrivalNotifier extends ArrivalNotifier {
  /** Igual que en el tiempo real: se consulta el global para no cargar Capacitor de inicio. */
  readonly available =
    (
      globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }
    ).Capacitor?.isNativePlatform?.() ?? false;

  async requestPermission(): Promise<boolean> {
    const plugin = (await this.load()).LocalNotifications;
    const current = await plugin.checkPermissions();
    if (current.display === 'granted') return true;
    return (await plugin.requestPermissions()).display === 'granted';
  }

  async schedule(at: Date, text: NotificationText): Promise<void> {
    const plugin = (await this.load()).LocalNotifications;
    await plugin.cancel({ notifications: [{ id: ALERT_ID }] });
    await plugin.schedule({
      notifications: [{ id: ALERT_ID, ...text, schedule: { at, allowWhileIdle: true } }],
    });
  }

  async showNow(text: NotificationText): Promise<void> {
    const plugin = (await this.load()).LocalNotifications;
    await plugin.cancel({ notifications: [{ id: ALERT_ID }] });
    await plugin.schedule({ notifications: [{ id: ALERT_ID, ...text }] });
  }

  async cancel(): Promise<void> {
    const plugin = (await this.load()).LocalNotifications;
    await plugin.cancel({ notifications: [{ id: ALERT_ID }] });
  }

  /**
   * Se devuelve el módulo y no el plugin: el plugin es un proxy de Capacitor y
   * devolverlo desde una función async haría que se le pidiera `.then()`.
   */
  private load() {
    return import('@capacitor/local-notifications');
  }
}
