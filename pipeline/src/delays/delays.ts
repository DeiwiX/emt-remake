/**
 * Retrasos habituales (Fase 10, ADR 0016). Lógica pura.
 *
 * 1. Cada 5 min se mira dónde va cada autobús (fuente de posiciones del
 *    Ayuntamiento) y se calcula cuánto va tarde frente a su viaje del horario,
 *    con la misma regla que la app (core/realtime/live-estimate.ts). Se guarda
 *    como una línea de texto en el histórico del día.
 * 2. Cada hora se juntan las últimas 8 semanas y se calcula el retraso típico
 *    (mediana) por línea, sentido, tipo de día, hora y tramo de paradas.
 */
import type { NetworkFile, TimetablesFile } from '../output-schema.ts';

/** Un autobús visto en la fuente: dónde estaba (última parada) y cuándo. */
export interface Sighting {
  readonly bus: string;
  readonly lineId: string;
  readonly directionId: number;
  readonly stopId: string;
  /** Día del dato (AAAAMMDD, hora de Madrid). */
  readonly dateKey: string;
  /** Segundos desde la medianoche de Madrid de `dateKey`. */
  readonly seconds: number;
}

/** Retraso medido de un autobús en una parada de su sentido. */
export interface Observation {
  readonly dateKey: string;
  readonly seconds: number;
  readonly lineId: string;
  readonly directionId: number;
  readonly stopIndex: number;
  /** Minutos de retraso (negativo: adelantado), redondeados a 0,1. */
  readonly delay: number;
  readonly bus: string;
}

/** Igual que la app: se casa con un viaje si va entre 10 min adelantado y 40 min tarde. */
const MAX_EARLY_MINUTES = 10;
const MAX_LATE_MINUTES = 40;
/** Ir adelantado es raro: en la comparación cuenta el triple que ir tarde. */
const EARLY_WEIGHT = 3;
const MINUTES_PER_DAY = 1440;

/** Paradas por tramo: el retraso se agrupa por tramos de 5 paradas del sentido. */
export const STOPS_PER_BUCKET = 5;
/** Se juntan las últimas 8 semanas. */
export const HISTORY_DAYS = 56;
/** Con menos datos que estos en un hueco no se da retraso habitual. */
export const MIN_SAMPLES = 5;
/** Retrasos fuera de este margen se recortan (un dato raro no debe mover la mediana). */
const MIN_DELAY = -5;
const MAX_DELAY = 30;

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

/** Lee la fuente de posiciones (GeoJSON como lista de "Feature"); descarta lo incompleto. */
export function parseSightings(raw: unknown): Sighting[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): Sighting[] => {
    if (typeof item !== 'object' || item === null) return [];
    const record = item as Record<string, unknown>;
    const p = (
      typeof record['properties'] === 'object' && record['properties'] !== null
        ? record['properties']
        : record
    ) as Record<string, unknown>;
    const lineId = String(p['codLinea'] ?? record['codLinea'] ?? '')
      .trim()
      .replace(/\.0+$/, '');
    const directionId = Number(p['sentido'] ?? record['sentido']);
    const stopId = String(p['codParIni'] ?? record['codParIni'] ?? '').trim();
    const bus = String(p['codBus'] ?? record['codBus'] ?? '').trim();
    const time = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(
      String(p['last_update'] ?? '').trim(),
    );
    if (!lineId || !stopId || !bus || !time || !Number.isInteger(directionId)) return [];
    const [, y, mo, d, h, mi, s] = time;
    return [
      {
        bus,
        lineId,
        directionId,
        stopId,
        dateKey: `${y}${mo}${d}`,
        seconds: +h! * 3600 + +mi! * 60 + +s!,
      },
    ];
  });
}

/**
 * Retraso de un autobús frente al viaje del horario que está haciendo (el que
 * debía pasar por su última parada más cerca de la hora del dato, prefiriendo
 * que vaya tarde a adelantado). null si no se puede casar con ninguno.
 */
