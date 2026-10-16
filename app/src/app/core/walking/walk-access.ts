import { WALK_METRES_PER_MINUTE } from '../location/geo';
import { LatLon, Stop } from '../models/network.model';
import { NearbyStop, Place } from '../planner/planner';
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

/** Hasta dónde se buscan caminos desde una parada a las cercanas (transbordos, < 250 m en línea recta). */
const TRANSFER_SEARCH_METRES = 800;

/**
 * Transbordos a pie con los minutos del camino real por la calle. Se calculan
 * la primera vez que se pide cada parada y se guardan. Si no hay camino por la
 * red, se queda la estimación en línea recta.
 */
export function streetTransfers(
  nearby: (stopId: string) => readonly NearbyStop[],
  graph: WalkGraph,
  stopById: (id: string) => Stop | undefined,
): (stopId: string) => readonly NearbyStop[] {
  const cache = new Map<string, readonly NearbyStop[]>();
  return (stopId) => {
    const cached = cache.get(stopId);
    if (cached) return cached;
    const list = nearby(stopId);
    const stop = stopById(stopId);
    const tree =
      stop && list.length > 0 ? graph.from([stop.lat, stop.lon], TRANSFER_SEARCH_METRES) : null;
    const result = list.map((n) => {
      const other = stopById(n.stopId);
      const metres = tree && other ? tree.metresTo([other.lat, other.lon]) : null;
      return metres === null ? n : { ...n, minutes: streetWalkMinutes(metres) };
    });
    cache.set(stopId, result);
    return result;
  };
}
