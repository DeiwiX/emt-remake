import { Injectable } from '@angular/core';

import { LiveFeeds, RealtimeSource } from '../core/realtime/realtime.service';

/** Tiempo real oficial de la EMT (GTFS-RT): se renueva cada minuto, sin clave. */
export const GTFS_RT_BASE = 'https://gtfs.emtmalaga.es/GTFSRTapi/api';
export const VEHICLES_URL = `${GTFS_RT_BASE}/vehicleposition`;
export const TRIP_UPDATES_URL = `${GTFS_RT_BASE}/tripupdate`;

/**
 * Descarga con el cliente HTTP nativo de Capacitor: el servidor no envía
 * cabeceras CORS, así que desde un navegador no se puede leer. En la web el
 * tiempo real no está disponible y la app usa solo el horario (decisión B1).
 */
@Injectable()
export class CapacitorRealtimeSource extends RealtimeSource {
  /**
   * En la app nativa, Capacitor deja su objeto global antes de que arranque la web:
   * se consulta ahí para no cargar @capacitor/core en el paquete inicial.
   */
  readonly available =
    (
      globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }
    ).Capacitor?.isNativePlatform?.() ?? false;

  async fetchFeeds(): Promise<LiveFeeds> {
    // El lector de protobuf solo se carga en la app nativa, cuando hace falta.
    const [vehicles, trips, decode] = await Promise.all([
      download(VEHICLES_URL),
      download(TRIP_UPDATES_URL),
      import('./gtfs-rt-decode'),
    ]);
    return { vehicles: decode.decodeVehicles(vehicles), trips: decode.decodeTripUpdates(trips) };
  }
}

async function download(url: string): Promise<Uint8Array> {
  const { CapacitorHttp } = await import('@capacitor/core');
  const response = await CapacitorHttp.get({ url, responseType: 'arraybuffer' });
  if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
  // En Android e iOS el cuerpo binario llega en base64.
  const data: unknown = response.data;
  if (typeof data === 'string') return Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  throw new Error('Respuesta del tiempo real con un formato inesperado');
}
