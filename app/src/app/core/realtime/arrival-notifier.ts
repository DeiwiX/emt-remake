import { Injectable } from '@angular/core';

import { StopTrips } from './realtime';

/** Texto de una notificación. */
export interface NotificationText {
  readonly title: string;
  readonly body: string;
}

/**
 * Lo que necesita el seguimiento nativo ("Siguiendo tu bus", Fase 6) para
 * vigilar el autobús con la app cerrada. Los textos llevan "{minutes}" donde
 * va lo que falta.
 */
export interface TrackingRequest {
  /**
   * Viajes del sentido que pasan por la parada (ver stopTrips): con ellos el
   * servicio nativo encuentra en el feed de la EMT cuándo llega cada uno.
   */
  readonly patterns: StopTrips['patterns'];
  readonly trips: StopTrips['trips'];
  readonly minutesBefore: number;
  readonly tripId: string | null;
  readonly expectedAt: number;
  readonly notifyAt: number;
  readonly title: string;
  readonly body: string;
  readonly bodyNow: string;
  readonly trackingTitle: string;
  readonly trackingText: string;
  readonly trackingWaiting: string;
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
  /**
   * Programa (o reprograma) el único aviso de la app para `at`. Con `tracking`,
   * si el dispositivo puede, lo sigue también con la app cerrada.
   */
  abstract schedule(at: Date, text: NotificationText, tracking?: TrackingRequest): Promise<void>;
  /** Muestra el aviso ya y anula el programado. */
  abstract showNow(text: NotificationText, tracking?: TrackingRequest): Promise<void>;
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
