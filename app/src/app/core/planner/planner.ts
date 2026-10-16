import { Direction, LatLon, Line, Stop } from '../models/network.model';
import { WALK_DETOUR, WALK_METRES_PER_MINUTE, metresBetween } from '../location/geo';

/**
 * Planificador "Cómo llegar" (versión con datos programados). Lógica pura, sin
 * Angular, para poder probarla de forma aislada.
 *
 * Busca viajes directos, con un transbordo y, si no hay nada mejor, con dos
 * (16/10/2026). Los transbordos pueden ser en la misma parada o andando a una
 * cercana. Los tiempos son
 * los del horario programado (o estimados por distancia si una línea no tiene
 * horario); no incluyen la espera en la parada de origen, que necesitará tiempo
 * real (Fase 3).
 */

/**
 * Origen o destino: una parada, una zona (barrio, distrito), una calle (con o
 * sin número de portal) o la ubicación del usuario, con sus paradas.
 */
export interface Place {
  readonly kind: 'stop' | 'neighbourhood' | 'district' | 'street' | 'address' | 'location';
  readonly id: string;
  readonly name: string;
  readonly stopIds: readonly string[];
  /**
   * Minutos andando entre el lugar y cada parada: hasta la parada si es el
   * origen, desde ella si es el destino (calles y "Mi ubicación").
   */
  readonly accessMinutes?: ReadonlyMap<string, number>;
  /** Punto del lugar desde (o hasta) el que se anda a cada parada, para dibujarlo. */
  readonly accessPoints?: ReadonlyMap<string, LatLon>;
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
  /** Minutos andando hasta la primera parada (desde una calle o "Mi ubicación"; si no, 0). */
  readonly accessMinutes: number;
  /** Minutos andando desde la última parada hasta el destino (si es una calle; si no, 0). */
  readonly egressMinutes: number;
  /** Minutos andando hasta la primera parada, en el autobús, a pie entre paradas y el margen de cada transbordo. */
  readonly totalMinutes: number;
  /**
   * Minutos andando en cada transbordo, entre la parada de bajada y la de subida
   * (0 si es la misma). Uno por transbordo: legs.length - 1.
   */
  readonly transferWalks: readonly number[];
}

export interface NearbyStop {
  readonly stopId: string;
  readonly metres: number;
  /** Minutos andando por la calle, si se conocen (si no, se estiman con `metres`). */
  readonly minutes?: number;
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
  /** Minutos andando hasta una parada de origen y desde una de destino (0 si son paradas o zonas). */
  const access = (stopId: string) => origin.accessMinutes?.get(stopId) ?? 0;
  const egress = (stopId: string) => destination.accessMinutes?.get(stopId) ?? 0;

