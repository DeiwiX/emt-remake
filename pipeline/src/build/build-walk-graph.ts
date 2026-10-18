import { SCHEMA_VERSION } from '../config.ts';
import type { WalkGraphFile } from '../output-schema.ts';
import type { RawWalkWay } from '../sources/osm-walk.ts';
import { type LatLon, distanceM, encodePolyline, simplify } from './geometry.ts';

/** Tolerancia al simplificar el dibujo de cada tramo, en metros. */
export const WALK_SIMPLIFY_M = 3;
/** Las escaleras cuentan como si fueran más largas (se sube y baja más despacio). */
export const STEPS_FACTOR = 1.5;

/**
 * Red peatonal para calcular rutas andando en la app (opción 2B). Los nodos son
 * los cruces y los extremos de las vías; cada arista es un tramo de calle entre
 * dos nodos, con su coste en metros y, si no es recto, su dibujo simplificado.
 * Solo se publica la parte conectada más grande: así nadie queda "enganchado"
 * a un trozo aislado (un patio, un paseo sin salida en los datos).
 */
export function buildWalkGraph(ways: RawWalkWay[], builtAt: Date): WalkGraphFile {
  // Un punto de OSM es nodo de la red si es extremo de una vía o lo comparten varias.
  const uses = new Map<number, number>();
  for (const way of ways) {
    way.nodeIds.forEach((id, i) => {
      const end = i === 0 || i === way.nodeIds.length - 1;
      uses.set(id, (uses.get(id) ?? 0) + (end ? 2 : 1));
    });
  }
  const index = new Map<number, number>();
  const points: LatLon[] = [];
  const nodeOf = (id: number, point: LatLon): number => {
    let i = index.get(id);
    if (i === undefined) {
      i = points.length;
      index.set(id, i);
      points.push(point);
    }
    return i;
  };

  type Edge = { a: number; b: number; cost: number; shape: LatLon[] };
  const edges: Edge[] = [];
  const seen = new Set<string>();
  for (const way of ways) {
    let start = 0;
    for (let i = 1; i < way.nodeIds.length; i++) {
      if (i < way.nodeIds.length - 1 && (uses.get(way.nodeIds[i]!) ?? 0) < 2) continue;
      const shape = way.points.slice(start, i + 1);
      let metres = 0;
      for (let k = 1; k < shape.length; k++) metres += distanceM(shape[k - 1]!, shape[k]!);
      const a = nodeOf(way.nodeIds[start]!, shape[0]!);
      const b = nodeOf(way.nodeIds[i]!, shape.at(-1)!);
      start = i;
      if (a === b) continue;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a, b, cost: metres * (way.steps ? STEPS_FACTOR : 1), shape });
    }
  }

  // Parte conectada más grande (unión por rangos).
  const parent = points.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  for (const edge of edges) parent[find(edge.a)] = find(edge.b);
  const size = new Map<number, number>();
  for (let i = 0; i < points.length; i++) size.set(find(i), (size.get(find(i)) ?? 0) + 1);
  let main = -1;
  for (const [root, count] of size) if (main === -1 || count > size.get(main)!) main = root;

  // Renumeración compacta de los nodos que quedan.
  const renumber = new Map<number, number>();
  const kept: LatLon[] = [];
  for (let i = 0; i < points.length; i++) {
    if (find(i) !== main) continue;
    renumber.set(i, kept.length);
    kept.push(points[i]!);
  }
  const published: WalkGraphFile['edges'] = [];
  for (const edge of edges) {
    if (find(edge.a) !== main) continue;
    const a = renumber.get(edge.a)!;
    const b = renumber.get(edge.b)!;
    const cost = Math.max(1, Math.round(edge.cost));
    const inner = simplify(edge.shape, WALK_SIMPLIFY_M).slice(1, -1);
    published.push(inner.length > 0 ? [a, b, cost, encodePolyline(inner)] : [a, b, cost]);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    builtAt: builtAt.toISOString(),
    nodes: encodePolyline(kept),
    edges: published,
  };
}

/** Zona de la red peatonal: la de las paradas con un margen de ~1 km. */
export function walkBbox(stops: readonly { lat: number; lon: number }[]) {
  const margin = 0.01;
  const lats = stops.map((s) => s.lat);
  const lons = stops.map((s) => s.lon);
  return [
    Math.min(...lats) - margin,
    Math.min(...lons) - margin,
    Math.max(...lats) + margin,
    Math.max(...lons) + margin,
  ].map((v) => Math.round(v * 1e4) / 1e4) as [number, number, number, number];
}
