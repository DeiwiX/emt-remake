import { WALK_METRES_PER_MINUTE } from '../location/geo';
import { LatLon, Stop } from '../models/network.model';
import { JourneyOption, Place } from '../planner/planner';
import { WalkGraph } from './walk-graph';

/** Hasta dónde se buscan caminos desde un lugar a sus paradas (las candidatas están a < 1 km). */
const ACCESS_SEARCH_METRES = 2_000;

/** Minutos andando por la calle (ya es el camino real: sin margen de rodeo). */
export function streetWalkMinutes(metres: number): number {
  return Math.max(1, Math.ceil(metres / WALK_METRES_PER_MINUTE));
}

/**
 * Cambia los minutos andando de un lugar (calle, dirección o tu ubicación) a
 * sus paradas por los del camino real por las calles. Si alguna parada no se
 * puede alcanzar por la red, conserva la estimación en línea recta.
 */
export function withStreetWalks(
  place: Place,
  graph: WalkGraph,
  stopById: (id: string) => Stop | undefined,
): Place {
  const points = place.accessPoints;
  const minutes = place.accessMinutes;
  if (!points || !minutes) return place;
  const byPoint = new Map<string, { point: LatLon; stopIds: string[] }>();
  for (const [stopId, point] of points) {
    const key = `${point[0]},${point[1]}`;
    const group = byPoint.get(key);
    if (group) group.stopIds.push(stopId);
    else byPoint.set(key, { point, stopIds: [stopId] });
  }
  const refined = new Map(minutes);
  for (const { point, stopIds } of byPoint.values()) {
    const tree = graph.from(point, ACCESS_SEARCH_METRES);
    if (!tree) continue;
    for (const stopId of stopIds) {
      const stop = stopById(stopId);
      const metres = stop ? tree.metresTo([stop.lat, stop.lon]) : null;
      if (metres !== null) refined.set(stopId, streetWalkMinutes(metres));
    }
  }
  return { ...place, accessMinutes: refined };
}

/** Hasta dónde se buscan caminos entre las paradas de un transbordo (< 250 m en línea recta). */
const TRANSFER_SEARCH_METRES = 600;

/**
 * Cambia los minutos andando de los transbordos de una opción por los del
 * camino real por la calle, y ajusta su tiempo total (17/10/2026). Se hace
 * solo con las opciones que salen, no al buscar: calcular caminos desde las
 * 1.100 paradas tardaba más de medio segundo (varios en el móvil).
 */
export function withStreetTransfers(
  option: JourneyOption,
  minutesBetween: (fromStopId: string, toStopId: string) => number | null,
): JourneyOption {
  let delta = 0;
  const transferWalks = option.transferWalks.map((walk, i) => {
    const from = option.legs[i]?.toStopId;
    const to = option.legs[i + 1]?.fromStopId;
    if (!from || !to || from === to) return walk;
    const street = minutesBetween(from, to);
    if (street === null) return walk;
    delta += street - walk;
    return street;
  });
  return delta === 0 && transferWalks.every((w, i) => w === option.transferWalks[i])
    ? option
    : { ...option, transferWalks, totalMinutes: option.totalMinutes + delta };
}

/** Minutos andando por la calle entre dos paradas (con caché), o null sin camino. */
export function streetMinutesBetween(
  graph: WalkGraph,
  stopById: (id: string) => Stop | undefined,
): (fromStopId: string, toStopId: string) => number | null {
  const cache = new Map<string, number | null>();
  return (fromId, toId) => {
    const key = `${fromId}>${toId}`;
    if (cache.has(key)) return cache.get(key)!;
    const from = stopById(fromId);
    const to = stopById(toId);
    const tree = from ? graph.from([from.lat, from.lon], TRANSFER_SEARCH_METRES) : null;
    const metres = tree && to ? tree.metresTo([to.lat, to.lon]) : null;
    const minutes = metres === null ? null : streetWalkMinutes(metres);
    cache.set(key, minutes);
    return minutes;
  };
}
