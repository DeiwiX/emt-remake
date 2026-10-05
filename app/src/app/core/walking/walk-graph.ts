import { metresBetween } from '../location/geo';
import { LatLon } from '../models/network.model';

/**
 * Rutas andando por las calles (opción 2B) sobre la red peatonal de
 * OpenStreetMap que publica el script de datos. Lógica pura.
 *
 * Los puntos (una dirección, tu ubicación, una parada) se enganchan al cruce
 * más cercano de la red; la distancia de ese enganche se suma en línea recta.
 */

/** Tramo de calle entre dos nodos, con su dibujo intermedio si no es recto. */
export interface WalkEdge {
  readonly a: number;
  readonly b: number;
  /** Coste en metros (las escaleras cuentan algo más). */
  readonly cost: number;
  readonly shape?: readonly LatLon[];
}

/** Ruta calculada: metros y dibujo desde el origen hasta el destino. */
export interface WalkPath {
  readonly metres: number;
  readonly points: readonly LatLon[];
}

/** Lado de la celda de la rejilla de búsqueda, en grados (~200 m). */
const CELL_DEG = 0.002;
/** Como mucho se engancha a un cruce a esta distancia; más lejos no hay calle conocida. */
export const MAX_SNAP_METRES = 300;

export class WalkGraph {
  private readonly offsets: Int32Array;
  private readonly targets: Int32Array;
  private readonly costs: Float64Array;
  /** Tramo de cada arista dirigida (índice en `edges`) y si se recorre al revés. */
  private readonly edgeOf: Int32Array;
  private readonly grid = new Map<string, number[]>();

  constructor(
    private readonly nodes: readonly LatLon[],
    private readonly edges: readonly WalkEdge[],
  ) {
    const degree = new Int32Array(nodes.length + 1);
    for (const edge of edges) {
      degree[edge.a + 1]!++;
      degree[edge.b + 1]!++;
    }
    for (let i = 1; i <= nodes.length; i++) degree[i]! += degree[i - 1]!;
    this.offsets = degree;
    const fill = degree.slice(0, nodes.length);
    this.targets = new Int32Array(edges.length * 2);
    this.costs = new Float64Array(edges.length * 2);
    this.edgeOf = new Int32Array(edges.length * 2);
    edges.forEach((edge, e) => {
      for (const [from, to, sign] of [
        [edge.a, edge.b, 1],
        [edge.b, edge.a, -1],
      ] as const) {
        const slot = fill[from]!++;
        this.targets[slot] = to;
        this.costs[slot] = edge.cost;
        // Se guarda e+1 con signo: negativo si el tramo se recorre de b hacia a.
        this.edgeOf[slot] = sign * (e + 1);
      }
    });
    nodes.forEach((point, i) => {
      const key = cellKey(point);
      const cell = this.grid.get(key);
      if (cell) cell.push(i);
      else this.grid.set(key, [i]);
    });
  }

  get size(): number {
    return this.nodes.length;
  }

  /** Cruce más cercano a un punto (null si no hay ninguno a menos de 300 m). */
  nearest(point: LatLon): { node: number; metres: number } | null {
    const [ci, cj] = cell(point);
    const reach = Math.ceil(MAX_SNAP_METRES / 111_000 / CELL_DEG);
    let best: { node: number; metres: number } | null = null;
    for (let di = -reach; di <= reach; di++) {
      for (let dj = -reach; dj <= reach; dj++) {
        for (const node of this.grid.get(`${ci + di}:${cj + dj}`) ?? []) {
          const metres = metresBetween(point, this.nodes[node]!);
          if (metres <= MAX_SNAP_METRES && (!best || metres < best.metres)) {
            best = { node, metres };
          }
        }
      }
    }
    return best;
  }

  /**
   * Distancias andando desde un punto a todo lo que esté a menos de `maxMetres`
   * (Dijkstra acotado). Con el resultado se miden muchas paradas de una vez.
   */
  from(origin: LatLon, maxMetres: number): WalkTree | null {
    const start = this.nearest(origin);
    if (!start) return null;
    const dist = new Map<number, number>([[start.node, start.metres]]);
    const prev = new Map<number, number>();
    const heap = new MinHeap();
    heap.push(start.node, start.metres);
    const done = new Set<number>();
    while (heap.size > 0) {
      const { id: node, key: d } = heap.pop()!;
      if (done.has(node)) continue;
      done.add(node);
      for (let slot = this.offsets[node]!; slot < this.offsets[node + 1]!; slot++) {
        const next = this.targets[slot]!;
        const nd = d + this.costs[slot]!;
        if (nd > maxMetres || nd >= (dist.get(next) ?? Infinity)) continue;
        dist.set(next, nd);
        prev.set(next, slot);
        heap.push(next, nd);
      }
    }
    return new WalkTree(this, origin, dist, prev);
  }

