import type { LatLon } from '../build/geometry.ts';

/** Vía de OpenStreetMap por la que se puede andar: sus puntos en orden. */
export interface RawWalkWay {
  readonly points: LatLon[];
  /** Identificadores de nodo de OSM, alineados con `points` (para unir vías). */
  readonly nodeIds: number[];
  /** Escaleras: se recorren más despacio. */
  readonly steps: boolean;
}

/** Zona de la consulta: [sur, oeste, norte, este]. */
export type Bbox = readonly [number, number, number, number];

/**
 * Consulta Overpass de las vías por las que se puede andar: todas las de la
 * clave `highway` menos autopistas, autovías y vías no construidas, y sin las
 * que prohíben el paso a pie o son privadas.
 */
export function walkQuery(bbox: Bbox): string {
  const excluded =
    'motorway|motorway_link|trunk|trunk_link|construction|proposed|raceway|bus_guideway|platform|corridor|elevator|abandoned';
  return (
    `[out:json][timeout:180];` +
    `way["highway"]["highway"!~"^(${excluded})$"]["foot"!~"^(no|private)$"]["access"!~"^(private|no)$"](${bbox.join(',')});` +
    `out body qt;>;out skel qt;`
  );
}

interface OsmElement {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  nodes?: unknown;
  tags?: { highway?: unknown };
}

/** Lee la respuesta de Overpass (formato JSON). Ignora elementos incompletos. */
export function parseOsmWalk(json: unknown): RawWalkWay[] {
  const elements = (json as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) throw new Error('Respuesta de Overpass sin "elements"');
  const nodes = new Map<number, LatLon>();
  for (const element of elements as OsmElement[]) {
    if (
      element?.type === 'node' &&
      typeof element.id === 'number' &&
      typeof element.lat === 'number' &&
      typeof element.lon === 'number'
    ) {
      nodes.set(element.id, [element.lat, element.lon]);
    }
  }
  const ways: RawWalkWay[] = [];
  for (const element of elements as OsmElement[]) {
    if (element?.type !== 'way' || !Array.isArray(element.nodes)) continue;
    const nodeIds = (element.nodes as unknown[]).filter(
      (id): id is number => typeof id === 'number' && nodes.has(id),
    );
    if (nodeIds.length < 2) continue;
    ways.push({
      nodeIds,
      points: nodeIds.map((id) => nodes.get(id)!),
      steps: element.tags?.highway === 'steps',
    });
  }
  return ways;
}
