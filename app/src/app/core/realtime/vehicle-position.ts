import { metresBetween } from '../location/geo';
import { LatLon } from '../models/network.model';

/**
 * El autobús sobre el trazado de su línea (Fase 4; con el GPS de la EMT desde
 * el 17/10/2026): se coloca en el punto del recorrido más cercano a su
 * posición, mirando hacia donde va. Lógica pura.
 */

/** Trazado de un sentido preparado para recorrerlo por distancia. */
export interface RouteTrack {
  readonly points: readonly LatLon[];
  /** Metros acumulados desde el inicio hasta cada punto. */
  readonly cumulative: readonly number[];
  /** Metros desde el inicio hasta cada parada del sentido (en orden). */
  readonly stopDistances: readonly number[];
}

export interface TrackedPosition {
  readonly point: LatLon;
  /** Rumbo en grados (0 = norte, 90 = este), para girar el icono. */
  readonly bearing: number;
  /** Metros recorridos sobre el trazado desde su inicio. */
  readonly along: number;
}

/**
 * Prepara un trazado: longitudes acumuladas y la distancia de cada parada
 * sobre él (proyección sobre el segmento más cercano, siempre hacia delante
 * para que las circulares que repiten tramos no retrocedan).
 */
export function buildTrack(points: readonly LatLon[], stops: readonly LatLon[]): RouteTrack | null {
  if (points.length < 2 || stops.length === 0) return null;
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1]! + metresBetween(points[i - 1]!, points[i]!));
  }
  let fromSegment = 0;
  const stopDistances = stops.map((stop) => {
    let best = { distance: Infinity, along: cumulative[fromSegment]!, segment: fromSegment };
    for (let i = fromSegment; i < points.length - 1; i++) {
      const projected = project(points[i]!, points[i + 1]!, stop);
      const distance = metresBetween(projected.point, stop);
      if (distance < best.distance) {
        best = {
          distance,
          along: cumulative[i]! + projected.fraction * (cumulative[i + 1]! - cumulative[i]!),
          segment: i,
        };
      }
    }
    fromSegment = best.segment;
    return best.along;
  });
  return { points, cumulative, stopDistances };
}

/** Más lejos del recorrido que esto, se muestra el punto del GPS tal cual (desvío). */
const MAX_SNAP_METRES = 60;

/**
 * Posición de un autobús sobre el trazado a partir de su GPS. Si se sabe entre
 * qué paradas va (`between`, índices), solo se busca en ese tramo: así las
 * circulares que repiten calle no lo ponen en la otra pasada.
 */
export function snapToTrack(
  track: RouteTrack,
  gps: LatLon,
  between: readonly [number, number] | null = null,
): TrackedPosition | null {
  const from = between ? (track.stopDistances[between[0]] ?? 0) : 0;
  const to = between ? (track.stopDistances[between[1]] ?? Infinity) : Infinity;
  let best: { distance: number; along: number } | null = null;
  for (let i = 0; i < track.points.length - 1; i++) {
    if (track.cumulative[i + 1]! < from || track.cumulative[i]! > to) continue;
    const projected = project(track.points[i]!, track.points[i + 1]!, gps);
    const distance = metresBetween(projected.point, gps);
    if (!best || distance < best.distance) {
      const along =
        track.cumulative[i]! +
        projected.fraction * (track.cumulative[i + 1]! - track.cumulative[i]!);
      best = { distance, along: Math.min(Math.max(along, from), to) };
    }
  }
  if (!best || best.distance > MAX_SNAP_METRES) return null;
  return pointAt(track, best.along);
}

/** Punto a `along` metros del inicio, con el rumbo del segmento. */
export function pointAt(track: RouteTrack, along: number): TrackedPosition {
  const { points, cumulative } = track;
  const total = cumulative.at(-1)!;
  const distance = Math.min(Math.max(0, along), total);
  let i = 0;
  while (i < cumulative.length - 2 && cumulative[i + 1]! < distance) i++;
  const a = points[i]!;
  const b = points[i + 1]!;
  const length = cumulative[i + 1]! - cumulative[i]!;
  const t = length > 0 ? (distance - cumulative[i]!) / length : 0;
  return {
    point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
    bearing: bearingOf(a, b),
    along: distance,
  };
}

/** Trozo del trazado entre dos distancias desde su inicio (metros). */
export function trackSlice(track: RouteTrack, from: number, to: number): LatLon[] {
  const inner = track.points.filter((_, i) => {
    const along = track.cumulative[i]!;
    return along > from && along < to;
  });
  return [pointAt(track, from).point, ...inner, pointAt(track, to).point];
}

/** Rumbo aproximado entre dos puntos cercanos (plano local). */
export function bearingOf(a: LatLon, b: LatLon): number {
  const dy = b[0] - a[0];
  const dx = (b[1] - a[1]) * Math.cos((a[0] * Math.PI) / 180);
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

/** Proyección de `p` sobre el segmento a–b (en un plano local). */
function project(a: LatLon, b: LatLon, p: LatLon): { point: LatLon; fraction: number } {
  const k = Math.cos((a[0] * Math.PI) / 180);
  const ax = a[1] * k;
  const bx = b[1] * k;
  const px = p[1] * k;
  const dx = bx - ax;
  const dy = b[0] - a[0];
  const length2 = dx * dx + dy * dy;
  const fraction =
    length2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (p[0] - a[0]) * dy) / length2)) : 0;
  return { point: [a[0] + dy * fraction, a[1] + (b[1] - a[1]) * fraction], fraction };
}
