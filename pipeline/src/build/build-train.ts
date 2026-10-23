/**
 * Cercanías de Málaga, C1 y C2 (ADR 0023): líneas, estaciones, trazados y
 * horario a partir del GTFS de Cercanías de Renfe, con el mismo formato que los
 * interurbanos para que la app los trate igual.
 *
 * Particularidades del GTFS (medidas el 23/10/2026):
 * - Trae todos los núcleos de España (290 MB sin comprimir, 273 de ellos
 *   stop_times): se lee por trozos y solo se guarda lo del núcleo de Málaga
 *   (rutas y viajes que empiezan por "32").
 * - Los campos llevan espacios de relleno y stop_sequence va con ceros ("001").
 * - Un service_id por día ("3201J"), unos 30 días por delante, sin calendar_dates.
 * - Las rutas 32T0019C2 y 32T0020C2 son las vueltas del tren en Álora, con una
 *   parada o ninguna: se descartan solas (un viaje necesita dos paradas).
 * - "trip_headsign" viene vacío: el destino es el nombre de la última parada.
 * - El trazado "32_C1" está dibujado desde Fuengirola aunque sus viajes salgan
 *   de Málaga: se orienta según las paradas (drawnBackwards).
 * - Sin pickup_type ni drop_off_type: en todas las estaciones se sube y se baja.
 */
import { strFromU8, unzipSync } from 'fflate';

import { TRAIN } from '../config.ts';
import type {
  PublishedLine,
  PublishedStop,
  TimetablesFile,
  TransitMode,
} from '../output-schema.ts';
import { parseCsv } from '../sources/csv.ts';
import { ValidationError } from '../validation.ts';
import type { LatLon } from './geometry.ts';
import {
  type Trip,
  baseName,
  emptyPatternOutput,
  mostCommon,
  publishDirections,
  readShapes,
  round5,
  toMinutes,
} from './gtfs-patterns.ts';
import { holidayServiceDates } from './build-interurban.ts';

export interface TrainData {
  lines: PublishedLine[];
  stops: PublishedStop[];
  /** Trazados por shapeId publicado ("t" + shape_id). */
  geometries: Map<string, LatLon[]>;
  timetables: Pick<
    TimetablesFile,
    'services' | 'departures' | 'profiles' | 'departureProfiles' | 'departureTrains'
  >;
}

const NEEDED = ['routes', 'stops', 'trips', 'stop_times', 'shapes', 'calendar', 'calendar_dates'];

/**
 * @param today Fecha AAAAMMDD desde la que se publican días de servicio.
 * @param lastDate Último día (AAAAMMDD) a publicar: el del horario de la EMT.
 * @param minimums Líneas y estaciones por debajo de las cuales la fuente se da por rota.
 */
