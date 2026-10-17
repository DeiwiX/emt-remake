/**
 * Metro de Málaga (Fase 11, ADR 0017): líneas, estaciones, trazados y horario a
 * partir de su GTFS oficial, con el mismo formato que la EMT para que la app los
 * trate igual (buscador, Cerca de mí, favoritos, próximos trenes y "Cómo llegar").
 *
 * - Las estaciones con andenes por línea (El Perchel, Guadalmedina) se publican
 *   como una sola parada: así el transbordo L1–L2 es en la misma parada.
 * - Los códigos llevan delante "M" para no chocar con los de la EMT (numéricos).
 * - Cada sentido usa la secuencia de estaciones más frecuente; sus minutos
 *   típicos son la mediana de los viajes, y cada viaje guarda su paso exacto.
 */
import { strFromU8, unzipSync } from 'fflate';

import { SCHEMA_VERSION } from '../config.ts';
import type {
  PublishedDirection,
  PublishedLine,
  PublishedStop,
  TimetablesFile,
} from '../output-schema.ts';
import { parseCsv } from '../sources/csv.ts';
import { parseServiceDates } from '../sources/gtfs.ts';
import { ValidationError } from '../validation.ts';
import type { LatLon } from './geometry.ts';

export interface MetroData {
  lines: PublishedLine[];
  stops: PublishedStop[];
  /** Trazados por shapeId publicado ("m" + shape_id del GTFS). */
  geometries: Map<string, LatLon[]>;
  timetables: Pick<TimetablesFile, 'services' | 'departures' | 'profiles' | 'departureProfiles'>;
}

/** Prefijo de los códigos de estación del metro. */
export const METRO_STOP_PREFIX = 'M';

interface Trip {
  routeId: string;
  serviceId: string;
  directionId: string;
  shapeId: string;
  /** Estaciones (código publicado) y minutos desde la medianoche en cada una. */
  stations: string[];
  minutes: number[];
}

