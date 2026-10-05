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
 * Tramo de un recorrido entre dos paradas: empieza y acaba justo en el punto del
 * trazado más cercano a cada parada (proyectado sobre su segmento, no en el
 * vértice más próximo, que con trazados simplificados puede quedar lejos) y
 * avanza siempre hacia delante, para que funcione en las circulares.
 */
export function sliceBetween(
  points: readonly LatLon[],
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): LatLon[] {
  if (points.length < 2) return [...points];
  const start = nearestOnSegments(points, from, 0);
  const end = nearestOnSegments(points, to, start.segment, start.fraction);
  const inner = points.slice(start.segment + 1, end.segment + 1);
  return [start.point, ...inner, end.point];
}

/** Punto del trazado más cercano a `target`, a partir del segmento `first` (y de su fracción). */
function nearestOnSegments(
  points: readonly LatLon[],
  target: { lat: number; lon: number },
  first: number,
  minFraction = 0,
): { segment: number; fraction: number; point: LatLon } {
  const k = Math.cos((target.lat * Math.PI) / 180);
  let best = { segment: first, fraction: minFraction, point: points[first]!, distance: Infinity };
  for (let i = first; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dx = (b[1] - a[1]) * k;
    const dy = b[0] - a[0];
    const length2 = dx * dx + dy * dy;
    let t = length2 > 0 ? ((target.lon - a[1]) * k * dx + (target.lat - a[0]) * dy) / length2 : 0;
    t = Math.min(1, Math.max(i === first ? minFraction : 0, t));
    const point: LatLon = [a[0] + dy * t, a[1] + (b[1] - a[1]) * t];
    const distance = (point[0] - target.lat) ** 2 + ((point[1] - target.lon) * k) ** 2;
    if (distance < best.distance) best = { segment: i, fraction: t, point, distance };
  }
  return best;
}
