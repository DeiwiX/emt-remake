import { LatLon, Stop } from '../models/network.model';
import { Place } from '../planner/planner';
import { metresBetween, walkMinutes } from './geo';

/**
 * Paradas cercanas que también cuentan al elegir una parada en "Cómo llegar":
 * cruzar la calle o andar un par de minutos a otra parada suele dar más
 * líneas (p. ej. el otro sentido de la Alameda).
 */
export const STOP_NEARBY_RADIUS_M = 300;

/**
 * Parada como origen o destino de "Cómo llegar" (16/10/2026): la parada elegida
 * (sin andar) y las que hay a menos de 300 m, cada una con los minutos andando
 * desde (o hasta) la elegida. Antes solo contaba la parada exacta, y si sus
 * líneas no llevaban al destino no salía ninguna opción.
 */
export function placeForStop(stop: Stop, stops: readonly Stop[]): Place {
  const point: LatLon = [stop.lat, stop.lon];
  const access = new Map<string, number>([[stop.id, 0]]);
  // Sin punto de acceso para la propia parada: no hay que andar ni nada que dibujar.
  const points = new Map<string, LatLon>();
  for (const other of stops) {
    if (other.id === stop.id) continue;
    const metres = metresBetween(point, [other.lat, other.lon]);
    if (metres <= STOP_NEARBY_RADIUS_M) {
      access.set(other.id, walkMinutes(metres));
      points.set(other.id, point);
    }
  }
  return {
    kind: 'stop',
    id: stop.id,
    name: stop.name,
    stopIds: [...access.keys()],
    accessMinutes: access,
    accessPoints: points,
  };
}
