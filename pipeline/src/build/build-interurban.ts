/**
 * Autobuses interurbanos del Consorcio de Transporte Metropolitano del Área de
 * Málaga (ADR 0022): líneas, paradas, trazados y horario a partir del GTFS
 * unificado de la Red de Consorcios de Transporte de Andalucía, con el mismo
 * formato que la EMT y el metro para que la app los trate igual.
 *
 * Particularidades del GTFS (medidas el 21/10/2026):
 * - Trae los nueve consorcios; los identificadores del de Málaga empiezan por "4_".
 * - Cada recorrido distinto de una línea (con o sin paradas intermedias, ramales)
 *   se publica como un sentido propio, con su destino.
 * - "trip_headsign" viene vacío: el destino es el nombre de la última parada.
 * - "end_date" es 2030 en todos los servicios: se publican solo los próximos días.
 * - Los festivos añaden el servicio de domingo sin quitar el de laborable (no
 *   hay exception_type 2): esos días se quitan los servicios que no funcionan en
 *   domingo (ver holidayServiceDates).
 * - ~10 % de los pasos no permiten subir o bajar (p. ej. dentro de la capital):
 *   se publican por sentido en noBoarding / noAlighting.
 * - "route_color" es casi siempre el mismo verde: todas las líneas usan el color
 *   del modo interurbano de MalaGo (aprobado por David el 21/10/2026).
 */
import { strFromU8, unzipSync } from 'fflate';

import { INTERURBAN } from '../config.ts';
import type {
  PublishedDirection,
  PublishedLine,
  PublishedStop,
  TimetablesFile,
} from '../output-schema.ts';
import { parseCsv } from '../sources/csv.ts';
import { ValidationError } from '../validation.ts';
import { type LatLon, distanceM } from './geometry.ts';
import {
  type Trip,
  type TripStop,
  baseName,
  emptyPatternOutput,
  publishDirections,
  readShapes,
  round5,
  toMinutes,
} from './gtfs-patterns.ts';

export interface InterurbanData {
  lines: PublishedLine[];
  stops: PublishedStop[];
  /** Trazados por shapeId publicado ("i" + shape_id sin el prefijo del consorcio). */
  geometries: Map<string, LatLon[]>;
  timetables: Pick<TimetablesFile, 'services' | 'departures' | 'profiles' | 'departureProfiles'>;
}

/** Parada de la API del Consorcio (/Consorcios/4/paradas): solo lo que se usa. */
export interface ConsortiumStop {
  id: string;
  municipality: string;
  lat: number;
  lon: number;
}

const NEEDED = ['routes', 'stops', 'trips', 'stop_times', 'shapes', 'calendar', 'calendar_dates'];

/**
 * @param today Fecha AAAAMMDD desde la que se publican días de servicio.
 * @param lastDate Último día (AAAAMMDD) a publicar: el del horario de la EMT, para
 *   que "Cómo llegar" no ofrezca días en los que solo haya interurbanos.
 * @param minimums Líneas y paradas por debajo de las cuales la fuente se da por rota.
 */
