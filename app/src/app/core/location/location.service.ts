import { Signal } from '@angular/core';

import { LatLon } from '../models/network.model';

/** Estado de la ubicación del usuario. */
export type LocationState =
  | { readonly status: 'idle' }
  | { readonly status: 'locating' }
  /** El usuario no ha dado permiso (o lo ha quitado). */
  | { readonly status: 'denied' }
  /** No se pudo obtener: sin GPS, sin señal o tiempo agotado. */
  | { readonly status: 'unavailable' }
  | {
      readonly status: 'ready';
      readonly point: LatLon;
      readonly accuracy: number;
      readonly at: Date;
    };

/**
 * Ubicación del usuario (Fase 2). Solo se pide cuando el usuario lo solicita
 * y con la app abierta; nunca sale del dispositivo (ADR 0006).
 */
export abstract class LocationService {
  abstract readonly state: Signal<LocationState>;
  /** Pide la posición actual (y el permiso, si hace falta). */
  abstract locate(): Promise<void>;
  /**
   * true si el usuario ya dio permiso de ubicación (no pregunta nada). Así los
   * mapas muestran tu posición al abrirse sin lanzar el aviso del sistema.
   */
  hasPermission(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
