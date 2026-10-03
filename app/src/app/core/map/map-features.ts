import { LatLon, Line, Stop } from '../models/network.model';
import { LineColor } from './line-palette';
import { MapRoute, MapStop } from './map-provider';

/**
 * Convierte el modelo de dominio en lo que dibuja el mapa: un recorrido por
 * cada sentido de cada línea que tenga geometría.
 */
export function toMapRoutes(
  lines: readonly Line[],
  geometries: ReadonlyMap<string, readonly LatLon[]>,
  colorFor: (lineId: string) => LineColor,
  includeDirection: (line: Line, directionId: number) => boolean = () => true,
): MapRoute[] {
  return lines.flatMap((line) => {
    const color = colorFor(line.id);
    return line.directions.flatMap((direction) => {
      const points = geometries.get(direction.shapeId);
      if (!points || !includeDirection(line, direction.id)) return [];
      return [
        {
          id: `${line.id}-${direction.id}`,
          lineId: line.id,
          color: color.line,
          textColor: color.text,
          approximate: direction.shapeQuality === 'approximate',
          points,
        },
      ];
    });
  });
}

export function toMapStops(stops: readonly (Stop | undefined)[]): MapStop[] {
  return stops.flatMap((stop) =>
    stop ? [{ id: stop.id, name: stop.name, lat: stop.lat, lon: stop.lon }] : [],
  );
}

/**
 * Tramo de un recorrido entre dos paradas: desde el punto del trazado más
 * cercano a la de subida hasta el más cercano a la de bajada (siempre hacia
 * delante, para que funcione en las circulares).
 */
export function sliceBetween(
  points: readonly LatLon[],
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): LatLon[] {
  if (points.length < 2) return [...points];
  const distance = (p: LatLon, q: { lat: number; lon: number }) =>
    (p[0] - q.lat) ** 2 + ((p[1] - q.lon) * Math.cos((q.lat * Math.PI) / 180)) ** 2;
  const nearest = (target: { lat: number; lon: number }, start: number) => {
    let best = start;
    for (let i = start; i < points.length; i++) {
      if (distance(points[i]!, target) < distance(points[best]!, target)) best = i;
    }
    return best;
  };
  const start = nearest(from, 0);
  const end = nearest(to, start);
  return points.slice(start, Math.max(end, start + 1) + 1);
}