export function buildInterurban(
  zip: Uint8Array,
  consortiumStops: readonly ConsortiumStop[] | null,
  today: string,
  lastDate: string,
  minimums: { minLines: number; minStops: number } = INTERURBAN,
): InterurbanData {
  const files = unzipSync(zip, {
    filter: (file) => NEEDED.includes(baseName(file.name)),
  });
  const texts = new Map(
    Object.entries(files).map(([name, bytes]) => [baseName(name), strFromU8(bytes)]),
  );
  const table = (name: string) => {
    const text = texts.get(name);
    return text ? parseCsv(text) : [];
  };
  const mine = (id: string | undefined) => (id ?? '').startsWith(INTERURBAN.areaPrefix);

  const routes = table('routes').filter((r) => mine(r['route_id']));
  const lineByRoute = new Map(
    routes.flatMap((r) => {
      const id = (r['route_short_name'] ?? '').trim();
      return id ? [[r['route_id']!, id] as const] : [];
    }),
  );
  const tripInfo = new Map(
    table('trips')
      .filter((t) => lineByRoute.has(t['route_id'] ?? ''))
      .map((t) => [t['trip_id'] ?? '', t]),
  );
  const rawStops = new Map(
    table('stops')
      .filter((s) => mine(s['stop_id']))
      .map((s) => [s['stop_id']!, s]),
  );
  if (routes.length === 0 || tripInfo.size === 0 || rawStops.size === 0) {
    throw new ValidationError('GTFS del Consorcio: sin líneas, viajes o paradas de Málaga');
  }

  const trips = readTrips(texts.get('stop_times') ?? '', tripInfo, lineByRoute, rawStops);
  const shapes = readShapes(
    table('shapes').filter((row) => mine(row['shape_id'])),
    INTERURBAN.bounds,
  );

  const serviceDates = holidayServiceDates(
    table('calendar').filter((row) => mine(row['service_id'])),
    table('calendar_dates').filter((row) => mine(row['service_id'])),
    today,
    lastDate,
  );

  const out = emptyPatternOutput();
  const stopName = (id: string) => (rawStops.get(id)?.['stop_name'] ?? id).trim();
  const stopPoint = (id: string): LatLon => {
    const raw = rawStops.get(id)!;
    return [Number(raw['stop_lat']), Number(raw['stop_lon'])];
  };
  const naming = {
    stopId: publishedStopId,
    serviceId: publishedServiceId,
    officialShapeId: (id: string) => `i${id.slice(INTERURBAN.areaPrefix.length)}`,
    approximateShapeId: (lineId: string, directionId: number) => `ai${lineId}-${directionId}`,
    stopName,
    stopPoint,
  };

  const byLine = new Map<string, Trip[]>();
  for (const trip of trips) {
    // Solo los viajes que circulan algún día publicado.
    if (!serviceDates.has(trip.serviceId)) continue;
    const list = byLine.get(trip.lineId) ?? [];
    list.push(trip);
    byLine.set(trip.lineId, list);
  }

  const lines: PublishedLine[] = [];
  for (const route of routes) {
    const lineId = lineByRoute.get(route['route_id'] ?? '');
    const lineTrips = lineId ? byLine.get(lineId) : undefined;
    // Una misma línea con varias rutas en el GTFS se publica una sola vez.
    if (!lineId || !lineTrips || lines.some((l) => l.id === lineId)) continue;

    const directions = publishDirections(lineId, lineTrips, shapes, naming, out);
    lines.push({
      id: lineId,
      name: lineName(route, lineId, directions[0], stopName),
      notes: '',
      mode: 'interurban',
      color: INTERURBAN.color,
      directions,
    });
  }
  lines.sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true }));

  const municipalityOf = municipalities(consortiumStops);
  const stops = [...out.usedStops].map((id): PublishedStop => {
    const [lat, lon] = stopPoint(id);
    return {
      id: publishedStopId(id),
      name: stopName(id),
      address: municipalityOf(id.slice(INTERURBAN.areaPrefix.length), lat, lon),
      lat: round5(lat),
      lon: round5(lon),
      mode: 'interurban',
    };
  });
  stops.sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true }));

  if (lines.length < minimums.minLines || stops.length < minimums.minStops) {
    throw new ValidationError(
      `GTFS del Consorcio: solo ${lines.length} líneas y ${stops.length} paradas con servicio`,
    );
  }

  const services = Object.fromEntries(
    [...serviceDates]
      .filter(([service]) => out.usedServices.has(service))
      .map(([service, dates]) => [publishedServiceId(service), dates]),
  );
  return {
    lines,
    stops,
    geometries: out.geometries,
    timetables: {
      services,
      departures: out.departures,
      profiles: out.profiles,
      departureProfiles: out.departureProfiles,
    },
  };
}

/** "4_149" -> "I149": con prefijo propio para no chocar con los códigos de la EMT. */
function publishedStopId(gtfsId: string): string {
  return `${INTERURBAN.stopPrefix}${gtfsId.slice(INTERURBAN.areaPrefix.length)}`;
}

