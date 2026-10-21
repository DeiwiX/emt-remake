import type {
  NetworkFile,
  PublishedLine,
  PublishedStop,
  ShapesFile,
  TimetablesFile,
} from '../output-schema.ts';
import type { MetroData } from './build-metro.ts';

/** El metro tal como se publica: líneas, estaciones, trazados codificados y horario. */
export interface PublishedMetro {
  lines: PublishedLine[];
  stops: PublishedStop[];
  shapesOverview: ShapesFile['shapes'];
  shapesDetail: ShapesFile['shapes'];
  timetables: MetroData['timetables'];
}

/** Ficheros de la publicación anterior de los que se recupera el metro. */
export interface PreviousData {
  network: NetworkFile;
  shapesOverview: ShapesFile;
  shapesDetail: ShapesFile;
  timetables: TimetablesFile;
}

/**
 * Metro de la publicación anterior, para cuando falla la descarga de su GTFS:
 * así un fallo puntual de la web del metro no lo quita de la app (21/10/2026).
 * Devuelve null si la publicación anterior no tenía metro.
 */
export function metroFromPrevious(previous: PreviousData): PublishedMetro | null {
  const lines = previous.network.lines.filter((line) => line.mode === 'metro');
  const stops = previous.network.stops.filter((stop) => stop.mode === 'metro');
  if (lines.length === 0 || stops.length === 0) return null;

  const shapeIds = lines.flatMap((line) => line.directions.map((d) => d.shapeId));
  const keys = lines.flatMap((line) => line.directions.map((d) => `${line.id}|${d.id}`));
  const { services, departures, profiles = {}, departureProfiles = {} } = previous.timetables;
  const usedServices = new Set(keys.flatMap((key) => Object.keys(departures[key] ?? {})));

  return {
    lines,
    stops,
    shapesOverview: pick(previous.shapesOverview.shapes, shapeIds),
    shapesDetail: pick(previous.shapesDetail.shapes, shapeIds),
    timetables: {
      services: pick(services, [...usedServices]),
      departures: pick(departures, keys),
      profiles: pick(profiles, keys),
      departureProfiles: pick(departureProfiles, keys),
    },
  };
}

function pick<T>(record: Record<string, T>, keys: string[]): Record<string, T> {
  return Object.fromEntries(keys.filter((key) => key in record).map((key) => [key, record[key]!]));
}
