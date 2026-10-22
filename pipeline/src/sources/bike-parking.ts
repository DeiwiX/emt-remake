import type { RawPlace } from '../build/build-places.ts';
import { geoJsonPoints } from './geojson-points.ts';

/** Aparcamientos de bicicletas del Ayuntamiento, con sus plazas si las publica. */
export function parseBikeParking(geojson: unknown): RawPlace[] {
  return geoJsonPoints(geojson).flatMap(({ point, props }): RawPlace[] => {
    const id = props['id'];
    if (!id) return [];
    const capacity = Number.parseInt(props['totalplazas'] ?? props['nroplazas'] ?? '', 10);
    return [
      {
        id,
        point,
        name: props['descripcion'],
        address: props['direccion'],
        capacity: capacity > 0 ? capacity : undefined,
      },
    ];
  });
}
