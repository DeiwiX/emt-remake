import { Direction, Line, Stop } from '../models/network.model';
import { WALK_DETOUR, WALK_METRES_PER_MINUTE, metresBetween } from '../location/geo';

/**
 * Planificador "Cómo llegar" (versión con datos programados). Lógica pura, sin
 * Angular, para poder probarla de forma aislada.
 *
 * Busca viajes directos y con un transbordo en la misma parada. Los tiempos son
 * los del horario programado (o estimados por distancia si una línea no tiene
 * horario); no incluyen la espera en la parada de origen, que necesitará tiempo
 * real (Fase 3).
 */

/**
 * Origen o destino: una parada, una zona (barrio, distrito) con sus paradas o la
 * ubicación del usuario con las paradas cercanas.
 */
export interface Place {
  readonly kind: 'stop' | 'neighbourhood' | 'district' | 'location';
  readonly id: string;
  readonly name: string;
  readonly stopIds: readonly string[];
  /** Minutos andando desde el lugar hasta cada parada (solo "Mi ubicación"). */
  readonly accessMinutes?: ReadonlyMap<string, number>;
}

export interface Leg {
  readonly lineId: string;
  readonly directionId: number;
  readonly headsign: string;
  readonly fromStopId: string;
  readonly toStopId: string;
  /** Paradas que se recorren (sin contar la de subida). */
  readonly stopCount: number;
  readonly minutes: number;
  /** true si el tiempo es una estimación por distancia y no del horario. */
  readonly estimated: boolean;
}

export interface JourneyOption {
  readonly legs: readonly Leg[];
  /** Minutos andando hasta la primera parada (solo desde "Mi ubicación"; si no, 0). */
  readonly accessMinutes: number;
  /** Minutos andando hasta la primera parada, en el autobús, a pie entre paradas y el margen de cada transbordo. */
  readonly totalMinutes: number;
  /** Minutos andando entre la parada de bajada y la de subida del transbordo (0 si es la misma). */
  readonly walkMinutes: number;
}

export interface NearbyStop {
  readonly stopId: string;
  readonly metres: number;
}

export interface PlanOptions {
  /** Margen por transbordo: bajar, esperar el segundo autobús y subir. */
  readonly transferMinutes: number;
  readonly maxResults: number;
  /**
   * Líneas que se muestran al final aunque sean más rápidas (p. ej. nocturnas,
   * que no circulan de día). No se descartan: pueden ser la única opción.
   */
  readonly isSecondary: (lineId: string) => boolean;
  /** Paradas a las que se puede ir andando para hacer transbordo (ver buildNearbyStops). */
  readonly nearbyStops: (stopId: string) => readonly NearbyStop[];
}

const DEFAULT_OPTIONS: PlanOptions = {
  transferMinutes: 8,
  maxResults: 6,
  isSecondary: () => false,
  nearbyStops: () => [],
};
/** Distancia máxima a pie para un transbordo entre paradas distintas. */
export const MAX_TRANSFER_WALK_M = 250;
/** Si una línea no trae tiempos (datos antiguos), se supone esto por parada. */
const FALLBACK_MINUTES_PER_STOP = 1.5;