  /** Ruta andando entre dos puntos (null si alguno está lejos de toda calle o fuera de alcance). */
  route(from: LatLon, to: LatLon, maxMetres = 5_000): WalkPath | null {
    return this.from(from, maxMetres)?.pathTo(to) ?? null;
  }

  /** @internal Nodo de origen de la arista dirigida `slot`. */
  sourceOf(slot: number): number {
    let low = 0;
    let high = this.nodes.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (this.offsets[mid]! <= slot) low = mid;
      else high = mid - 1;
    }
    return low;
  }

  /** @internal Dibujo de la arista dirigida `slot`, sin su primer punto. */
  stepPoints(slot: number): LatLon[] {
    const signed = this.edgeOf[slot]!;
    const edge = this.edges[Math.abs(signed) - 1]!;
    const forward = signed > 0;
    const inner = edge.shape ? [...edge.shape] : [];
    const end = this.nodes[forward ? edge.b : edge.a]!;
    return forward ? [...inner, end] : [...inner.reverse(), end];
  }

  /** @internal */
  point(node: number): LatLon {
    return this.nodes[node]!;
  }
}

/** Resultado de `WalkGraph.from`: distancias y caminos desde un origen. */
export class WalkTree {
  constructor(
    private readonly graph: WalkGraph,
    private readonly origin: LatLon,
    private readonly dist: ReadonlyMap<number, number>,
    private readonly prev: ReadonlyMap<number, number>,
  ) {}

  /** Metros andando hasta un punto (null si no se llega dentro del límite). */
  metresTo(point: LatLon): number | null {
    const end = this.graph.nearest(point);
    if (!end) return null;
    const d = this.dist.get(end.node);
    return d === undefined ? null : d + end.metres;
  }

  /** Camino hasta un punto, del origen al destino. */
  pathTo(point: LatLon): WalkPath | null {
    const end = this.graph.nearest(point);
    if (!end) return null;
    const d = this.dist.get(end.node);
    if (d === undefined) return null;
    const pieces: LatLon[][] = [];
    let node = end.node;
    for (let slot = this.prev.get(node); slot !== undefined; slot = this.prev.get(node)) {
      pieces.push(this.graph.stepPoints(slot));
      node = this.graph.sourceOf(slot);
    }
    const points: LatLon[] = [this.origin, this.graph.point(node)];
    for (let i = pieces.length - 1; i >= 0; i--) points.push(...pieces[i]!);
    points.push(point);
    // Sin puntos repetidos (el origen o el destino pueden caer justo en un cruce).
    const unique = points.filter(
      (p, i) => i === 0 || p[0] !== points[i - 1]![0] || p[1] !== points[i - 1]![1],
    );
    return { metres: d + end.metres, points: unique };
  }
}

function cell(point: LatLon): [number, number] {
  return [Math.floor(point[0] / CELL_DEG), Math.floor(point[1] / CELL_DEG)];
}

function cellKey(point: LatLon): string {
  const [i, j] = cell(point);
  return `${i}:${j}`;
}

/** Montículo binario de mínimos para Dijkstra. */
class MinHeap {
  private readonly ids: number[] = [];
  private readonly keys: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  push(id: number, key: number): void {
    this.ids.push(id);
    this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent]! <= key) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): { id: number; key: number } | undefined {
    if (this.ids.length === 0) return undefined;
    const top = { id: this.ids[0]!, key: this.keys[0]! };
    const lastId = this.ids.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.ids.length > 0) {
      this.ids[0] = lastId;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.keys.length && this.keys[left]! < this.keys[smallest]!) smallest = left;
        if (right < this.keys.length && this.keys[right]! < this.keys[smallest]!) smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(i: number, j: number): void {
    [this.ids[i], this.ids[j]] = [this.ids[j]!, this.ids[i]!];
    [this.keys[i], this.keys[j]] = [this.keys[j]!, this.keys[i]!];
  }
}
