import type { EmtStop } from '../sources/emt-lines.ts';
import type { TravelPattern } from '../sources/gtfs-times.ts';
import { distanceM } from './geometry.ts';

/**
 * Estimación cuando no hay horario: distancia en línea recta entre paradas,
 * aumentada por el trazado real de las calles, a la velocidad comercial típica
 * de un autobús urbano (~15 km/h, 250 m/min, incluidas las paradas).
 */
const DETOUR_FACTOR = 1.3;
const METRES_PER_MINUTE = 250;
/** Si el horario cubre menos de esta fracción de las paradas, se usa la estimación. */
const MIN_MATCHED_FRACTION = 0.5;

export interface DirectionTimes {
  /** Minutos desde la primera parada, alineados con las paradas del sentido. */
  minutes: number[];
  source: 'schedule' | 'estimate';
}

/**
 * Minutos desde la primera parada para cada parada de un sentido. Usa el horario
 * del trazado emparejado y rellena las paradas que el GTFS no tiene interpolando
 * por distancia; si el horario no encaja, estima por distancia.
 */
export function directionTimes(
  stops: EmtStop[],
  pattern: TravelPattern | undefined,
): DirectionTimes {
  const cumulative = cumulativeDistances(stops);
  const known = pattern ? alignToPattern(stops, pattern) : [];
  const matched = known.filter((m) => m !== undefined).length;

  if (!pattern || matched < 2 || matched / stops.length < MIN_MATCHED_FRACTION) {
    return {
      minutes: cumulative.map((d) => round1((d * DETOUR_FACTOR) / METRES_PER_MINUTE)),
      source: 'estimate',
    };
  }
  return { minutes: fillGaps(known, cumulative), source: 'schedule' };
}

/** Recorre ambas secuencias en orden: así funcionan las circulares que repiten parada. */
function alignToPattern(stops: EmtStop[], pattern: TravelPattern): (number | undefined)[] {
  let next = 0;
  return stops.map((stop) => {
    const index = pattern.stopCodes.indexOf(stop.code, next);
    if (index === -1) return undefined;
    next = index + 1;
    return pattern.minutes[index];
  });
}

/** Interpola los huecos por distancia y garantiza que el tiempo nunca retrocede. */
function fillGaps(known: (number | undefined)[], cumulative: number[]): number[] {
  const knownIdx = known.flatMap((m, i) => (m === undefined ? [] : [i]));
  const first = knownIdx[0]!;
  const last = knownIdx.at(-1)!;
  const base = known[first]!;
  const minutes = known.map((m, i) => {
    if (m !== undefined) return m - base;
    if (i < first || i > last) {
      // Fuera del tramo con horario: se extrapola por distancia.
      const anchor = i < first ? first : last;
      const delta = ((cumulative[i]! - cumulative[anchor]!) * DETOUR_FACTOR) / METRES_PER_MINUTE;
      return known[anchor]! - base + delta;
    }
    const before = knownIdx.filter((k) => k < i).at(-1)!;
    const after = knownIdx.find((k) => k > i)!;
    const span = cumulative[after]! - cumulative[before]!;
    const fraction = span > 0 ? (cumulative[i]! - cumulative[before]!) / span : 0;
    return known[before]! - base + fraction * (known[after]! - known[before]!);
  });
  let previous = 0;
  return minutes.map((m) => {
    previous = Math.max(previous, Math.max(0, m));
    return round1(previous);
  });
}

function cumulativeDistances(stops: EmtStop[]): number[] {
  let total = 0;
  return stops.map((stop, i) => {
    if (i > 0) {
      const prev = stops[i - 1]!;
      total += distanceM([prev.lat, prev.lon], [stop.lat, stop.lon]);
    }
    return total;
  });
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
