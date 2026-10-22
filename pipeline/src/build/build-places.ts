import { PLACES, SCHEMA_VERSION } from '../config.ts';
import type {
  PlaceKind,
  PlaceLayer,
  PlaceTag,
  PlacesFile,
  PublishedPlace,
} from '../output-schema.ts';
import type { OsmPoint } from '../sources/osm-points.ts';
import { type LatLon, distanceM } from './geometry.ts';

/** Punto de una capa tal como lo leen las fuentes, antes de publicarlo. */
export interface RawPlace {
  id: string;
  point: LatLon;
  name?: string | undefined;
  address?: string | undefined;
  hours?: string | undefined;
  capacity?: number | undefined;
  tags?: PlaceTag[] | undefined;
}

/** Capa lista para publicar: puntos ordenados, coordenadas con 5 decimales (~1 m) y sin campos vacíos. */
export function buildLayer(
  kind: PlaceKind,
  sources: string[],
  places: RawPlace[],
  builtAt: string,
): PlaceLayer {
  if (places.length < PLACES.minPlaces[kind]) {
    throw new Error(`Capa ${kind} demasiado pequeña (${places.length} puntos)`);
  }
  const unique = new Map(places.map((place) => [place.id, place]));
  return {
    kind,
    builtAt,
    sources,
    places: [...unique.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((place) => toPublished(place)),
  };
}

function toPublished({
  id,
  point,
  name,
  address,
  hours,
  capacity,
  tags,
}: RawPlace): PublishedPlace {
  const round = (value: number) => Math.round(value * 1e5) / 1e5;
  return {
    id,
    lat: round(point[0]),
    lon: round(point[1]),
    ...(name ? { name } : {}),
    ...(address ? { address } : {}),
    ...(hours ? { hours } : {}),
    ...(capacity ? { capacity } : {}),
    ...(tags?.length ? { tags } : {}),
  };
}

/**
 * Todos los semáforos (OpenStreetMap) con los acústicos del Ayuntamiento:
 * cada acústico marca al semáforo de OSM más cercano (a menos de
 * PLACES.acousticMatchM) y le da el nombre del cruce; si no hay ninguno cerca,
 * se añade él mismo, para no perder un acústico que falte en OSM.
 */
export function mergeSignals(osm: readonly OsmPoint[], acoustic: readonly RawPlace[]): RawPlace[] {
  const signals = new Map<string, RawPlace>(
    osm
      .filter((p) => p.kind === 'signal')
      .map((p) => [`osm-${p.id}`, { id: `osm-${p.id}`, point: p.point }]),
  );
  const osmSignals = [...signals.values()];
  for (const sound of acoustic) {
    const nearest = nearestWithin(sound.point, osmSignals, PLACES.acousticMatchM);
    // Dos acústicos junto al mismo nodo de OSM: el segundo se añade aparte.
    if (nearest && !signals.get(nearest.id)?.tags) {
      signals.set(nearest.id, { ...nearest, ...withoutPoint(sound), id: nearest.id });
    } else {
      signals.set(sound.id, sound);
    }
  }
  return [...signals.values()];
}

/**
 * Paradas de la EMT con marquesina según OpenStreetMap. Se casa cada parada de
 * OSM con la de la EMT de su misma "ref" (si está cerca) o, si no, con la más
 * cercana a menos de PLACES.shelterMatchM. El punto publicado es el de la
 * parada de la EMT y su id, el código de la parada.
 */
export function matchShelters(
  osm: readonly OsmPoint[],
  busStops: readonly { id: string; lat: number; lon: number }[],
): RawPlace[] {
  const stops = busStops.map((stop) => ({ id: stop.id, point: [stop.lat, stop.lon] as LatLon }));
  const byId = new Map(stops.map((stop) => [stop.id, stop]));
  const matched = new Map<string, RawPlace>();
  for (const shelter of osm.filter((p) => p.kind === 'shelter')) {
    const byRef = shelter.ref ? byId.get(shelter.ref) : undefined;
    const stop =
      byRef && distanceM(byRef.point, shelter.point) <= PLACES.shelterMatchM * 3
        ? byRef
        : nearestWithin(shelter.point, stops, PLACES.shelterMatchM);
    if (stop) matched.set(stop.id, stop);
  }
  return [...matched.values()];
}

export function placesFile(layers: PlaceLayer[]): PlacesFile {
  return { schemaVersion: SCHEMA_VERSION, layers };
}

function nearestWithin<T extends { point: LatLon }>(
  point: LatLon,
  candidates: readonly T[],
  maxM: number,
): T | null {
  let best: T | null = null;
  let bestM = maxM;
  for (const candidate of candidates) {
    const d = distanceM(point, candidate.point);
    if (d <= bestM) {
      best = candidate;
      bestM = d;
    }
  }
  return best;
}

function withoutPoint({ point: _point, ...rest }: RawPlace): Omit<RawPlace, 'point'> {
  return rest;
}