export function measureDelay(
  sighting: Sighting,
  network: NetworkFile,
  timetables: TimetablesFile,
): Observation | null {
  const direction = network.lines
    .find((l) => l.id === sighting.lineId)
    ?.directions.find((d) => d.id === sighting.directionId);
  if (!direction) return null;
  const stopIndex = direction.stopIds.indexOf(sighting.stopId);
  // En la primera parada puede estar esperando su hora de salida: no es retraso.
  if (stopIndex <= 0) return null;
  const key = `${sighting.lineId}|${sighting.directionId}`;
  const byService = timetables.departures[key];
  if (!byService) return null;
  const profiles = timetables.profiles?.[key];
  const profileOf = timetables.departureProfiles?.[key];
  const reportMinutes = sighting.seconds / 60;

  let best: number | null = null;
  let bestCost = Infinity;
  for (const dayOffset of [-1, 0]) {
    const day = addDays(sighting.dateKey, dayOffset);
    for (const [service, starts] of Object.entries(byService)) {
      if (!timetables.services[service]?.includes(day)) continue;
      const indexes = profileOf?.[service];
      starts.forEach((start, i) => {
        const profile = (indexes && profiles?.[indexes[i]!]) || direction.minutes;
        const atStop = profile[stopIndex];
        if (atStop === undefined) return;
        const delay = reportMinutes - (dayOffset * MINUTES_PER_DAY + start + atStop);
        if (delay < -MAX_EARLY_MINUTES || delay > MAX_LATE_MINUTES) return;
        const cost = delay < 0 ? -delay * EARLY_WEIGHT : delay;
        if (cost < bestCost) {
          bestCost = cost;
          best = delay;
        }
      });
    }
  }
  if (best === null) return null;
  return {
    dateKey: sighting.dateKey,
    seconds: sighting.seconds,
    lineId: sighting.lineId,
    directionId: sighting.directionId,
    stopIndex,
    delay: Math.round((best as number) * 10) / 10,
    bus: sighting.bus,
  };
}

/** Línea del histórico: "segundos,línea,sentido,parada(índice),retraso,autobús". */
export function formatObservation(o: Observation): string {
  return [o.seconds, o.lineId, o.directionId, o.stopIndex, o.delay, o.bus].join(',');
}

/** Lee un fichero del histórico (un día); descarta las líneas dañadas. */
export function parseObservations(dateKey: string, text: string): Observation[] {
  return text.split('\n').flatMap((row): Observation[] => {
    const [seconds, lineId, directionId, stopIndex, delay, bus] = row.trim().split(',');
    const values = [seconds, directionId, stopIndex, delay].map(Number);
    if (!lineId || !bus || values.some((v) => !Number.isFinite(v))) return [];
    return [
      {
        dateKey,
        seconds: values[0]!,
        lineId,
        directionId: values[1]!,
        stopIndex: values[2]!,
        delay: values[3]!,
        bus,
      },
    ];
  });
}

/** Clave de un dato para no guardarlo dos veces (la fuente repite el mismo dato unos minutos). */
export function observationKey(o: { bus: string; seconds: number }): string {
  return `${o.bus}@${o.seconds}`;
}

/** Fichero publicado: retraso habitual en minutos, o null si no hay datos suficientes. */
export interface DelaysFile {
  schemaVersion: number;
  /** Días del histórico que se han usado. */
  days: number;
  stopsPerBucket: number;
  /**
   * Clave "línea|sentido|tipo de día" -> por hora (0–23) -> por tramo de
   * paradas (índice / stopsPerBucket) -> minutos de retraso habitual.
   */
  delays: Record<string, (number | null)[][]>;
}

/** Retraso habitual a partir de las observaciones (de varios días). */
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
  const delays: Record<string, (number | null)[][]> = {};
  for (const [key, list] of samples) {
    if (list.length < MIN_SAMPLES) continue;
    const [group, hourText, bucketText] = key.split('#');
    const hours = (delays[group!] ??= Array.from({ length: 24 }, () => []));
    const row = hours[+hourText!]!;
    const bucket = +bucketText!;
    while (row.length <= bucket) row.push(null);
    row[bucket] = Math.round(median(list));
  }
  return { schemaVersion, days, stopsPerBucket: STOPS_PER_BUCKET, delays };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Días (AAAAMMDD) del histórico que se usan: los `days` anteriores a `today`, sin contar hoy. */
export function historyDays(today: string, days = HISTORY_DAYS): string[] {
  return Array.from({ length: days }, (_, i) => addDays(today, -(i + 1)));
}
