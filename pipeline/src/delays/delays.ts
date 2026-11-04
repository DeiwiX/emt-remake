/**
 * Retrasos habituales (Fase 10, ADR 0016 y 0024). Lógica pura.
 *
 * 1. Cada 5 min se leen las previsiones del GTFS-RT de la EMT. Cada viaje trae
 *    su `trip_id` (no hay que adivinar qué viaje hace cada autobús) y la llegada
 *    prevista a su próxima parada; se compara con la hora del horario de ese
 *    viaje y se guarda como una línea de texto en el histórico del día.
 * 2. Cada hora se juntan las últimas 8 semanas y se calcula el margen habitual
 *    del retraso (percentiles 25 y 75) por línea, sentido, tipo de día, hora y
 *    tramo de paradas.
 */
import type { NetworkFile, TimetablesFile } from '../output-schema.ts';
import type { FeedTrip } from './trip-updates.ts';

/** Retraso medido de un viaje en una parada de su sentido. */
export interface Observation {
  /** Día y segundos desde su medianoche (Madrid) del paso programado. */
  readonly dateKey: string;
  readonly seconds: number;
  readonly lineId: string;
  readonly directionId: number;
  readonly stopIndex: number;
  /** Minutos de retraso (negativo: adelantado), redondeados a 0,1. */
  readonly delay: number;
  /** `trip_id` del viaje (para no guardar dos veces la misma parada). */
  readonly trip: string;
}

const SECONDS_PER_DAY = 86_400;

/** Paradas por tramo: el retraso se agrupa por tramos de 5 paradas del sentido. */
export const STOPS_PER_BUCKET = 5;
/** Se juntan las últimas 8 semanas. */
export const HISTORY_DAYS = 56;
/** Con menos datos que estos en un hueco no se da retraso habitual (los percentiles bailarían). */
export const MIN_SAMPLES = 8;
/** Retrasos fuera de este margen se recortan (un dato raro no debe mover los percentiles). */
const MIN_DELAY = -5;
const MAX_DELAY = 30;
/** Previsiones de más de 1 h o de hace más de 2 min no son de la próxima parada. */
const MAX_AHEAD_SECONDS = 3600;
const MAX_BEHIND_SECONDS = 120;

/** "L" laborable (lunes a viernes), "S" sábado, "F" domingo. */
export type DayType = 'L' | 'S' | 'F';

export function dayTypeOf(dateKey: string): DayType {
  const day = new Date(
    Date.UTC(+dateKey.slice(0, 4), +dateKey.slice(4, 6) - 1, +dateKey.slice(6, 8)),
  ).getUTCDay();
  return day === 0 ? 'F' : day === 6 ? 'S' : 'L';
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(
    Date.UTC(+dateKey.slice(0, 4), +dateKey.slice(4, 6) - 1, +dateKey.slice(6, 8) + days),
  );
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

const offsetFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Madrid',
  timeZoneName: 'shortOffset',
});

/** Segundos Unix de una hora de Madrid (`seconds` desde la medianoche de `dateKey`). */
export function madridEpoch(dateKey: string, seconds: number): number {
  const noonUtc = Date.UTC(
    +dateKey.slice(0, 4),
    +dateKey.slice(4, 6) - 1,
    +dateKey.slice(6, 8),
    12,
  );
  const name = offsetFormat.formatToParts(new Date(noonUtc)).find((p) => p.type === 'timeZoneName');
  const match = /GMT([+-])(\d{1,2})/.exec(name?.value ?? '');
  const offsetHours = match ? (match[1] === '-' ? -1 : 1) * Number(match[2]) : 1;
  return noonUtc / 1000 - 12 * 3600 + seconds - offsetHours * 3600;
}

/**
 * Partes del `trip_id` del tiempo real ("G2606S_F21_072-03_13": horario,
 * variante, bloque y número de viaje), como en la app (`tripKeyParts`).
 */
function tripKeyParts(tripId: string): { schedule: string; block: string; trip: number } | null {
  const match = /^([^_]+)_[^_]+_(.+)_(\d+)$/.exec(tripId);
  return match ? { schedule: match[1]!, block: match[2]!, trip: Number(match[3]) } : null;
}

/**
 * Retraso de cada viaje en su próxima parada: la llegada que prevé la EMT menos
 * la del horario de ese viaje (salida programada + minutos de su recorrido).
 * `now` son segundos Unix. No se mide en la primera parada (puede estar
 * esperando su hora de salida) ni en paradas que no están en la red publicada.
 */
