import { strFromU8, unzipSync } from 'fflate';

import { parseCsv } from './csv.ts';
import { type TravelPattern, parseStopTimes } from './gtfs-times.ts';
import type { LatLon } from '../build/geometry.ts';
import { ValidationError, requireMalagaCoordinate, requireNumber } from '../validation.ts';

export interface GtfsShapeUsage {
  shapeId: string;
  /** Número de viajes que usan este trazado: sirve para elegir la variante principal. */
  trips: number;
}

export interface GtfsData {
  /** Trazados por shape_id, con los puntos en orden. */
  shapes: Map<string, LatLon[]>;
  /** Trazados usados por cada línea (route_short_name), de más a menos viajes. */
  shapesByLineCode: Map<string, GtfsShapeUsage[]>;
  /** Tiempos de viaje por trazado según el horario (vacío si faltan stops o stop_times). */
  travelPatterns: Map<string, TravelPattern>;
  /** Viajes programados con su día de servicio y hora de salida (si hay stop_times). */
  trips: GtfsTrip[];
  /** Fechas (AAAAMMDD) en que funciona cada servicio, según calendar y calendar_dates. */
  serviceDates: Map<string, string[]>;
}

export interface GtfsTrip {
  lineCode: string;
  serviceId: string;
  directionId: string;
  shapeId: string;
  /** Segundos desde medianoche del día de servicio (puede pasar de 24 h). */
  startSeconds: number;
}

const NEEDED_FILES = ['routes', 'trips', 'shapes'] as const;
type NeededFile = (typeof NEEDED_FILES)[number];
/** Para los tiempos de viaje; si faltan, se estiman por distancia. */
const OPTIONAL_FILES = ['stops', 'stop_times', 'calendar', 'calendar_dates'] as const;

export function parseGtfsZip(zip: Uint8Array): GtfsData {
  const files = unzipSync(zip, {
    filter: (file) =>
      ([...NEEDED_FILES, ...OPTIONAL_FILES] as readonly string[]).includes(baseName(file.name)),
  });
  const texts = new Map(
    Object.entries(files).map(([name, bytes]) => [baseName(name), strFromU8(bytes)]),
  );
  // stop_times es enorme: no pasa por el parser general (ver gtfs-times.ts).
  const tables = new Map<string, Record<string, string>[]>(
    [...texts]
      .filter(([name]) => name !== 'stop_times')
      .map(([name, text]) => [name, parseCsv(text)]),
  );
  const table = (name: NeededFile): Record<string, string>[] => {
    const rows = tables.get(name);
    if (!rows?.length) throw new ValidationError(`GTFS: falta o está vacío ${name}`);
    return rows;
  };

  const lineCodeByRouteId = new Map(
    table('routes').map((r) => [r['route_id'] ?? '', (r['route_short_name'] ?? '').trim()]),
  );

  const usage = new Map<string, Map<string, number>>();
  for (const trip of table('trips')) {
    const code = lineCodeByRouteId.get(trip['route_id'] ?? '');
    const shapeId = trip['shape_id'];
    if (!code || !shapeId) continue;
    const counts = usage.get(code) ?? new Map<string, number>();
    counts.set(shapeId, (counts.get(shapeId) ?? 0) + 1);
    usage.set(code, counts);
  }

  const shapesByLineCode = new Map(
    [...usage.entries()].map(([code, counts]) => [
      code,
      [...counts.entries()]
        .map(([shapeId, trips]) => ({ shapeId, trips }))
        .sort((a, b) => b.trips - a.trips),
    ]),
  );

  const stopTimes = texts.get('stop_times');
  const stops = tables.get('stops');
  const summary =
    stopTimes && stops
      ? parseStopTimes(stopTimes, table('trips'), stops)
      : { patterns: new Map<string, TravelPattern>(), tripStarts: new Map<string, number>() };

  const trips: GtfsTrip[] = table('trips').flatMap((t) => {
    const startSeconds = summary.tripStarts.get(t['trip_id'] ?? '');
    const lineCode = lineCodeByRouteId.get(t['route_id'] ?? '');
    if (startSeconds === undefined || !lineCode || !t['service_id'] || !t['shape_id']) return [];
    return [
      {
        lineCode,
        serviceId: t['service_id'],
        directionId: t['direction_id'] ?? '',
        shapeId: t['shape_id'],
        startSeconds,
      },
    ];
  });

  return {
    shapes: parseShapes(table('shapes')),
    shapesByLineCode,
    travelPatterns: summary.patterns,
    trips,
    serviceDates: parseServiceDates(
      tables.get('calendar') ?? [],
      tables.get('calendar_dates') ?? [],
    ),
  };
}

function parseShapes(rows: Record<string, string>[]): Map<string, LatLon[]> {
  const points = new Map<string, { seq: number; point: LatLon }[]>();
  rows.forEach((row, i) => {
    const where = `GTFS shapes, fila ${i + 2}`;
    const id = row['shape_id'];
    if (!id) throw new ValidationError(`${where}: falta shape_id`);
    const lat = requireNumber(row['shape_pt_lat'], `${where}.shape_pt_lat`);
    const lon = requireNumber(row['shape_pt_lon'], `${where}.shape_pt_lon`);
    requireMalagaCoordinate(lat, lon, where);
    const list = points.get(id) ?? [];
    list.push({ seq: requireNumber(row['shape_pt_sequence'], `${where}.seq`), point: [lat, lon] });
    points.set(id, list);
  });
  return new Map(
    [...points.entries()].map(([id, list]) => [
      id,
      list.sort((a, b) => a.seq - b.seq).map((p) => p.point),
    ]),
  );
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Días de cada servicio: rangos semanales de calendar más altas (1) y bajas (2)
 * de calendar_dates. El GTFS de la EMT usa solo calendar_dates.
 */
export function parseServiceDates(
  calendar: Record<string, string>[],
  calendarDates: Record<string, string>[],
): Map<string, string[]> {
  const dates = new Map<string, Set<string>>();
  const add = (service: string, date: string) => {
    const set = dates.get(service) ?? new Set<string>();
    set.add(date);
    dates.set(service, set);
  };
  for (const row of calendar) {
    const service = row['service_id'];
    const start = parseDate(row['start_date']);
    const end = parseDate(row['end_date']);
    if (!service || !start || !end) continue;
    for (let day = start; day <= end; day = new Date(day.getTime() + 86_400_000)) {
      if (row[WEEKDAYS[day.getUTCDay()]!] === '1') add(service, formatDate(day));
    }
  }
  for (const row of calendarDates) {
    const service = row['service_id'];
    const date = row['date'];
    if (!service || !date) continue;
    if (row['exception_type'] === '1') add(service, date);
    else if (row['exception_type'] === '2') dates.get(service)?.delete(date);
  }
  return new Map([...dates].map(([service, set]) => [service, [...set].sort()]));
}

function parseDate(value: string | undefined): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value ?? '');
  return match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : null;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

/** "carpeta/routes.txt" -> "routes" (el portal publica variantes .txt y .csv). */
function baseName(path: string): string {
  return (path.split('/').pop() ?? '').replace(/\.(txt|csv)$/i, '');
}
