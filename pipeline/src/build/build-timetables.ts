import { SCHEMA_VERSION } from '../config.ts';
import type { NetworkFile, TimetablesFile } from '../output-schema.ts';
import type { GtfsTrip } from '../sources/gtfs.ts';
import type { TripTimes } from '../sources/gtfs-times.ts';

/** Prefijo con el que build-dataset publica los trazados oficiales del GTFS. */
const GTFS_SHAPE_PREFIX = 'g';

/**
 * Salidas programadas de cada sentido. Para saber qué viajes del GTFS son de un
 * sentido se usa el trazado emparejado con sus paradas: su "direction_id" en el
 * GTFS identifica todos los viajes de ese sentido (también los de variantes).
 * Los sentidos sin trazado oficial (91–93) no tienen horario en el GTFS.
 *
 * Además, el paso exacto de cada viaje por cada parada se publica como "perfiles"
 * compartidos: muchos viajes tardan lo mismo, así que cada salida solo guarda el
 * índice de su perfil.
 */
export function buildTimetables(
  network: NetworkFile,
  trips: GtfsTrip[],
  serviceDates: Map<string, string[]>,
): TimetablesFile {
  const departures: TimetablesFile['departures'] = {};
  const profiles: NonNullable<TimetablesFile['profiles']> = {};
  const departureProfiles: NonNullable<TimetablesFile['departureProfiles']> = {};
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

      const fallback = (direction.minutes ?? []).map(Math.round);
      const directionProfiles: number[][] = [];
      const profileIndex = new Map<string, number>();
      const indexOf = (profile: number[]) => {
        const key = profile.join(',');
        let index = profileIndex.get(key);
        if (index === undefined) {
          index = directionProfiles.push(profile) - 1;
          profileIndex.set(key, index);
        }
        return index;
      };

      const byService: Record<string, { start: number; profile: number }[]> = {};
      for (const trip of lineTrips.filter((t) => t.directionId === directionId)) {
        const profile =
          (trip.times && tripProfile(direction.stopIds, direction.minutes ?? [], trip.times)) ??
          fallback;
        (byService[trip.serviceId] ??= []).push({
          start: Math.round(trip.startSeconds / 60),
          profile: indexOf(profile),
        });
        usedServices.add(trip.serviceId);
      }
      const key = `${line.id}|${direction.id}`;
      departures[key] = {};
      departureProfiles[key] = {};
      for (const [service, list] of Object.entries(byService)) {
        const unique = [...new Map(list.map((d) => [`${d.start}|${d.profile}`, d])).values()].sort(
          (a, b) => a.start - b.start || a.profile - b.profile,
        );
        departures[key][service] = unique.map((d) => d.start);
        departureProfiles[key][service] = unique.map((d) => d.profile);
      }
      profiles[key] = directionProfiles;
    }
  }

  const services = Object.fromEntries(
    [...serviceDates].filter(([service]) => usedServices.has(service)),
  );
  return { schemaVersion: SCHEMA_VERSION, services, departures, profiles, departureProfiles };
}

/** Si un viaje coincide en menos paradas que estas, se usa el tiempo típico del sentido. */
const MIN_MATCHED_STOPS = 2;

/**
 * Minutos (enteros) desde la salida de un viaje en cada parada del sentido. Las
 * paradas que el viaje no trae se completan con el tiempo típico del sentido
 * desde la parada conocida más cercana; nunca retrocede.
 */
export function tripProfile(
  stopIds: string[],
  typical: number[],
  trip: TripTimes,
): number[] | null {
  let next = 0;
  const known = stopIds.map((code) => {
    const index = trip.stopCodes.indexOf(code, next);
    if (index === -1) return undefined;
    next = index + 1;
    return trip.minutes[index];
  });
  const matched = known.flatMap((m, i) => (m === undefined ? [] : [i]));
  if (matched.length < MIN_MATCHED_STOPS || typical.length !== stopIds.length) return null;
  let previous = 0;
  return known.map((minutes, i) => {
    let value = minutes;
    if (value === undefined) {
      const anchor = matched.filter((k) => k < i).at(-1) ?? matched[0]!;
      value = known[anchor]! + (typical[i]! - typical[anchor]!);
    }
    previous = Math.max(previous, Math.round(Math.max(0, value)));
    return previous;
  });
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
