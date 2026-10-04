import { LatLon, Stop, Street } from '../models/network.model';
import { Place } from '../planner/planner';
import { metresBetween, stopsNear, walkMinutes } from './geo';

/** Paradas que cuentan como "de la calle": a esta distancia de alguno de sus portales. */
export const STREET_STOP_RADIUS_M = 300;

/** Punto del portal pedido o, si no se publicó, del número más cercano. */
export function portalPoint(street: Street, number: number): { point: LatLon; number: number } {
  let best = 0;
  for (let i = 1; i < street.numbers.length; i++) {
    if (Math.abs(street.numbers[i]! - number) < Math.abs(street.numbers[best]! - number)) best = i;
  }
  return { point: street.points[best]!, number: street.numbers[best]! };
}

/**
 * Calle como origen o destino de "Cómo llegar".
 * - Con número ("Calle Larios 5"): el portal y las paradas cercanas a él, como "Mi ubicación".
 * - Sin número: las paradas a menos de 300 m de cualquier portal de la calle, cada
 *   una con lo que se tarda andando desde (o hasta) el portal más cercano.
 */
export function placeForStreet(
  street: Street,
  number: number | null,
  stops: readonly Stop[],
): Place {
  if (number !== null && street.points.length > 0) {
    const { point } = portalPoint(street, number);
    const near = stopsNear(stops, point);
    return {
      kind: 'address',
      id: `${street.id}#${number}`,
      name: `${street.name} ${number}`,
      stopIds: near.stops.map((s) => s.stop.id),
      accessMinutes: new Map(near.stops.map((s) => [s.stop.id, s.minutes])),
      accessPoints: new Map(near.stops.map((s) => [s.stop.id, point])),
    };
  }
  const access = new Map<string, number>();
  const points = new Map<string, LatLon>();
  for (const stop of stops) {
    let bestMetres = Infinity;
    let bestPoint: LatLon | undefined;
    for (const point of street.points) {
      const metres = metresBetween(point, [stop.lat, stop.lon]);
      if (metres < bestMetres) {
        bestMetres = metres;
        bestPoint = point;
      }
    }
    if (bestPoint && bestMetres <= STREET_STOP_RADIUS_M) {
      access.set(stop.id, walkMinutes(bestMetres));
      points.set(stop.id, bestPoint);
    }
  }
  return {
    kind: 'street',
    id: street.id,
    name: street.name,
    stopIds: [...access.keys()],
    accessMinutes: access,
    accessPoints: points,
  };
}