/** Los servicios del Consorcio llevan delante "i" para no chocar con los de la EMT y el metro. */
function publishedServiceId(gtfsId: string): string {
  return `i${gtfsId.slice(INTERURBAN.areaPrefix.length)}`;
}

/**
 * stop_times de los nueve consorcios: se lee línea a línea (el fichero no usa
 * comillas) y solo se guardan los viajes de Málaga.
 */
function readTrips(
  csv: string,
  tripInfo: ReadonlyMap<string, Record<string, string>>,
  lineByRoute: ReadonlyMap<string, string>,
  rawStops: ReadonlyMap<string, unknown>,
): Trip[] {
  const rows = csv.replace(/^﻿/, '').split(/\r?\n/);
  const header = (rows[0] ?? '').split(',').map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const [tripCol, arrivalCol, departureCol, stopCol, sequenceCol, pickupCol, dropOffCol] = [
    col('trip_id'),
    col('arrival_time'),
    col('departure_time'),
    col('stop_id'),
    col('stop_sequence'),
    col('pickup_type'),
    col('drop_off_type'),
  ];
  if (tripCol < 0 || stopCol < 0 || sequenceCol < 0) {
    throw new ValidationError(
      'GTFS del Consorcio: stop_times sin trip_id, stop_id o stop_sequence',
    );
  }
  const byTrip = new Map<string, (TripStop & { sequence: number })[]>();
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]!.split(',');
    const tripId = cells[tripCol]?.trim() ?? '';
    const stopId = cells[stopCol]?.trim() ?? '';
    if (!tripInfo.has(tripId) || !rawStops.has(stopId)) continue;
    const minutes = toMinutes(cells[departureCol] || cells[arrivalCol] || '');
    if (minutes === null) continue;
    const list = byTrip.get(tripId) ?? [];
    list.push({
      sequence: Number(cells[sequenceCol]),
      stopId,
      minutes,
      noBoarding: cells[pickupCol]?.trim() === '1',
      noAlighting: cells[dropOffCol]?.trim() === '1',
    });
    byTrip.set(tripId, list);
  }
  return [...byTrip].flatMap(([tripId, list]): Trip[] => {
    if (list.length < 2) return [];
    list.sort((a, b) => a.sequence - b.sequence);
    const info = tripInfo.get(tripId)!;
    return [
      {
        id: tripId,
        lineId: lineByRoute.get(info['route_id'] ?? '')!,
        serviceId: info['service_id'] ?? '',
        shapeId: info['shape_id'] ?? '',
        stops: list.map(({ sequence: _, ...stop }) => stop),
      },
    ];
  });
}

/** Nombre de la línea: el largo del GTFS sin el código delante, o "origen - destino". */
function lineName(
  route: Record<string, string>,
  lineId: string,
  main: PublishedDirection | undefined,
  stopName: (id: string) => string,
): string {
  const long = (route['route_long_name'] ?? '').trim();
  const withoutCode = long.startsWith(lineId) ? long.slice(lineId.length).trim() : long;
  if (withoutCode) return withoutCode;
  if (!main) return lineId;
  const first = main.stopIds[0]!.slice(INTERURBAN.stopPrefix.length);
  return `${stopName(`${INTERURBAN.areaPrefix}${first}`)} - ${main.headsign}`;
}

/**
 * Días de cada servicio entre `today` (incluido, menos un día para los viajes
 * que pasan de medianoche) y `lastDate`.
 *
 * Los festivos del Consorcio solo añaden (exception_type 1) el servicio de
 * domingo: un día entre semana en que se añade un servicio que funciona en
 * domingo se trata como festivo y ese día se quitan los servicios que no
 * funcionan en domingo. Si no, el 8 de diciembre saldrían a la vez el horario
 * de laborable y el de domingo (2.448 viajes en vez de ~1.000).
 */
