import { Injectable } from '@angular/core';

/** Texto de una notificación. */
export interface NotificationText {
  readonly title: string;
  readonly body: string;
}

/**
 * Notificaciones del sistema para los avisos de llegada. Abstracto para no
 * atar el núcleo a Capacitor (y falsearlo en pruebas). Si nadie lo configura
 * (web, pruebas), no hay avisos.
 */
@Injectable({ providedIn: 'root', useFactory: () => new NoArrivalNotifier() })
export abstract class ArrivalNotifier {
  abstract readonly available: boolean;
  /** Pide permiso para notificar; false si el usuario lo deniega. */
  abstract requestPermission(): Promise<boolean>;
  /** Programa (o reprograma) el único aviso de la app para `at`. */
  abstract schedule(at: Date, text: NotificationText): Promise<void>;
  /** Muestra el aviso ya y anula el programado. */
  abstract showNow(text: NotificationText): Promise<void>;
  abstract cancel(): Promise<void>;
}

class NoArrivalNotifier extends ArrivalNotifier {
  readonly available = false;
  requestPermission(): Promise<boolean> {
    return Promise.resolve(false);
  }
  schedule(): Promise<void> {
    return Promise.resolve();
  }
  showNow(): Promise<void> {
    return Promise.resolve();
  }
  cancel(): Promise<void> {
    return Promise.resolve();
  }
}
