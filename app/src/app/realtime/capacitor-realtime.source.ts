import { Injectable } from '@angular/core';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

import { RealtimeSource } from '../core/realtime/realtime.service';

/** "Ubicaciones de autobuses EMT en tiempo real" (datos abiertos del Ayuntamiento). */
const VEHICLES_URL =
  'https://datosabiertos.malaga.eu/recursos/transporte/EMT/EMTlineasUbicaciones/lineasyubicaciones.geojson';

/**
 * Descarga con el cliente HTTP nativo de Capacitor: el servidor no envía
 * cabeceras CORS, así que desde un navegador no se puede leer. En la web el
 * tiempo real no está disponible y la app usa solo el horario (decisión B1).
 */
@Injectable()
export class CapacitorRealtimeSource extends RealtimeSource {
  readonly available = Capacitor.isNativePlatform();

  async fetchVehicles(): Promise<unknown> {
    const response = await CapacitorHttp.get({ url: VEHICLES_URL, responseType: 'text' });
    if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
    // El servidor responde con Content-Type text/html: se interpreta aquí.
    return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  }
}