export function holidayServiceDates(
  calendar: readonly Record<string, string>[],
  calendarDates: readonly Record<string, string>[],
  today: string,
  lastDate: string,
): Map<string, string[]> {
  const first = parseDate(addDays(today, -1))!;
  const last = parseDate(lastDate);
  if (!last || last < first) return new Map();
  const runsOnSunday = new Map(
    calendar.map((row) => [row['service_id'] ?? '', row['sunday'] === '1']),
  );

  const dates = new Map<string, Set<string>>();
  const add = (service: string, date: string) => {
    const set = dates.get(service) ?? new Set<string>();
    set.add(date);
    dates.set(service, set);
  };
  const inWindow = (date: Date) => date >= first && date <= last;

  for (const row of calendar) {
    const service = row['service_id'];
    const start = parseDate(row['start_date']);
    const end = parseDate(row['end_date']);
    if (!service || !start || !end) continue;
    const from = start > first ? start : first;
    const to = end < last ? end : last;
    for (let day = from; day <= to; day = new Date(day.getTime() + 86_400_000)) {
      if (row[WEEKDAYS[day.getUTCDay()]!] === '1') add(service, formatDate(day));
    }
  }

  const holidays = new Set<string>();
  for (const row of calendarDates) {
    const service = row['service_id'];
    const day = parseDate(row['date']);
    if (!service || !day || !inWindow(day)) continue;
    const date = formatDate(day);
    if (row['exception_type'] === '1') {
      add(service, date);
      if (runsOnSunday.get(service) && day.getUTCDay() !== 0) holidays.add(date);
    } else if (row['exception_type'] === '2') {
      dates.get(service)?.delete(date);
    }
  }
  const addedOn = new Set(
    calendarDates
      .filter((row) => row['exception_type'] === '1')
      .map((row) => `${row['service_id']}|${row['date']}`),
  );
  for (const date of holidays) {
    for (const [service, set] of dates) {
      if (!runsOnSunday.get(service) && !addedOn.has(`${service}|${date}`)) set.delete(date);
    }
  }
  return new Map(
    [...dates]
      .filter(([, set]) => set.size > 0)
      .map(([service, set]) => [service, [...set].sort()]),
  );
}

/**
 * Municipio de cada parada según la API del Consorcio. Las paradas que la API no
 * trae (sobre todo las de vuelta, "… V") toman el de la parada más cercana a
 * menos de 2 km; más lejos se deja en blanco antes que inventarlo.
 */
function municipalities(
  consortiumStops: readonly ConsortiumStop[] | null,
): (id: string, lat: number, lon: number) => string {
  if (!consortiumStops?.length) return () => '';
  const byId = new Map(consortiumStops.map((s) => [s.id, s.municipality]));
  return (id, lat, lon) => {
    const known = byId.get(id);
    if (known) return known;
    let best = '';
    let bestMeters: number = INTERURBAN.municipalityMatchM;
    for (const s of consortiumStops) {
      const meters = distanceM([lat, lon], [s.lat, s.lon]);
      if (meters < bestMeters) {
        best = s.municipality;
        bestMeters = meters;
      }
    }
    return best;
  };
}

/** Lee la respuesta de /Consorcios/4/paradas; ignora las entradas incompletas. */
export function parseConsortiumStops(json: unknown): ConsortiumStop[] {
  const list = (json as { paradas?: unknown } | null)?.paradas;
  if (!Array.isArray(list)) throw new ValidationError('API del Consorcio: falta "paradas"');
  return list.flatMap((item): ConsortiumStop[] => {
    const s = item as Record<string, unknown>;
    const lat = Number(s['latitud']);
    const lon = Number(s['longitud']);
    const id = String(s['idParada'] ?? '');
    const municipality = String(s['municipio'] ?? '').trim();
    return id && municipality && Number.isFinite(lat) && Number.isFinite(lon)
      ? [{ id, municipality, lat, lon }]
      : [];
  });
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function parseDate(value: string | undefined): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value ?? '');
  return match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : null;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

export function addDays(dateKey: string, days: number): string {
  const date = parseDate(dateKey)!;
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}
