import type { LatLon } from '../build/geometry.ts';

/** Punto de un GeoJSON del Ayuntamiento con sus propiedades como texto limpio. */
export interface GeoJsonPoint {
  point: LatLon;
  /** Propiedades con la clave en minúsculas: el portal mezcla "ID" e "id" según el fichero. */
  props: Record<string, string>;
}

/**
 * Puntos de un GeoJSON (FeatureCollection). Ignora geometrías que no sean
 * puntos o sin coordenadas válidas; la tercera coordenada, si la hay, se
 * descarta (en algunos ficheros del portal no es una altura).
 */
export function geoJsonPoints(geojson: unknown): GeoJsonPoint[] {
  const features =
    typeof geojson === 'object' &&
    geojson !== null &&
    Array.isArray((geojson as { features?: unknown }).features)
      ? (geojson as { features: unknown[] }).features
      : [];
  return features.flatMap((feature): GeoJsonPoint[] => {
    if (typeof feature !== 'object' || feature === null) return [];
    const { properties, geometry } = feature as {
      properties?: Record<string, unknown> | null;
      geometry?: { type?: string; coordinates?: unknown } | null;
    };
    if (geometry?.type !== 'Point' || !Array.isArray(geometry.coordinates)) return [];
    const [lon, lat] = geometry.coordinates.map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const props: Record<string, string> = {};
    for (const [key, value] of Object.entries(properties ?? {})) {
      const text = clean(value);
      if (text) props[key.toLowerCase()] = text;
    }
    return [{ point: [lat!, lon!], props }];
  });
}

function clean(value: unknown): string {
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}
