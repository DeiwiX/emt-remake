import type { RawPlace } from '../build/build-places.ts';
import { geoJsonPoints } from './geojson-points.ts';

/**
 * Desfibriladores del Ayuntamiento. Se quitan los que van dentro de los
 * autobuses de la EMT (titularidad "EMT"): no tienen un sitio fijo en el mapa.
 * No se publican teléfonos ni correos: algunos son de particulares.
 */
export function parseDefibrillators(geojson: unknown): RawPlace[] {
  return geoJsonPoints(geojson).flatMap(({ point, props }): RawPlace[] => {
    if (props['titularidad']?.toUpperCase() === 'EMT') return [];
    const id = props['id'];
    if (!id) return [];
    return [
      {
        id,
        point,
        name: props['descripcion'],
        address: props['direccion'],
        hours: props['horarios'],
        tags: props['veinticuatrohoras']?.toLowerCase() === 'si' ? ['24h'] : undefined,
      },
    ];
  });
}
