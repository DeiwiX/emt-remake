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
