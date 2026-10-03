import { SCHEMA_VERSION } from '../config.ts';
import type { NetworkFile, TimetablesFile } from '../output-schema.ts';
import type { GtfsTrip } from '../sources/gtfs.ts';

/** Prefijo con el que build-dataset publica los trazados oficiales del GTFS. */
const GTFS_SHAPE_PREFIX = 'g';

/**
 * Salidas programadas de cada sentido. Para saber qué viajes del GTFS son de un
 * sentido se usa el trazado emparejado con sus paradas: su "direction_id" en el
 * GTFS identifica todos los viajes de ese sentido (también los de variantes).
 * Los sentidos sin trazado oficial (91–93) no tienen horario en el GTFS.
 */
export function buildTimetables(
  network: NetworkFile,
  trips: GtfsTrip[],
  serviceDates: Map<string, string[]>,
): TimetablesFile {
  const departures: TimetablesFile['departures'] = {};
  const usedServices = new Set<string>();

  for (const line of network.lines) {
    const lineTrips = trips.filter((t) => t.lineCode === line.id);
    for (const direction of line.directions) {
      if (direction.shapeQuality !== 'official') continue;
      const shapeId = direction.shapeId.slice(GTFS_SHAPE_PREFIX.length);
      const directionId = mostCommon(
        lineTrips.filter((t) => t.shapeId === shapeId).map((t) => t.directionId),
      );
      if (directionId === undefined) continue;

      const byService: Record<string, number[]> = {};
      for (const trip of lineTrips.filter((t) => t.directionId === directionId)) {
        const list = (byService[trip.serviceId] ??= []);
        list.push(Math.round(trip.startSeconds / 60));
        usedServices.add(trip.serviceId);
      }
      for (const list of Object.values(byService)) {
        list.splice(0, list.length, ...[...new Set(list)].sort((a, b) => a - b));
      }
      departures[`${line.id}|${direction.id}`] = byService;
    }
  }

  const services = Object.fromEntries(
    [...serviceDates].filter(([service]) => usedServices.has(service)),
  );
  return { schemaVersion: SCHEMA_VERSION, services, departures };
}

export function countDepartures(timetables: TimetablesFile): number {
  return Object.values(timetables.departures)
    .flatMap((byService) => Object.values(byService))
    .reduce((sum, list) => sum + list.length, 0);
}

function mostCommon(values: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}