export function buildMetro(zip: Uint8Array): MetroData {
  const files = unzipSync(zip);
  const table = (name: string): Record<string, string>[] => {
    const entry = Object.entries(files).find(([path]) =>
      (path.split('/').pop() ?? '').startsWith(`${name}.`),
    );
    return entry ? parseCsv(strFromU8(entry[1])) : [];
  };
  const routes = table('routes');
  const stopsRaw = table('stops');
  const tripsRaw = table('trips');
  const stopTimes = table('stop_times');
  const shapesRaw = table('shapes');
  if (!routes.length || !stopsRaw.length || !tripsRaw.length || !stopTimes.length) {
    throw new ValidationError('GTFS del metro: faltan routes, stops, trips o stop_times');
  }

  // Andén -> estación (la estación padre si la hay).
  const rawById = new Map(stopsRaw.map((s) => [s['stop_id'] ?? '', s]));
  const stationOf = (stopId: string) => {
    const parent = rawById.get(stopId)?.['parent_station'];
    return `${METRO_STOP_PREFIX}${parent || stopId}`;
  };

  // Viajes con su paso por cada estación.
  const tripInfo = new Map(tripsRaw.map((t) => [t['trip_id'] ?? '', t]));
  const byTrip = new Map<string, { seq: number; station: string; minutes: number }[]>();
  for (const row of stopTimes) {
    const tripId = row['trip_id'] ?? '';
    const time = toMinutes(row['departure_time'] || row['arrival_time'] || '');
    if (!tripInfo.has(tripId) || time === null) continue;
    const list = byTrip.get(tripId) ?? [];
    list.push({
      seq: Number(row['stop_sequence']),
      station: stationOf(row['stop_id'] ?? ''),
      minutes: time,
    });
    byTrip.set(tripId, list);
  }
  const trips: Trip[] = [...byTrip].flatMap(([tripId, list]) => {
    const t = tripInfo.get(tripId)!;
    list.sort((a, b) => a.seq - b.seq);
    if (list.length < 2) return [];
    return [
      {
        routeId: t['route_id'] ?? '',
        serviceId: t['service_id'] ?? '',
        directionId: t['direction_id'] ?? '',
        shapeId: t['shape_id'] ?? '',
        stations: list.map((s) => s.station),
        minutes: list.map((s) => s.minutes),
      },
    ];
  });

  const shapes = new Map<string, { seq: number; point: LatLon }[]>();
  for (const row of shapesRaw) {
    const id = row['shape_id'] ?? '';
    const list = shapes.get(id) ?? [];
    list.push({
      seq: Number(row['shape_pt_sequence']),
      point: [Number(row['shape_pt_lat']), Number(row['shape_pt_lon'])],
    });
    shapes.set(id, list);
  }

  const usedStations = new Set<string>();
  const geometries = new Map<string, LatLon[]>();
  const departures: TimetablesFile['departures'] = {};
  const profiles: NonNullable<TimetablesFile['profiles']> = {};
  const departureProfiles: NonNullable<TimetablesFile['departureProfiles']> = {};
  const usedServices = new Set<string>();

  const lines: PublishedLine[] = routes.map((route): PublishedLine => {
    const id = (route['route_short_name'] ?? '').trim();
    const routeTrips = trips.filter((t) => t.routeId === route['route_id']);
    // Sentido 1 = direction_id "0" del GTFS y sentido 2 = "1", como "ida" y "vuelta".
    const directions = ['0', '1'].flatMap((gtfsDirection, i): PublishedDirection[] => {
      const dirTrips = routeTrips.filter((t) => t.directionId === gtfsDirection);
      if (dirTrips.length === 0) return [];
      const stations = mostCommon(dirTrips.map((t) => t.stations.join('>')))!.split('>');
      const shapeId = mostCommon(dirTrips.map((t) => t.shapeId))!;
      const points = (shapes.get(shapeId) ?? []).sort((a, b) => a.seq - b.seq).map((p) => p.point);
      const publishedShape = `m${shapeId}`;
      if (points.length > 1) geometries.set(publishedShape, points);
      stations.forEach((s) => usedStations.add(s));

      // Paso exacto de cada viaje (relativo a su salida) por las estaciones del sentido.
      const exact = dirTrips.filter((t) => t.stations.join('>') === stations.join('>'));
      const relative = exact.map((t) => t.minutes.map((m) => Math.round(m - t.minutes[0]!)));
      const typical = stations.map((_, k) => median(relative.map((r) => r[k]!)));

      const directionId = i + 1;
      const key = `${id}|${directionId}`;
      const list: number[][] = [];
      const indexOf = new Map<string, number>();
      const byService: Record<string, { start: number; profile: number }[]> = {};
      exact.forEach((t, k) => {
        const profile = relative[k]!;
        const profileKey = profile.join(',');
        let index = indexOf.get(profileKey);
        if (index === undefined) {
          index = list.push(profile) - 1;
          indexOf.set(profileKey, index);
        }
        (byService[t.serviceId] ??= []).push({ start: Math.round(t.minutes[0]!), profile: index });
        usedServices.add(t.serviceId);
      });
      departures[key] = {};
      departureProfiles[key] = {};
      for (const [service, items] of Object.entries(byService)) {
        items.sort((a, b) => a.start - b.start);
        departures[key][service] = items.map((d) => d.start);
        departureProfiles[key][service] = items.map((d) => d.profile);
      }
      profiles[key] = list;

      return [
        {
          id: directionId,
          headsign: stationName(stations.at(-1)!),
          stopIds: stations,
          shapeId: points.length > 1 ? publishedShape : `a${id}-${directionId}`,
          shapeQuality: points.length > 1 ? 'official' : 'approximate',
          minutes: typical,
          timesSource: 'schedule',
        },
      ];
    });
    const first = directions[0];
    return {
      id,
      name: first ? `${stationName(first.stopIds[0]!)} - ${first.headsign}` : id,
      notes: '',
      mode: 'metro',
      color: color(route['route_color']),
      directions,
    };
  });

  // Paradas sin trazado: se dibujan uniendo estaciones.
  for (const line of lines) {
    for (const d of line.directions) {
      if (d.shapeQuality === 'approximate') geometries.set(d.shapeId, d.stopIds.map(stationPoint));
    }
  }

  function stationName(code: string): string {
    const raw = rawById.get(code.slice(METRO_STOP_PREFIX.length));
    return (raw?.['stop_name'] ?? code).trim();
  }
  function stationPoint(code: string): LatLon {
    const raw = rawById.get(code.slice(METRO_STOP_PREFIX.length));
    return [Number(raw?.['stop_lat']), Number(raw?.['stop_lon'])];
  }

  const stops: PublishedStop[] = [...usedStations].sort().map((code): PublishedStop => {
    const raw = rawById.get(code.slice(METRO_STOP_PREFIX.length))!;
    return {
      id: code,
      name: (raw['stop_name'] ?? '').trim(),
      address: (raw['stop_desc'] ?? '').trim(),
      lat: round5(Number(raw['stop_lat'])),
      lon: round5(Number(raw['stop_lon'])),
      mode: 'metro',
    };
  });
  if (lines.length === 0 || stops.length === 0) {
    throw new ValidationError('GTFS del metro: sin líneas o estaciones');
  }

  const serviceDates = parseServiceDates(table('calendar'), table('calendar_dates'));
  const services = Object.fromEntries(
    [...serviceDates].filter(([service]) => usedServices.has(service)),
  );
  return {
    lines,
    stops,
    geometries,
    timetables: { services, departures, profiles, departureProfiles },
  };
}

/** Une el metro a los datos de la EMT (líneas, paradas y horario). */
export function mergeTimetables(
  base: TimetablesFile,
  metro: MetroData['timetables'],
): TimetablesFile {
  return {
    // El tiempo real (livePatterns, liveTrips) es solo de la EMT: se conserva tal cual.
    ...base,
    schemaVersion: SCHEMA_VERSION,
    services: { ...base.services, ...metro.services },
    departures: { ...base.departures, ...metro.departures },
    profiles: { ...base.profiles, ...metro.profiles },
    departureProfiles: { ...base.departureProfiles, ...metro.departureProfiles },
  };
}

function toMinutes(text: string): number | null {
  const match = /^(\d+):(\d{2}):(\d{2})$/.exec(text.trim());
  return match ? +match[1]! * 60 + +match[2]! + +match[3]! / 60 : null;
}

function mostCommon(values: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function color(value: string | undefined): string | undefined {
  return value && /^[0-9a-f]{6}$/i.test(value) ? `#${value.toUpperCase()}` : undefined;
}

function round5(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}
