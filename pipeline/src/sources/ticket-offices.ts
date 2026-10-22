import type { RawPlace } from '../build/build-places.ts';
import { geoJsonPoints } from './geojson-points.ts';

/**
 * Puntos de venta y recarga de la tarjeta de la EMT. La fuente solo trae la
 * dirección (con "_" donde iría la coma) y un código de tipo sin explicar, que
 * no se publica.
 */
export function parseTicketOffices(geojson: unknown): RawPlace[] {
  return geoJsonPoints(geojson).flatMap(({ point, props }): RawPlace[] => {
    const id = props['serial'] ?? props['id'];
    if (!id) return [];
    const address = props['domicilio']?.replace(/\s*_\s*/g, ', ');
    return [{ id, point, address }];
  });
}