export function planJourneys(
  lines: readonly Line[],
  origin: Place,
  destination: Place,
  options: Partial<PlanOptions> = {},
): JourneyOption[] {
  const { transferMinutes, maxResults, isSecondary, nearbyStops } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  const from = new Set(origin.stopIds);
  const to = new Set(destination.stopIds);
  if (from.size === 0 || to.size === 0) return [];
  /** Minutos andando hasta una parada de origen (0 salvo desde "Mi ubicación"). */
  const access = (stopId: string) => origin.accessMinutes?.get(stopId) ?? 0;

  const directions = lines.flatMap((line) => line.directions.map((d) => ({ line, d })));
  const direct = directions.flatMap(({ line, d }) => {
    const leg = bestLeg(line, d, from, to, access);
    if (!leg) return [];
    const accessMinutes = access(leg.fromStopId);
    return [
      { legs: [leg], accessMinutes, totalMinutes: accessMinutes + leg.minutes, walkMinutes: 0 },
    ];
  });

  // Mejor primer tramo hasta cada posible parada de transbordo.
  const firstLegs = new Map<string, Leg[]>();
  for (const { line, d } of directions) {
    const boardings = indicesOf(d, from);
    if (boardings.length === 0) continue;
    const times = minutesOf(d);
    const first = boardings[0]!;
    for (let k = first + 1; k < d.stopIds.length; k++) {
      const stopId = d.stopIds[k]!;
      if (to.has(stopId) || from.has(stopId)) continue;
      // La parada de subida que antes deja aquí, contando lo que se tarda en llegar a ella.
      const board = boardings
        .filter((b) => b < k)
        .reduce((best, b) =>
          access(d.stopIds[b]!) - times[b]! < access(d.stopIds[best]!) - times[best]! ? b : best,
        );
      const leg = makeLeg(line, d, board, k, times);
      const list = firstLegs.get(stopId) ?? [];
      list.push(leg);
      firstLegs.set(stopId, list);
    }
  }

  const transfers = new Map<string, JourneyOption>();
  for (const { line, d } of directions) {
    const times = minutesOf(d);
    const arrivals = indicesOf(d, to);
    if (arrivals.length === 0) continue;
    for (let p = 0; p < d.stopIds.length; p++) {
      const arrival = arrivals.find((q) => q > p);
      if (arrival === undefined) continue;
      const boardingStop = d.stopIds[p]!;
      // Se puede bajar en la misma parada o en una cercana y caminar hasta esta.
      const candidates = [
        { stopId: boardingStop, metres: 0 },
        ...nearbyStops(boardingStop),
      ].flatMap(({ stopId, metres }) =>
        (firstLegs.get(stopId) ?? []).map((first) => ({ first, metres })),
      );
      if (candidates.length === 0) continue;
      const second = makeLeg(line, d, p, arrival, times);
      for (const { first, metres } of candidates) {
        if (first.lineId === line.id) continue;
        const walkMinutes = Math.ceil((metres * WALK_DETOUR) / WALK_METRES_PER_MINUTE);
        const accessMinutes = access(first.fromStopId);
        const total =
          accessMinutes + first.minutes + walkMinutes + transferMinutes + second.minutes;
        const key = `${first.lineId}>${line.id}`;
        const current = transfers.get(key);
        if (!current || total < current.totalMinutes) {
          transfers.set(key, {
            legs: [first, second],
            accessMinutes,
            totalMinutes: total,
            walkMinutes,
          });
        }
      }
    }
  }

  // Un transbordo solo compensa si una línea directa no hace lo mismo con la misma línea,
  // y no se repite una línea en varias combinaciones: así las opciones son distintas.
  const directLines = new Set(direct.map((o) => o.legs[0]!.lineId));
  const used = new Set<string>();
  const usefulTransfers = [...transfers.values()].sort(byTime).filter((o) => {
    const [first, second] = [o.legs[0]!.lineId, o.legs[1]!.lineId];
    if (directLines.has(first) || directLines.has(second) || used.has(first) || used.has(second)) {
      return false;
    }
    used.add(first);
    used.add(second);
    return true;
  });

  // Primero las directas (más cómodas) y después los transbordos, cada grupo por
  // tiempo; las opciones con líneas secundarias van al final de todo.
  const secondary = (o: JourneyOption) => o.legs.some((leg) => isSecondary(leg.lineId));
  const ordered = [...direct.sort(byTime), ...usefulTransfers];
  return [...ordered.filter((o) => !secondary(o)), ...ordered.filter(secondary)].slice(
    0,
    maxResults,
  );
}

/**
 * El tramo más corto de una línea entre alguna parada de origen y otra posterior
 * de destino, contando lo que se tarda andando hasta la parada de subida.
 */
function bestLeg(
  line: Line,
  d: Direction,
  from: ReadonlySet<string>,
  to: ReadonlySet<string>,
  access: (stopId: string) => number,
): Leg | null {
  const times = minutesOf(d);
  let best: Leg | null = null;
  let bestCost = Infinity;
  for (const i of indicesOf(d, from)) {
    const j = indicesOf(d, to).find((index) => index > i);
    if (j === undefined) continue;
    const leg = makeLeg(line, d, i, j, times);
    const cost = access(leg.fromStopId) + leg.minutes;
    if (cost < bestCost) {
      best = leg;
      bestCost = cost;
    }
  }
  return best;
}

function makeLeg(
  line: Line,
  d: Direction,
  from: number,
  to: number,
  times: readonly number[],
): Leg {
  return {
    lineId: line.id,
    directionId: d.id,
    headsign: d.headsign,
    fromStopId: d.stopIds[from]!,
    toStopId: d.stopIds[to]!,
    stopCount: to - from,
    minutes: Math.max(1, Math.round(times[to]! - times[from]!)),
    estimated: d.timesSource !== 'schedule',
  };
}

function minutesOf(d: Direction): readonly number[] {
  return d.minutes && d.minutes.length === d.stopIds.length
    ? d.minutes
    : d.stopIds.map((_, i) => i * FALLBACK_MINUTES_PER_STOP);
}

function indicesOf(d: Direction, stops: ReadonlySet<string>): number[] {
  return d.stopIds.flatMap((id, i) => (stops.has(id) ? [i] : []));
}

/**
 * Para cada parada, las que están a menos de `maxMetres` en línea recta. Se calcula
 * una vez por red (unas 1.100 paradas: ~600.000 comparaciones, pocos milisegundos).
 */
export function buildNearbyStops(
  stops: readonly Stop[],
  maxMetres = MAX_TRANSFER_WALK_M,
): (stopId: string) => readonly NearbyStop[] {
  const nearby = new Map<string, NearbyStop[]>();
  const add = (from: string, to: string, metres: number) => {
    const list = nearby.get(from) ?? [];
    list.push({ stopId: to, metres });
    nearby.set(from, list);
  };
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      const a = stops[i]!;
      const b = stops[j]!;
      const metres = metresBetween([a.lat, a.lon], [b.lat, b.lon]);
      if (metres > maxMetres) continue;
      add(a.id, b.id, metres);
      add(b.id, a.id, metres);
    }
  }
  return (stopId) => nearby.get(stopId) ?? [];
}

function byTime(a: JourneyOption, b: JourneyOption): number {
  return a.totalMinutes - b.totalMinutes || a.legs.length - b.legs.length;
}