export function measureDelays(
  trips: readonly FeedTrip[],
  network: NetworkFile,
  timetables: TimetablesFile,
  now: number,
): Observation[] {
  const patterns = timetables.livePatterns ?? [];
  return trips.flatMap((trip): Observation[] => {
    const key = tripKeyParts(trip.tripId);
    const clock = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(trip.startTime);
    if (!key || !clock || !/^\d{8}$/.test(trip.startDate)) return [];
    const index = timetables.liveTrips?.[key.schedule]?.[key.block]?.[key.trip - 1] ?? -1;
    const pattern = patterns[index];
    if (!pattern) return [];
    const next = trip.stops.find(
      (s) => !s.skipped && s.time !== null && s.time >= now - MAX_BEHIND_SECONDS,
    );
    if (!next || next.time === null || next.time > now + MAX_AHEAD_SECONDS) return [];
    const minutes = pattern.minutes[next.sequence - 1];
    const stopId = pattern.stops[next.sequence - 1];
    if (next.sequence < 2 || minutes === undefined || stopId === undefined) return [];
    const direction = network.lines
      .find((l) => l.id === pattern.line)
      ?.directions.find((d) => d.id === pattern.direction);
    const stopIndex = direction?.stopIds.indexOf(stopId) ?? -1;
    if (stopIndex <= 0) return [];
    const start = Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
    const scheduled = start + minutes * 60;
    const delay = (next.time - madridEpoch(trip.startDate, scheduled)) / 60;
    // El paso programado puede caer al día siguiente (viajes después de medianoche).
    const dayOffset = Math.floor(scheduled / SECONDS_PER_DAY);
    return [
      {
        dateKey: addDays(trip.startDate, dayOffset),
        seconds: scheduled - dayOffset * SECONDS_PER_DAY,
        lineId: pattern.line,
        directionId: pattern.direction,
        stopIndex,
        delay: Math.round(delay * 10) / 10,
        trip: trip.tripId,
      },
    ];
  });
}

/** Línea del histórico: "segundos,línea,sentido,parada(índice),retraso,viaje". */
export function formatObservation(o: Observation): string {
  return [o.seconds, o.lineId, o.directionId, o.stopIndex, o.delay, o.trip].join(',');
}

/** Lee un fichero del histórico (un día); descarta las líneas dañadas. */
export function parseObservations(dateKey: string, text: string): Observation[] {
  return text.split('\n').flatMap((row): Observation[] => {
    const [seconds, lineId, directionId, stopIndex, delay, trip] = row.trim().split(',');
    const values = [seconds, directionId, stopIndex, delay].map(Number);
    if (!lineId || !trip || values.some((v) => !Number.isFinite(v))) return [];
    return [
      {
        dateKey,
        seconds: values[0]!,
        lineId,
        directionId: values[1]!,
        stopIndex: values[2]!,
        delay: values[3]!,
        trip,
      },
    ];
  });
}

/** Clave de un dato para no guardarlo dos veces: cada viaje, una vez por parada. */
export function observationKey(o: Observation): string {
  return `${o.trip}@${o.stopIndex}`;
}

/**
 * Margen habitual del retraso en un hueco, en minutos: [percentil 25, percentil 75].
 * La mitad de los autobuses van entre los dos; uno de cada cuatro, antes del primero.
 */
export type DelayRange = [low: number, high: number];

/** Fichero publicado: margen habitual del retraso, o null si no hay datos suficientes. */
export interface DelaysFile {
  schemaVersion: number;
  /** Días del histórico que se han usado. */
  days: number;
  stopsPerBucket: number;
  /**
   * Clave "línea|sentido|tipo de día" -> por hora (0–23) -> por tramo de
   * paradas (índice / stopsPerBucket) -> margen habitual. Hasta noviembre de
   * 2026 era `delays` (la mediana); el nombre nuevo hace que las apps antiguas
   * lo ignoren en vez de leer una mediana que no es.
   */
  ranges: Record<string, (DelayRange | null)[][]>;
}

/** Margen habitual a partir de las observaciones (de varios días). */
export function aggregateDelays(
  observations: readonly Observation[],
  days: number,
  schemaVersion: number,
): DelaysFile {
  const samples = new Map<string, number[]>();
  for (const o of observations) {
    const hour = Math.floor(o.seconds / 3600) % 24;
    const bucket = Math.floor(o.stopIndex / STOPS_PER_BUCKET);
    const key = `${o.lineId}|${o.directionId}|${dayTypeOf(o.dateKey)}#${hour}#${bucket}`;
    const list = samples.get(key) ?? [];
    list.push(Math.min(MAX_DELAY, Math.max(MIN_DELAY, o.delay)));
    samples.set(key, list);
  }
  const ranges: Record<string, (DelayRange | null)[][]> = {};
  for (const [key, list] of samples) {
    if (list.length < MIN_SAMPLES) continue;
    const [group, hourText, bucketText] = key.split('#');
    const hours = (ranges[group!] ??= Array.from({ length: 24 }, () => []));
    const row = hours[+hourText!]!;
    const bucket = +bucketText!;
    while (row.length <= bucket) row.push(null);
    const sorted = [...list].sort((a, b) => a - b);
    row[bucket] = [Math.round(quantile(sorted, 0.25)), Math.round(quantile(sorted, 0.75))];
  }
  return { schemaVersion, days, stopsPerBucket: STOPS_PER_BUCKET, ranges };
}

/** Cuantil con interpolación lineal de una lista ya ordenada (no vacía). */
function quantile(sorted: readonly number[], q: number): number {
  const position = (sorted.length - 1) * q;
  const below = Math.floor(position);
  const above = Math.min(below + 1, sorted.length - 1);
  return sorted[below]! + (sorted[above]! - sorted[below]!) * (position - below);
}

/** Días (AAAAMMDD) del histórico que se usan: los `days` anteriores a `today`, sin contar hoy. */
export function historyDays(today: string, days = HISTORY_DAYS): string[] {
  return Array.from({ length: days }, (_, i) => addDays(today, -(i + 1)));
}