  const directions = lines.flatMap((line) => line.directions.map((d) => ({ line, d })));
  const direct = directions.flatMap(({ line, d }) => {
    const leg = bestLeg(line, d, from, to, access, egress);
    if (!leg) return [];
    const accessMinutes = access(leg.fromStopId);
    const egressMinutes = egress(leg.toStopId);
    return [
      {
        legs: [leg],
        accessMinutes,
        egressMinutes,
        totalMinutes: accessMinutes + leg.minutes + egressMinutes,
        transferWalks: [],
      },
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
      // La parada de bajada que antes deja en destino, contando lo que se anda después.
      const later = arrivals.filter((q) => q > p);
      if (later.length === 0) continue;
      const arrival = later.reduce((best, q) =>
        times[q]! + egress(d.stopIds[q]!) < times[best]! + egress(d.stopIds[best]!) ? q : best,
      );
      const boardingStop = d.stopIds[p]!;
      // Se puede bajar en la misma parada o en una cercana y caminar hasta esta.
      const candidates = withNearby(boardingStop, nearbyStops).flatMap(({ stopId, walk }) =>
        (firstLegs.get(stopId) ?? []).map((first) => ({ first, walk })),
      );
      if (candidates.length === 0) continue;
      const second = makeLeg(line, d, p, arrival, times);
      for (const { first, walk: walkMinutes } of candidates) {
        if (first.lineId === line.id) continue;
        const accessMinutes = access(first.fromStopId);
        const egressMinutes = egress(second.toStopId);
        const total =
          accessMinutes +
          first.minutes +
          walkMinutes +
          transferMinutes +
          second.minutes +
          egressMinutes;
        const key = `${first.lineId}>${line.id}`;
        const current = transfers.get(key);
        if (!current || total < current.totalMinutes) {
          transfers.set(key, {
            legs: [first, second],
            accessMinutes,
            egressMinutes,
            totalMinutes: total,
            transferWalks: [walkMinutes],
          });
        }
      }
    }
  }

  // Un transbordo solo compensa si una línea directa no hace lo mismo con la misma línea,
  // y no se repite una línea en varias combinaciones: así las opciones son distintas.
  // Las de líneas secundarias (nocturnas) se miran al final, para que no quiten el
  // sitio a una de día con la misma línea.
  const secondary = (o: JourneyOption) => o.legs.some((leg) => isSecondary(leg.lineId));
  const directLines = new Set(direct.map((o) => o.legs[0]!.lineId));
  const used = new Set<string>();
  const usefulTransfers = [...transfers.values()]
    .sort((a, b) => Number(secondary(a)) - Number(secondary(b)) || byTime(a, b))
    .filter((o) => {
      const [first, second] = [o.legs[0]!.lineId, o.legs[1]!.lineId];
      if (
        directLines.has(first) ||
        directLines.has(second) ||
        used.has(first) ||
        used.has(second)
      ) {
        return false;
      }
      used.add(first);
      used.add(second);
      return true;
    });

  // Dos transbordos solo si no hay nada directo ni con uno, o si ahorran bastante
  // (frente a lo que no usa líneas secundarias, como las nocturnas, que de día no van).
  const bestSoFar = Math.min(
    ...[...direct, ...usefulTransfers].filter((o) => !secondary(o)).map((o) => o.totalMinutes),
  );
  const doubles = twoTransfers(
    directions,
    firstLegs,
    to,
    egress,
    access,
    nearbyStops,
    transferMinutes,
  )
    .filter((o) => o.totalMinutes <= bestSoFar - DOUBLE_TRANSFER_SAVING_MINUTES)
    .sort((a, b) => Number(secondary(a)) - Number(secondary(b)))
    .slice(0, MAX_DOUBLE_TRANSFERS);

  // Primero las directas (más cómodas) y después los transbordos, cada grupo por
  // tiempo; las opciones con líneas secundarias van al final de todo.
  const ordered = [...direct.sort(byTime), ...usefulTransfers, ...doubles];
  return [...ordered.filter((o) => !secondary(o)), ...ordered.filter(secondary)].slice(
    0,
    maxResults,
  );
}

/** Con dos transbordos se ofrecen como mucho tres opciones. */
const MAX_DOUBLE_TRANSFERS = 3;
/** Dos transbordos compensan si ahorran al menos esto frente a lo mejor sin ellos. */
const DOUBLE_TRANSFER_SAVING_MINUTES = 10;

/** La parada y las cercanas, con los minutos andando hasta cada una (0 la misma). */
function withNearby(
  stopId: string,
  nearbyStops: (stopId: string) => readonly NearbyStop[],
): { stopId: string; walk: number }[] {
  return [
    { stopId, walk: 0 },
    ...nearbyStops(stopId).map((n) => ({
      stopId: n.stopId,
      walk: n.minutes ?? Math.ceil((n.metres * WALK_DETOUR) / WALK_METRES_PER_MINUTE),
    })),
  ];
}

/**
 * Viajes con dos transbordos: primer tramo (ya calculado hasta cada parada),
 * un tramo intermedio y el último hasta el destino. Para que sea rápido, de
 * cada parada solo se usa el mejor primer tramo y el mejor último tramo.
 */
function twoTransfers(
  directions: readonly { line: Line; d: Direction }[],
  firstLegs: ReadonlyMap<string, Leg[]>,
  to: ReadonlySet<string>,
  egress: (stopId: string) => number,
  access: (stopId: string) => number,
  nearbyStops: (stopId: string) => readonly NearbyStop[],
  transferMinutes: number,
): JourneyOption[] {
  // Mejor primer tramo que deja en cada parada (contando lo que se anda hasta la de subida).
  const bestFirst = new Map<string, Leg>();
  for (const [stopId, legs] of firstLegs) {
    bestFirst.set(
      stopId,
      legs.reduce((a, b) =>
        access(a.fromStopId) + a.minutes <= access(b.fromStopId) + b.minutes ? a : b,
      ),
    );
  }
  // Mejor último tramo desde cada parada hasta el destino (contando lo que se anda después).
  const bestLast = new Map<string, Leg>();
  for (const { line, d } of directions) {
    const times = minutesOf(d);
    const arrivals = indicesOf(d, to);
    if (arrivals.length === 0) continue;
    for (let p = 0; p < d.stopIds.length; p++) {
      const stopId = d.stopIds[p]!;
      if (to.has(stopId)) continue;
      const later = arrivals.filter((q) => q > p);
      if (later.length === 0) continue;
      const arrival = later.reduce((best, q) =>
        times[q]! + egress(d.stopIds[q]!) < times[best]! + egress(d.stopIds[best]!) ? q : best,
      );
      const leg = makeLeg(line, d, p, arrival, times);
      const current = bestLast.get(stopId);
      if (
        !current ||
        leg.minutes + egress(leg.toStopId) < current.minutes + egress(current.toStopId)
      ) {
        bestLast.set(stopId, leg);
      }
    }
  }

  const options = new Map<string, JourneyOption>();
  for (const { line, d } of directions) {
    const times = minutesOf(d);
    // En cada parada del tramo intermedio, el mejor primer tramo que deja en ella (o
    // andando cerca) y el mejor último tramo que sale de ella, de otras líneas.
    const firstAt = d.stopIds.map((stopId) => {
      let best: { first: Leg; walk: number; cost: number } | null = null;
      for (const { stopId: id, walk } of withNearby(stopId, nearbyStops)) {
        const first = bestFirst.get(id);
        if (!first || first.lineId === line.id) continue;
        const cost = access(first.fromStopId) + first.minutes + walk;
        if (!best || cost < best.cost) best = { first, walk, cost };
      }
      return best;
    });
    const lastAt = d.stopIds.map((stopId) => {
      let best: { last: Leg; walk: number; cost: number } | null = null;
      for (const { stopId: id, walk } of withNearby(stopId, nearbyStops)) {
        const last = bestLast.get(id);
        if (!last || last.lineId === line.id) continue;
        const cost = walk + last.minutes + egress(last.toStopId);
        if (!best || cost < best.cost) best = { last, walk, cost };
      }
      return best;
    });
    for (let p = 0; p < d.stopIds.length - 1; p++) {
      const start = firstAt[p];
      if (!start) continue;
      for (let q = p + 1; q < d.stopIds.length; q++) {
        const end = lastAt[q];
        if (!end || start.first.lineId === end.last.lineId) continue;
        const middle = makeLeg(line, d, p, q, times);
        const total = start.cost + middle.minutes + end.cost + 2 * transferMinutes;
        const key = `${start.first.lineId}>${line.id}>${end.last.lineId}`;
        const current = options.get(key);
        if (!current || total < current.totalMinutes) {
          options.set(key, {
            legs: [start.first, middle, end.last],
            accessMinutes: access(start.first.fromStopId),
            egressMinutes: egress(end.last.toStopId),
            totalMinutes: total,
            transferWalks: [start.walk, end.walk],
          });
        }
      }
    }
  }
  // Una opción por línea intermedia, para que sean distintas. No se exige que no
  // repitan la primera o la última: a menudo solo una línea sale del origen.
  const used = new Set<string>();
  return [...options.values()].sort(byTime).filter((o) => {
    const middle = o.legs[1]!.lineId;
    if (used.has(middle)) return false;
    used.add(middle);
    return true;
  });
}

/**
 * El tramo más corto de una línea entre alguna parada de origen y otra posterior
 * de destino, contando lo que se anda hasta la parada de subida y desde la de bajada.
 */
function bestLeg(
  line: Line,
  d: Direction,
  from: ReadonlySet<string>,
  to: ReadonlySet<string>,
  access: (stopId: string) => number,
  egress: (stopId: string) => number,
): Leg | null {
  const times = minutesOf(d);
  const arrivals = indicesOf(d, to);
  let best: Leg | null = null;
  let bestCost = Infinity;
  for (const i of indicesOf(d, from)) {
    for (const j of arrivals) {
      if (j <= i) continue;
      const leg = makeLeg(line, d, i, j, times);
      const cost = access(leg.fromStopId) + leg.minutes + egress(leg.toStopId);
      if (cost < bestCost) {
        best = leg;
        bestCost = cost;
      }
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
