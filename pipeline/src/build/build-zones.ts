import { SCHEMA_VERSION, ZONE_SIMPLIFY_TOLERANCE_M, ZONE_STOP_MARGIN_M } from '../config.ts';
import type { PublishedStop, ZonesFile } from '../output-schema.ts';
import type { Polygon, RawZone } from '../sources/zones.ts';
import { type LatLon, encodePolyline, projectOntoLine, simplify } from './geometry.ts';

/** Grados de latitud por metro (aprox.), para ampliar las cajas con el margen. */
const DEGREES_PER_METRE = 1 / 111_000;

/**
 * Barrios y distritos para la búsqueda por zonas: contorno simplificado y
 * paradas que hay dentro o junto al borde.
 */
export function buildZones(zones: RawZone[], stops: PublishedStop[]): ZonesFile {
  const published = zones
    .map((zone) => ({
      id: zone.id,
      kind: zone.kind,
      name: zone.name,
      polygons: zone.polygons.map((polygon) =>
        polygon.map((ring) => encodePolyline(simplify(ring, ZONE_SIMPLIFY_TOLERANCE_M))),
      ),
      stopIds: stopsInZone(zone.polygons, stops),
    }))
    // Primero los distritos (zonas grandes) y después los barrios, por nombre.
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'es') : a.kind === 'district' ? -1 : 1));
  return { schemaVersion: SCHEMA_VERSION, zones: published };
}

export function stopsInZone(polygons: Polygon[], stops: PublishedStop[]): string[] {
  const rings = polygons.flat();
  const bounds = boundingBox(rings.flat(), ZONE_STOP_MARGIN_M * DEGREES_PER_METRE * 1.3);
  const candidates = stops.filter(
    (s) => s.lat >= bounds.minLat && s.lat <= bounds.maxLat && s.lon >= bounds.minLon && s.lon <= bounds.maxLon,
  );
  if (candidates.length === 0) return [];

  const points = candidates.map((s): LatLon => [s.lat, s.lon]);
  const nearBorder = new Array<boolean>(candidates.length).fill(false);
  for (const ring of rings) {
    if (ring.length < 2) continue;
    projectOntoLine(points, ring).forEach((projection, i) => {
      if (projection.distance <= ZONE_STOP_MARGIN_M) nearBorder[i] = true;
    });
  }
  return candidates
    .filter((_, i) => nearBorder[i] || polygons.some((polygon) => insidePolygon(points[i]!, polygon)))
    .map((s) => s.id);
}

/** Dentro del anillo exterior y fuera de los huecos. */
export function insidePolygon(point: LatLon, polygon: Polygon): boolean {
  const [outer, ...holes] = polygon;
  return !!outer && insideRing(point, outer) && !holes.some((hole) => insideRing(point, hole));
}

/** Algoritmo del rayo (par-impar). A escala de barrio basta trabajar en grados. */
function insideRing([lat, lon]: LatLon, ring: LatLon[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lonI] = ring[i]!;
    const [latJ, lonJ] = ring[j]!;
    if (latI > lat !== latJ > lat && lon < ((lonJ - lonI) * (lat - latI)) / (latJ - latI) + lonI) {
      inside = !inside;
    }
  }
  return inside;
}

function boundingBox(points: LatLon[], margin: number) {
  const lats = points.map((p) => p[0]);
  const lons = points.map((p) => p[1]);
  return {
    minLat: Math.min(...lats) - margin,
    maxLat: Math.max(...lats) + margin,
    minLon: Math.min(...lons) - margin,
    maxLon: Math.max(...lons) + margin,
  };
}
