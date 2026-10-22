import { PLACES, SOURCES } from '../config.ts';
import type { Manifest, PlaceKind, PlaceLayer, PlacesFile } from '../output-schema.ts';
import { parseAcousticSignals } from '../sources/acoustic-signals.ts';
import { parseBikeParking } from '../sources/bike-parking.ts';
import { parseDefibrillators } from '../sources/defibrillators.ts';
import { download } from '../sources/fetch.ts';
import { type OsmPoint, osmPointsQuery, parseOsmPoints } from '../sources/osm-points.ts';
import { parseTicketOffices } from '../sources/ticket-offices.ts';
import {
  type RawPlace,
  buildLayer,
  matchShelters,
  mergeSignals,
  placesFile,
} from './build-places.ts';
import { walkBbox } from './build-walk-graph.ts';

type Fetch = (url: string) => Promise<{ bytes: Uint8Array; lastModified: string | null }>;
type Source = (typeof SOURCES)[keyof typeof SOURCES];

export interface ResolvedPlaces {
  file: PlacesFile;
  sources: Manifest['sources'];
  /** Capas reutilizadas de la publicación anterior. */
  reused: PlaceKind[];
}

/** Capas del Ayuntamiento: se descargan en cada ejecución (son pequeñas). */
const AYTO_LAYERS: { kind: PlaceKind; source: Source; parse: (json: unknown) => RawPlace[] }[] = [
  { kind: 'defibrillator', source: SOURCES.defibrillators, parse: parseDefibrillators },
  { kind: 'ticketOffice', source: SOURCES.ticketOffices, parse: parseTicketOffices },
  { kind: 'bikeParking', source: SOURCES.bikeParking, parse: parseBikeParking },
];

/**
 * Capas de puntos del mapa (ADR 0021). Cada capa es independiente: si su
 * fuente falla o sale demasiado pequeña, se mantiene la de la publicación
 * anterior y, si no la hay, se publica sin ella. Semáforos y marquesinas vienen
 * de OpenStreetMap y, como la red peatonal, se renuevan como mucho cada semana.
 * Devuelve null si no hay ninguna capa.
 */
export async function resolvePlaces(
  previous: PlacesFile | null,
  stops: readonly { id: string; lat: number; lon: number; mode?: string }[],
  now: Date,
  fetchFn: Fetch = download,
): Promise<ResolvedPlaces | null> {
  const builtAt = now.toISOString();
  const old = new Map((previous?.layers ?? []).map((layer) => [layer.kind, layer]));
  const layers: PlaceLayer[] = [];
  const sources: Manifest['sources'] = [];
  const reused: PlaceKind[] = [];
  const keepOld = (kind: PlaceKind, reason: unknown) => {
    console.warn(`Sin capa ${kind} nueva:`, reason instanceof Error ? reason.message : reason);
    const layer = old.get(kind);
    if (!layer) return;
    layers.push(layer);
    reused.push(kind);
  };
  const tryLayer = (kind: PlaceKind, places: () => RawPlace[], names: string[]) => {
    try {
      layers.push(buildLayer(kind, names, places(), builtAt));
    } catch (error) {
      keepOld(kind, error);
    }
  };

  for (const { kind, source, parse } of AYTO_LAYERS) {
    try {
      const raw = await fetchFn(source.url);
      layers.push(buildLayer(kind, [source.name], parse(decodeJson(raw.bytes)), builtAt));
      sources.push({ ...source, lastModified: raw.lastModified });
    } catch (error) {
      keepOld(kind, error);
    }
  }

  const oldSignals = old.get('trafficLight');
  const oldShelters = old.get('shelter');
  const fresh = (layer: PlaceLayer | undefined) =>
    layer && (now.getTime() - Date.parse(layer.builtAt)) / 86_400_000 < PLACES.osmMaxAgeDays;
  if (fresh(oldSignals) && fresh(oldShelters)) {
    layers.push(oldSignals!, oldShelters!);
    reused.push('trafficLight', 'shelter');
  } else {
    let osm: OsmPoint[] | null = null;
    try {
      const query = osmPointsQuery(walkBbox(stops));
      const raw = await fetchFn(`${SOURCES.osmPoints.url}?data=${encodeURIComponent(query)}`);
      osm = parseOsmPoints(decodeJson(raw.bytes));
      sources.push({ ...SOURCES.osmPoints, lastModified: builtAt });
    } catch (error) {
      keepOld('trafficLight', error);
      keepOld('shelter', error);
    }
    if (osm) {
      try {
        const acousticRaw = await fetchFn(SOURCES.acousticSignals.url);
        const acoustic = parseAcousticSignals(decodeJson(acousticRaw.bytes));
        layers.push(
          buildLayer(
            'trafficLight',
            [SOURCES.osmPoints.name, SOURCES.acousticSignals.name],
            mergeSignals(osm, acoustic),
            builtAt,
          ),
        );
        sources.push({ ...SOURCES.acousticSignals, lastModified: acousticRaw.lastModified });
      } catch (error) {
        // Sin los acústicos se mantiene la capa anterior, que sí los tenía; sin ella,
        // se publican los semáforos de OpenStreetMap solos.
        if (oldSignals) keepOld('trafficLight', error);
        else tryLayer('trafficLight', () => mergeSignals(osm, []), [SOURCES.osmPoints.name]);
      }
      const busStops = stops.filter((stop) => !stop.mode);
      tryLayer('shelter', () => matchShelters(osm, busStops), [SOURCES.osmPoints.name]);
    }
  }

  if (layers.length === 0) return null;
  return { file: placesFile(layers), sources, reused };
}

function decodeJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(bytes));
}
