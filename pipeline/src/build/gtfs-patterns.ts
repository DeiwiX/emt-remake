/**
 * Piezas comunes de las redes que se leen de un GTFS por recorridos
 * (interurbanos, ADR 0022; Cercanías, ADR 0023): cada secuencia distinta de
 * paradas de una línea se publica como un sentido propio, con sus minutos
 * típicos, sus perfiles de horario y sus restricciones de subida o bajada.
 */
import type { PublishedDirection, TimetablesFile } from '../output-schema.ts';
import { type LatLon, distanceM } from './geometry.ts';

export interface TripStop {
  stopId: string;
  minutes: number;
  noBoarding: boolean;
  noAlighting: boolean;
}

export interface Trip {
  /** trip_id del GTFS. */
  id: string;
  lineId: string;
  serviceId: string;
  shapeId: string;
  stops: TripStop[];
}

/** Viajes con la misma secuencia de paradas. */
export interface Pattern {
  stopIds: string[];
  trips: Trip[];
}

/** Cómo se llaman en la publicación las paradas, servicios y trazados de la red. */
export interface PatternNaming {
  stopId: (gtfsId: string) => string;
  serviceId: (gtfsId: string) => string;
  /** Trazado oficial publicado a partir del shape_id del GTFS. */
  officialShapeId: (gtfsId: string) => string;
  /** Trazado aproximado (paradas unidas) cuando el recorrido no tiene uno oficial. */
  approximateShapeId: (lineId: string, directionId: number) => string;
  stopName: (gtfsId: string) => string;
  stopPoint: (gtfsId: string) => LatLon;
}

/** Lo que se va acumulando al publicar las líneas de una red. */
export interface PatternOutput {
  usedStops: Set<string>;
  usedServices: Set<string>;
  geometries: Map<string, LatLon[]>;
  departures: TimetablesFile['departures'];
  profiles: NonNullable<TimetablesFile['profiles']>;
  departureProfiles: NonNullable<TimetablesFile['departureProfiles']>;
}

export function emptyPatternOutput(): PatternOutput {
  return {
    usedStops: new Set(),
    usedServices: new Set(),
    geometries: new Map(),
    departures: {},
    profiles: {},
    departureProfiles: {},
  };
}

/** Opciones de publishDirections. */
export interface PatternOptions {
  /**
   * Recibe cada viaje publicado con su clave ("línea|sentido"), su servicio
   * publicado y su salida, por si la red publica algo más por viaje.
   */
  onDeparture?: (key: string, service: string, trip: Trip, start: number) => void;
  /** Parada de salida del sentido principal si hay empate de viajes (ver groupPatterns). */
  firstStop?: string;
}

/**
 * Sentidos de una línea, uno por recorrido (ids 1..n, el primero el de más
 * viajes), con su trazado y su horario añadidos a `out`.
 */
export function publishDirections(
  lineId: string,
  lineTrips: readonly Trip[],
  shapes: ReadonlyMap<string, LatLon[]>,
  naming: PatternNaming,
  out: PatternOutput,
  { onDeparture, firstStop }: PatternOptions = {},
): PublishedDirection[] {
  const patterns = groupPatterns(lineTrips, firstStop);
  const headsigns = headsignsOf(patterns, naming.stopName);
  return patterns.map((pattern, i): PublishedDirection => {
    const directionId = i + 1;
    pattern.stopIds.forEach((id) => out.usedStops.add(id));

    const shapeId = mostCommon(pattern.trips.map((t) => t.shapeId).filter(Boolean));
    const stored = shapeId ? shapes.get(shapeId) : undefined;
    const official = stored !== undefined && stored.length > 1;
    const ends: [LatLon, LatLon] = [
      naming.stopPoint(pattern.stopIds[0]!),
      naming.stopPoint(pattern.stopIds.at(-1)!),
    ];
    const reversed = official && drawnBackwards(stored, ends);
    const points = reversed ? [...stored].reverse() : stored;
    // Un trazado dibujado al revés se publica dado la vuelta y con otro id, por
    // si otro recorrido lo usa en su sentido (las flechas del mapa siguen el dibujo).
    const publishedShape = official
      ? `${naming.officialShapeId(shapeId!)}${reversed ? '~r' : ''}`
      : naming.approximateShapeId(lineId, directionId);
    out.geometries.set(publishedShape, official ? points! : pattern.stopIds.map(naming.stopPoint));

    const relative = pattern.trips.map((t) =>
      t.stops.map((s) => Math.round(s.minutes - t.stops[0]!.minutes)),
    );
    const typical = pattern.stopIds.map((_, k) => median(relative.map((r) => r[k]!)));

    const key = `${lineId}|${directionId}`;
    const list: number[][] = [];
    const indexOf = new Map<string, number>();
    const byService: Record<string, { start: number; profile: number; trip: Trip }[]> = {};
    pattern.trips.forEach((t, k) => {
      const profile = relative[k]!;
      const profileKey = profile.join(',');
      let index = indexOf.get(profileKey);
      if (index === undefined) {
        index = list.push(profile) - 1;
        indexOf.set(profileKey, index);
      }
      (byService[naming.serviceId(t.serviceId)] ??= []).push({
        start: Math.round(t.stops[0]!.minutes),
        profile: index,
        trip: t,
      });
      out.usedServices.add(t.serviceId);
    });
    out.departures[key] = {};
    out.departureProfiles[key] = {};
    for (const [service, items] of Object.entries(byService)) {
      items.sort((a, b) => a.start - b.start);
      out.departures[key][service] = items.map((d) => d.start);
      out.departureProfiles[key][service] = items.map((d) => d.profile);
      for (const d of items) onDeparture?.(key, service, d.trip, d.start);
    }
    out.profiles[key] = list;

    const { noBoarding, noAlighting } = restrictionsOf(pattern);
    return {
      id: directionId,
      headsign: headsigns[i]!,
      stopIds: pattern.stopIds.map(naming.stopId),
      shapeId: publishedShape,
      shapeQuality: official ? 'official' : 'approximate',
      minutes: typical,
      timesSource: 'schedule',
      ...(noBoarding.length ? { noBoarding } : {}),
      ...(noAlighting.length ? { noAlighting } : {}),
    };
  });
}

