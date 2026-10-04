import { Injectable, signal } from '@angular/core';

import { LocationService, LocationState } from '../core/location/location.service';

/** Si en este tiempo no llega la posición, se da por no disponible. */
const TIMEOUT_MS = 15_000;
/** Una posición de hace menos de esto vale (evita esperar al GPS cada vez). */
const MAX_AGE_MS = 30_000;

/**
 * Adaptador con @capacitor/geolocation: en Android e iOS pide el permiso del
 * sistema; en la web usa la geolocalización del navegador.
 */
@Injectable()
export class CapacitorLocationService extends LocationService {
  private readonly stateSignal = signal<LocationState>({ status: 'idle' });
  readonly state = this.stateSignal.asReadonly();

  async locate(): Promise<void> {
    this.stateSignal.set({ status: 'locating' });
    try {
      // Se cargan al pedir la ubicación por primera vez: no pesan en el arranque.
      const [{ Capacitor }, { Geolocation }] = await Promise.all([
        import('@capacitor/core'),
        import('@capacitor/geolocation'),
      ]);
      if (Capacitor.isNativePlatform()) {
        let permission = await Geolocation.checkPermissions();
        if (permission.location !== 'granted') {
          permission = await Geolocation.requestPermissions({ permissions: ['location'] });
        }
        if (permission.location !== 'granted') {
          this.stateSignal.set({ status: 'denied' });
          return;
        }
      }
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: TIMEOUT_MS,
        maximumAge: MAX_AGE_MS,
      });
      this.stateSignal.set({
        status: 'ready',
        point: [position.coords.latitude, position.coords.longitude],
        accuracy: position.coords.accuracy,
        at: new Date(position.timestamp),
      });
    } catch (error) {
      this.stateSignal.set({ status: isPermissionError(error) ? 'denied' : 'unavailable' });
    }
  }
}

/** En la web el navegador devuelve el código 1 (PERMISSION_DENIED) si el usuario dice que no. */
function isPermissionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === 1 || (typeof message === 'string' && /denied|permission/i.test(message));
}
