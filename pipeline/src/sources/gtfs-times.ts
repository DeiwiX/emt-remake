/**
 * Tiempos de viaje según el horario programado del GTFS (stop_times), para el
 * planificador "Cómo llegar". Para cada trazado se toma la secuencia de paradas
 * más frecuente y, en cada posición, la mediana de minutos desde la primera parada.
 */

export interface TravelPattern {
  /** Códigos públicos de parada (stop_code) en orden de paso. */
  stopCodes: string[];
  /** Minutos desde la primera parada (mediana de los viajes), alineados con stopCodes. */
  minutes: number[];
  /** Viajes en los que se basa la mediana. */
  trips: number;
}

interface TripStop {
  sequence: number;
  stopId: string;
  seconds: number;
}

/** Paradas de un viaje concreto con los minutos desde su salida (horario exacto, Fase 3). */
export interface TripTimes {
  /** Códigos públicos de parada (stop_code) en orden de paso; vacío si el GTFS no lo trae. */
  stopCodes: string[];
  minutes: number[];
}

export interface StopTimesSummary {
  /** Patrón de tiempos por trazado (shape_id). */
  patterns: Map<string, TravelPattern>;
  /** Hora de salida de cada viaje desde su primera parada, en segundos desde medianoche. */
  tripStarts: Map<string, number>;
  /** Paso de cada viaje por sus paradas. */
  tripTimes: Map<string, TripTimes>;
}

/**
 * stop_times ocupa unos 35 MB: se lee línea a línea con un troceado simple (el
 * fichero no usa comillas) y solo se guardan los viajes con trazado conocido.
 */
export function parseStopTimes(
  stopTimesCsv: string,
  trips: Record<string, string>[],
  stops: Record<string, string>[],
): StopTimesSummary {
  const shapeByTrip = new Map(
    trips.filter((t) => t['trip_id'] && t['shape_id']).map((t) => [t['trip_id']!, t['shape_id']!]),
  );
  const codeByStopId = new Map(
    stops.map((s) => [s['stop_id'] ?? '', (s['stop_code'] ?? '').trim()]),
  );

  const lines = stopTimesCsv.replace(/^﻿/, '').split(/\r?\n/);
  const header = (lines[0] ?? '').split(',').map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const [tripCol, arrivalCol, departureCol, stopCol, sequenceCol] = [
    col('trip_id'),
    col('arrival_time'),
    col('departure_time'),
    col('stop_id'),
    col('stop_sequence'),
  ];
  if ([tripCol, stopCol, sequenceCol].includes(-1) || (arrivalCol === -1 && departureCol === -1)) {
    return { patterns: new Map(), tripStarts: new Map(), tripTimes: new Map() };
  }

  const stopsByTrip = new Map<string, TripStop[]>();
  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i]!.split(',');
    const tripId = fields[tripCol];
    if (!tripId || !shapeByTrip.has(tripId)) continue;
    const seconds = toSeconds(fields[arrivalCol] || fields[departureCol] || '');
    const sequence = Number(fields[sequenceCol]);
    if (seconds === null || !Number.isFinite(sequence)) continue;
    const list = stopsByTrip.get(tripId) ?? [];
    list.push({ sequence, stopId: fields[stopCol] ?? '', seconds });
    stopsByTrip.set(tripId, list);
  }

  // Por trazado: viajes agrupados por secuencia de paradas.
  const byShape = new Map<string, Map<string, number[][]>>();
  const tripStarts = new Map<string, number>();
  const tripTimes = new Map<string, TripTimes>();
  for (const [tripId, tripStops] of stopsByTrip) {
    tripStops.sort((a, b) => a.sequence - b.sequence);
    const start = tripStops[0]!.seconds;
    tripStarts.set(tripId, start);
    const codes = tripStops.map((s) => codeByStopId.get(s.stopId) ?? '');
    tripTimes.set(tripId, {
      stopCodes: codes,
      minutes: tripStops.map((s) => (s.seconds - start) / 60),
    });
    if (codes.some((c) => !c)) continue;
    const key = codes.join(',');
    const shapeId = shapeByTrip.get(tripId)!;
    const patterns = byShape.get(shapeId) ?? new Map<string, number[][]>();
    const samples = patterns.get(key) ?? [];
    samples.push(tripStops.map((s) => (s.seconds - start) / 60));
    patterns.set(key, samples);
    byShape.set(shapeId, patterns);
  }

  const result = new Map<string, TravelPattern>();
  for (const [shapeId, patterns] of byShape) {
    const [key, samples] = [...patterns].sort((a, b) => b[1].length - a[1].length)[0]!;
    const minutes = samples[0]!.map((_, i) => round1(median(samples.map((s) => s[i]!))));
    result.set(shapeId, { stopCodes: key.split(','), minutes, trips: samples.length });
  }
  return { patterns: result, tripStarts, tripTimes };
}

/** "25:10:00" -> segundos (GTFS admite horas ≥ 24 para viajes que pasan de medianoche). */
function toSeconds(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
