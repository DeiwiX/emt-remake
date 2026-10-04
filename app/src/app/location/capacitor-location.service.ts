import { Injectable, signal } from '@angular/core';

import { LocationService, LocationState } from '../core/location/location.service';

/** Tiempo máximo afinando la posición: después se queda con la mejor recibida. */
const REFINE_MS = 10_000;
/** Con esta precisión (en metros) ya no merece la pena seguir esperando. */
const GOOD_ACCURACY_M = 25;
/** Si en este tiempo no llega ninguna posición, se da por no disponible. */
const FIRST_FIX_TIMEOUT_MS = 20_000;

/**
 * Adaptador con @capacitor/geolocation: en Android e iOS pide el permiso del
 * sistema; en la web usa la geolocalización del navegador.
 *
 * La primera posición suele ser la menos precisa (red móvil o wifi), así que se
 * escuchan las posiciones durante unos segundos y se publica cada una que
 * mejora la anterior: la lista aparece enseguida y se corrige sola. locate()
 * termina con la primera posición (o el error); la mejora sigue en segundo plano.
 */
@Injectable()
export class CapacitorLocationService extends LocationService {
  private readonly stateSignal = signal<LocationState>({ status: 'idle' });
  readonly state = this.stateSignal.asReadonly();
  /** Cancela la escucha en curso (si se pide otra vez la ubicación). */
  private stopCurrent: (() => void) | null = null;

  async locate(): Promise<void> {
    this.stopCurrent?.();
    this.stateSignal.set({ status: 'locating' });
    try {
      // Se cargan al pedir la ubicación por primera vez: no pesan en el arranque.
      const [{ Capacitor }, { Geolocation }] = await Promise.all([
        import('@capacitor/core'),
        import('@capacitor/geolocation'),
      ]);
      // En Android el usuario puede conceder solo la ubicación aproximada: también vale.
      let precise = true;
      if (Capacitor.isNativePlatform()) {
        let permission = await Geolocation.checkPermissions();
        if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
          permission = await Geolocation.requestPermissions({
            permissions: ['location', 'coarseLocation'],
          });
        }
        if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
          this.stateSignal.set({ status: 'denied' });
          return;
        }
        precise = permission.location === 'granted';
      }

      await new Promise<void>((firstFix) => {
        let best = Infinity;
        let watchId: string | null = null;
        let done = false;
        const finish = (failure?: LocationState) => {
          if (done) return;
          done = true;
          clearTimeout(refineTimer);
          clearTimeout(firstFixTimer);
          if (watchId) void Geolocation.clearWatch({ id: watchId });
          if (failure) this.stateSignal.set(failure);
          this.stopCurrent = null;
          firstFix();
        };
        this.stopCurrent = () => finish();
        const refineTimer = setTimeout(() => finish(), REFINE_MS);
        const firstFixTimer = setTimeout(() => {
          if (best === Infinity) finish({ status: 'unavailable' });
        }, FIRST_FIX_TIMEOUT_MS);

        void Geolocation.watchPosition(
          { enableHighAccuracy: precise, timeout: FIRST_FIX_TIMEOUT_MS, maximumAge: 0 },
          (position, error) => {
            if (done) return;
            if (!position) {
              // Un error sin ninguna posición aún es definitivo; con alguna, se ignora.
              if (error && best === Infinity) {
                finish({ status: isPermissionError(error) ? 'denied' : 'unavailable' });
              }
              return;
            }
            const accuracy = position.coords.accuracy;
            if (accuracy >= best) return;
            best = accuracy;
            firstFix();
            this.stateSignal.set({
              status: 'ready',
              point: [position.coords.latitude, position.coords.longitude],
              accuracy,
              at: new Date(position.timestamp),
            });
            if (accuracy <= GOOD_ACCURACY_M) finish();
          },
        ).then((id) => {
          watchId = id;
          if (done) void Geolocation.clearWatch({ id });
        });
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
