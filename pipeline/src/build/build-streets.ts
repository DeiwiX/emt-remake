import { SCHEMA_VERSION } from '../config.ts';
import type { StreetsFile } from '../output-schema.ts';
import type { RawStreet } from '../sources/streets.ts';
import { type LatLon, distanceM, encodePolyline } from './geometry.ts';

/**
 * Separación mínima entre los portales que se publican de una misma calle. Con
 * ella "Calle Larios 5" se sitúa a unos 40 m como mucho, y el fichero pesa
 * una fracción de los ~100.000 portales del callejero.
 */
export const STREET_POINT_SPACING_M = 40;

/**
 * Calles para buscar origen y destino: nombre y una muestra de sus portales
 * (número y posición). Las vías sin portales no se pueden situar y se omiten.
 */
export function buildStreets(streets: RawStreet[]): StreetsFile {
  const published = streets
    .filter((street) => street.portals.length > 0)
    .map((street) => {
      const kept: { number: number; point: LatLon }[] = [];
      for (const portal of [...street.portals].sort((a, b) => a.number - b.number)) {
        if (kept.every((k) => distanceM(k.point, portal.point) >= STREET_POINT_SPACING_M)) {
          kept.push(portal);
        }
      }
      return {
        id: street.id,
        name: street.name,
        points: encodePolyline(kept.map((k) => k.point)),
        numbers: kept.map((k) => k.number),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return { schemaVersion: SCHEMA_VERSION, streets: published };
}