/**
 * true si el trazado empieza claramente junto a la última parada y acaba junto
 * a la primera (Renfe dibuja "32_C1" desde Fuengirola aunque sus viajes salgan
 * de Málaga). En las circulares los dos extremos coinciden y no se toca.
 */
export function drawnBackwards(
  points: readonly LatLon[],
  [first, last]: [LatLon, LatLon],
): boolean {
  const start = points[0]!;
  const end = points.at(-1)!;
  const forward = distanceM(start, first) + distanceM(end, last);
  const backward = distanceM(start, last) + distanceM(end, first);
  return backward < forward / 2;
}

/**
 * Recorridos de una línea, de más a menos viajes (el primero es el principal).
 * Con el mismo número de viajes va antes el que sale de `firstStop`, si se da
 * (en Cercanías los dos sentidos tienen los mismos trenes: primero el que sale
 * de Málaga).
 */
export function groupPatterns(trips: readonly Trip[], firstStop?: string): Pattern[] {
  const byKey = new Map<string, Pattern>();
  for (const trip of trips) {
    const stopIds = trip.stops.map((s) => s.stopId);
    const key = stopIds.join('>');
    const pattern = byKey.get(key) ?? { stopIds, trips: [] };
    pattern.trips.push(trip);
    byKey.set(key, pattern);
  }
  const fromFirst = (p: Pattern) => (p.stopIds[0] === firstStop ? 0 : 1);
  return [...byKey.values()].sort(
    (a, b) =>
      b.trips.length - a.trips.length ||
      fromFirst(a) - fromFirst(b) ||
      a.stopIds.join().localeCompare(b.stopIds.join()),
  );
}

/**
 * Destino de cada recorrido: la última parada. Si dos recorridos de la línea
 * acaban en la misma, se añade de dónde salen; y si también coinciden, un número.
 */
export function headsignsOf(
  patterns: readonly Pattern[],
  stopName: (id: string) => string,
): string[] {
  const last = patterns.map((p) => stopName(p.stopIds.at(-1)!));
  const withOrigin = patterns.map((p, i) =>
    last.filter((name) => name === last[i]).length > 1
      ? `${last[i]} (desde ${stopName(p.stopIds[0]!)})`
      : last[i]!,
  );
  return withOrigin.map((name, i) => {
    const same = withOrigin.filter((other) => other === name).length;
    if (same === 1) return name;
    const n = withOrigin.slice(0, i + 1).filter((other) => other === name).length;
    return `${name} ${n}`;
  });
}

/**
 * Paradas del recorrido donde la mayoría de sus viajes no deja subir o bajar.
 * No se publica lo evidente: no subir en la última ni bajar en la primera.
 */
function restrictionsOf(pattern: Pattern): {
  noBoarding: number[];
  noAlighting: number[];
} {
  const half = pattern.trips.length / 2;
  const count = (index: number, field: 'noBoarding' | 'noAlighting') =>
    pattern.trips.filter((t) => t.stops[index]![field]).length;
  const last = pattern.stopIds.length - 1;
  const noBoarding: number[] = [];
  const noAlighting: number[] = [];
  pattern.stopIds.forEach((_, i) => {
    if (i < last && count(i, 'noBoarding') > half) noBoarding.push(i);
    if (i > 0 && count(i, 'noAlighting') > half) noAlighting.push(i);
  });
  return { noBoarding, noAlighting };
}

/**
 * Puntos de cada trazado; se descartan los que caen fuera de `bounds` (datos
 * rotos). Los campos se recortan: algunos GTFS los rellenan con espacios.
 */
export function readShapes(
  rows: readonly Record<string, string>[],
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number },
): Map<string, LatLon[]> {
  const points = new Map<string, { seq: number; point: LatLon }[]>();
  for (const row of rows) {
    const lat = Number(row['shape_pt_lat']);
    const lon = Number(row['shape_pt_lon']);
    if (!(
      lat >= bounds.minLat &&
      lat <= bounds.maxLat &&
      lon >= bounds.minLon &&
      lon <= bounds.maxLon
    )) {
      continue;
    }
    const id = (row['shape_id'] ?? '').trim();
    const list = points.get(id) ?? [];
    list.push({ seq: Number(row['shape_pt_sequence']), point: [lat, lon] });
    points.set(id, list);
  }
  return new Map(
    [...points].map(([id, list]) => [id, list.sort((a, b) => a.seq - b.seq).map((p) => p.point)]),
  );
}

export function toMinutes(text: string): number | null {
  const match = /^(\d+):(\d{2}):(\d{2})$/.exec(text.trim());
  return match ? +match[1]! * 60 + +match[2]! + +match[3]! / 60 : null;
}

export function mostCommon(values: readonly string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

export function round5(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

/** "carpeta/routes.txt" -> "routes". */
export function baseName(path: string): string {
  return (path.split('/').pop() ?? '').replace(/\.(txt|csv)$/i, '');
}