export function buildTrain(
  zip: Uint8Array,
  today: string,
  lastDate: string,
  minimums: { minLines: number; minStops: number } = TRAIN,
): TrainData {
  const files = unzipSync(zip, {
    filter: (file) => NEEDED.includes(baseName(file.name)),
  });
  const bytes = new Map(Object.entries(files).map(([name, data]) => [baseName(name), data]));
  const mine = (id: string | undefined) => (id ?? '').startsWith(TRAIN.areaPrefix);
  // Del fichero nacional solo se lee (y se pasa por el lector CSV) lo de Málaga.
  const table = (name: string, keyColumn?: string) => {
    const data = bytes.get(name);
    if (!data) return [];
    return trimmed(parseCsv(keyColumn ? linesWhere(data, keyColumn, mine) : strFromU8(data)));
  };

  const routes = table('routes', 'route_id');
  const lineByRoute = new Map(
    routes.flatMap((r) =>
      r['route_short_name']
        ? [[r['route_id']!, publishedLineId(r['route_short_name'])] as const]
        : [],
    ),
  );
  const tripInfo = new Map(
    table('trips', 'route_id')
      .filter((t) => lineByRoute.has(t['route_id'] ?? ''))
      .map((t) => [t['trip_id'] ?? '', t]),
  );
  const rawStops = new Map(table('stops').map((s) => [s['stop_id']!, s]));
  if (routes.length === 0 || tripInfo.size === 0) {
    throw new ValidationError('GTFS de Cercanías: sin líneas ni viajes de Málaga');
  }

  const trips = readTrips(bytes.get('stop_times'), tripInfo, lineByRoute, rawStops);
  const shapes = readShapes(table('shapes', 'shape_id'), TRAIN.bounds);
  const serviceDates = holidayServiceDates(
    table('calendar', 'service_id'),
    table('calendar_dates', 'service_id'),
    today,
    lastDate,
  );

  const stopName = (id: string) => rawStops.get(id)?.['stop_name'] || id;
  const stopPoint = (id: string): LatLon => {
    const raw = rawStops.get(id)!;
    return [Number(raw['stop_lat']), Number(raw['stop_lon'])];
  };
  const out = emptyPatternOutput();
  const departureTrains: NonNullable<TimetablesFile['departureTrains']> = {};
  const naming = {
    stopId: publishedStopId,
    serviceId: publishedServiceId,
    officialShapeId: (id: string) => `t${id}`,
    approximateShapeId: (lineId: string, directionId: number) => `at${lineId}-${directionId}`,
    stopName,
    stopPoint,
  };

  const byLine = new Map<string, Trip[]>();
  for (const trip of trips) {
    if (!serviceDates.has(trip.serviceId)) continue;
    const list = byLine.get(trip.lineId) ?? [];
    list.push(trip);
    byLine.set(trip.lineId, list);
  }

  // La primera ruta de cada línea (32T0001C1, 32T0003C2) es la que sale de Málaga:
  // su sentido va primero y su nombre es el de la línea.
  const firstRoute = new Map<string, Record<string, string>>();
  for (const route of [...routes].sort((a, b) => a['route_id']!.localeCompare(b['route_id']!))) {
    const lineId = lineByRoute.get(route['route_id']!);
    if (lineId && !firstRoute.has(lineId)) firstRoute.set(lineId, route);
  }

  const lines: PublishedLine[] = [];
  for (const [lineId, lineTrips] of byLine) {
    const route = firstRoute.get(lineId);
    const firstStop = mostCommon(
      lineTrips
        .filter((t) => tripInfo.get(t.id)?.['route_id'] === route?.['route_id'])
        .map((t) => t.stops[0]!.stopId),
    );
    const directions = publishDirections(lineId, lineTrips, shapes, naming, out, {
      firstStop,
      onDeparture: (key, service, trip) => {
        ((departureTrains[key] ??= {})[service] ??= []).push(trainNumber(trip));
      },
    });
    const main = directions[0]!;
    lines.push({
      id: lineId,
      name:
        endsOf(route?.['route_long_name'] ?? '') ??
        `${stopName(main.stopIds[0]!.slice(TRAIN.stopPrefix.length))} - ${main.headsign}`,
      notes: '',
      mode: 'train',
      color: TRAIN.color,
      directions,
    });
  }
  lines.sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true }));

  const stops = [...out.usedStops].map((id): PublishedStop => {
    const [lat, lon] = stopPoint(id);
    return {
      id: publishedStopId(id),
      name: stopName(id),
      address: '',
      lat: round5(lat),
      lon: round5(lon),
      mode: 'train',
    };
  });
  stops.sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true }));

  if (lines.length < minimums.minLines || stops.length < minimums.minStops) {
    throw new ValidationError(
      `GTFS de Cercanías: solo ${lines.length} líneas y ${stops.length} estaciones con servicio`,
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
      departureTrains,
    },
  };
}

/**
 * Paradas de la ciudad, para la red peatonal y las capas del mapa: sin las
 * interurbanas y, de Cercanías, solo las estaciones dentro del recuadro de las
 * paradas de la EMT y el metro.
 */
export function withinCity<T extends { lat: number; lon: number; mode?: TransitMode }>(
  stops: readonly T[],
): T[] {
  const city = stops.filter((stop) => stop.mode === undefined || stop.mode === 'metro');
  const lats = city.map((stop) => stop.lat);
  const lons = city.map((stop) => stop.lon);
  const [minLat, maxLat, minLon, maxLon] = [
    Math.min(...lats),
    Math.max(...lats),
    Math.min(...lons),
    Math.max(...lons),
  ];
  return stops.filter(
    (stop) =>
      stop.mode === undefined ||
      stop.mode === 'metro' ||
      (stop.mode === 'train' &&
        stop.lat >= minLat &&
        stop.lat <= maxLat &&
        stop.lon >= minLon &&
        stop.lon <= maxLon),
  );
}

/**
 * "Málaga-Centro Alameda      -Fuengirola" -> "Málaga-Centro Alameda - Fuengirola":
 * Renfe separa los extremos con espacios y un guion (los nombres llevan guiones
 * sin espacios). null si falta alguno de los dos.
 */
function endsOf(longName: string): string | null {
  const ends = longName.split(/\s+-\s*/).map((end) => end.trim());
  return ends.length === 2 && ends.every(Boolean) ? `${ends[0]} - ${ends[1]}` : null;
}

/** "54517" -> "T54517": con prefijo propio para no chocar con los códigos de la EMT. */
function publishedStopId(gtfsId: string): string {
  return `${TRAIN.stopPrefix}${gtfsId}`;
}

