import type { RawPlace } from '../build/build-places.ts';
import { geoJsonPoints } from './geojson-points.ts';

/**
 * Semáforos acústicos del Ayuntamiento (el portal no publica los demás). El
 * nombre ("SEMAFOROACUSTICO_07.04") es interno: se usa la descripción del cruce.
 */
export function parseAcousticSignals(geojson: unknown): RawPlace[] {
  return geoJsonPoints(geojson).flatMap(({ point, props }): RawPlace[] => {
    const id = props['id'];
    if (!id) return [];
    return [
      {
        id: `ayto-${id}`,
        point,
        name: props['descripcion'],
        address: props['direccion'],
        tags: ['acoustic'],
      },
    ];
  });
}
