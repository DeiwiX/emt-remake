import type {
  NetworkFile,
  PublishedLine,
  PublishedStop,
  ShapesFile,
  TimetablesFile,
  TransitMode,
} from '../output-schema.ts';
import type { MetroData } from './build-metro.ts';

/**
 * Una red opcional (metro, interurbanos) tal como se publica: líneas, paradas,
 * trazados codificados y horario.
 */
export interface PublishedPart {
  lines: PublishedLine[];
  stops: PublishedStop[];
  shapesOverview: ShapesFile['shapes'];
  shapesDetail: ShapesFile['shapes'];
  timetables: MetroData['timetables'];
}

/** Ficheros de la publicación anterior de los que se recupera una red opcional. */
export interface PreviousData {
  network: NetworkFile;
  shapesOverview: ShapesFile;
  shapesDetail: ShapesFile;
  timetables: TimetablesFile;
}

/**
 * La red de un modo (metro o interurbanos) de la publicación anterior, para
 * cuando falla la descarga de su fuente: así un fallo puntual no la quita de la
 * app (21/10/2026). Devuelve null si la publicación anterior no la tenía.
 */
export function partFromPrevious(previous: PreviousData, mode: TransitMode): PublishedPart | null {
  const lines = previous.network.lines.filter((line) => line.mode === mode);
  const stops = previous.network.stops.filter((stop) => stop.mode === mode);
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