/** Los servicios de Renfe llevan delante "t" para no chocar con los de las demás redes. */
function publishedServiceId(gtfsId: string): string {
  return `t${gtfsId}`;
}

/**
 * "C1" -> "C-1", como en las estaciones de Renfe: la EMT tiene sus propias
 * líneas C1 y C2 (circulares) y los códigos de línea tienen que ser únicos.
 */
export function publishedLineId(code: string): string {
  return code.replace(/^([A-Z]+)(\d+)$/, '$1-$2');
}

/**
 * Número de tren de un viaje: las cifras que siguen al servicio en el trip_id
 * ("3201J23303C1" -> "23303"). La app rehace el trip_id del tiempo real con el
 * servicio, este número y la línea.
 */
export function trainNumber(trip: Pick<Trip, 'id' | 'serviceId'>): string {
  const rest = trip.id.startsWith(trip.serviceId) ? trip.id.slice(trip.serviceId.length) : trip.id;
  return /^\d+/.exec(rest)?.[0] ?? rest;
}

/** Filas con todos los campos recortados (Renfe los rellena con espacios). */
function trimmed(rows: Record<string, string>[]): Record<string, string>[] {
  return rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value.trim()])),
  );
}

/** Lee un fichero grande por trozos de líneas sin pasarlo entero a texto. */
function* textLines(data: Uint8Array): Generator<string> {
  const decoder = new TextDecoder();
  const CHUNK = 8 * 1024 * 1024;
  let rest = '';
  for (let offset = 0; offset < data.length; offset += CHUNK) {
    const text = rest + decoder.decode(data.subarray(offset, offset + CHUNK), { stream: true });
    const lines = text.split(/\r?\n/);
    rest = lines.pop() ?? '';
    yield* lines;
  }
  rest += decoder.decode();
  if (rest) yield rest;
}

/** La cabecera de un fichero leído con textLines, sin la marca BOM. */
function firstLine(lines: Generator<string>): string {
  const first = lines.next();
  return first.done ? '' : first.value.replace(/^\uFEFF/, '');
}

/**
 * La cabecera y las filas cuyo campo `keyColumn` cumple `keep`, como texto CSV.
 * Los identificadores de Renfe no van entre comillas: basta con partir por comas
 * hasta esa columna.
 */
function linesWhere(data: Uint8Array, keyColumn: string, keep: (id: string) => boolean): string {
  const lines = textLines(data);
  const header = firstLine(lines);
  const column = header.split(',').findIndex((name) => name.trim() === keyColumn);
  if (column < 0) return header;
  const kept = [header];
  for (const line of lines) {
    if (keep(line.split(',', column + 1)[column]?.trim() ?? '')) kept.push(line);
  }
  return kept.join('\n');
}

/** Viajes de Málaga con sus paradas en orden, leyendo stop_times por trozos. */
function readTrips(
  data: Uint8Array | undefined,
  tripInfo: ReadonlyMap<string, Record<string, string>>,
  lineByRoute: ReadonlyMap<string, string>,
  rawStops: ReadonlyMap<string, unknown>,
): Trip[] {
  if (!data) throw new ValidationError('GTFS de Cercanías: falta stop_times');
  const lines = textLines(data);
  const header = firstLine(lines)
    .split(',')
    .map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const [tripCol, arrivalCol, departureCol, stopCol, sequenceCol] = [
    col('trip_id'),
    col('arrival_time'),
    col('departure_time'),
    col('stop_id'),
    col('stop_sequence'),
  ];
  if (tripCol < 0 || stopCol < 0 || sequenceCol < 0) {
    throw new ValidationError('GTFS de Cercanías: stop_times sin trip_id, stop_id o stop_sequence');
  }
  const byTrip = new Map<string, { sequence: number; stopId: string; minutes: number }[]>();
  for (const line of lines) {
    const cells = line.split(',');
    const tripId = cells[tripCol]?.trim() ?? '';
    if (!tripInfo.has(tripId)) continue;
    const stopId = cells[stopCol]?.trim() ?? '';
    // La salida, como en los interurbanos: es la hora a la que se puede coger.
    const minutes = toMinutes(cells[departureCol] || cells[arrivalCol] || '');
    if (!rawStops.has(stopId) || minutes === null) continue;
    const list = byTrip.get(tripId) ?? [];
    list.push({ sequence: Number(cells[sequenceCol]), stopId, minutes });
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
        stops: list.map(({ stopId, minutes }) => ({
          stopId,
          minutes,
          noBoarding: false,
          noAlighting: false,
        })),
      },
    ];
  });
}
