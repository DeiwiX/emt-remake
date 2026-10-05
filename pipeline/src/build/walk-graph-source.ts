import { SOURCES, WALK_GRAPH_MAX_AGE_DAYS, WALK_GRAPH_MIN_EDGES } from '../config.ts';
import type { WalkGraphFile } from '../output-schema.ts';
import { download } from '../sources/fetch.ts';
import { parseOsmWalk, walkQuery } from '../sources/osm-walk.ts';
import { buildWalkGraph, walkBbox } from './build-walk-graph.ts';

export interface ResolvedWalkGraph {
  /** El fichero tal como se publica. */
  content: string;
  builtAt: string;
  edges: number;
  /** true si es la publicación anterior (reciente, o porque la descarga falló). */
  reused: boolean;
}

type Fetch = (url: string) => Promise<{ bytes: Uint8Array }>;

/**
 * Red peatonal que se publica: la anterior si tiene menos de una semana (no hay
 * que consultar OpenStreetMap cada hora); si no, una nueva desde Overpass. Si la
 * descarga falla o sale demasiado pequeña, se mantiene la anterior; sin ninguna,
 * se publica sin red peatonal (la app sigue con distancias en línea recta).
 */
export async function resolveWalkGraph(
  previous: string | null,
  stops: readonly { lat: number; lon: number }[],
  now: Date,
  fetchFn: Fetch = download,
): Promise<ResolvedWalkGraph | null> {
  const old = readPrevious(previous);
  const ageDays = old ? (now.getTime() - Date.parse(old.file.builtAt)) / 86_400_000 : Infinity;
  if (old && ageDays < WALK_GRAPH_MAX_AGE_DAYS) return old.resolved;
  try {
    const url = `${SOURCES.osmWalk.url}?data=${encodeURIComponent(walkQuery(walkBbox(stops)))}`;
    const raw = await fetchFn(url);
    const graph = buildWalkGraph(
      parseOsmWalk(JSON.parse(new TextDecoder().decode(raw.bytes))),
      now,
    );
    if (graph.edges.length < WALK_GRAPH_MIN_EDGES) {
      throw new Error(`Red peatonal demasiado pequeña (${graph.edges.length} tramos)`);
    }
    return {
      content: JSON.stringify(graph),
      builtAt: graph.builtAt,
      edges: graph.edges.length,
      reused: false,
    };
  } catch (error) {
    console.warn(
      'Sin red peatonal nueva de OpenStreetMap:',
      error instanceof Error ? error.message : error,
    );
    return old?.resolved ?? null;
  }
}

function readPrevious(
  previous: string | null,
): { file: WalkGraphFile; resolved: ResolvedWalkGraph } | null {
  if (!previous) return null;
  try {
    const file = JSON.parse(previous) as WalkGraphFile;
    if (typeof file.builtAt !== 'string' || !Array.isArray(file.edges)) return null;
    if (Number.isNaN(Date.parse(file.builtAt))) return null;
    return {
      file,
      resolved: {
        content: previous,
        builtAt: file.builtAt,
        edges: file.edges.length,
        reused: true,
      },
    };
  } catch {
    return null;
  }
}
