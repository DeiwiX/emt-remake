import { LatLon, Stop } from '../models/network.model';

/**
 * Distancias y tiempos a pie. Lógica pura: la usan el planificador y
 * "Cerca de mí". Málaga cabe en unos kilómetros, así que basta una
 * aproximación plana alrededor de su latitud (error muy inferior a 1 m).
 */
const METRES_PER_DEGREE_LAT = 111_320;
const METRES_PER_DEGREE_LON = METRES_PER_DEGREE_LAT * Math.cos((36.72 * Math.PI) / 180);

/** Paso tranquilo (~4,8 km/h), con margen para cruzar calles. */
export const WALK_METRES_PER_MINUTE = 80;
/** Rodeo de las calles frente a la línea recta. */
export const WALK_DETOUR = 1.3;

/** Distancia en línea recta, en metros. */
export function metresBetween(a: LatLon, b: LatLon): number {
  return Math.hypot((a[0] - b[0]) * METRES_PER_DEGREE_LAT, (a[1] - b[1]) * METRES_PER_DEGREE_LON);
}

/** Minutos andando para una distancia en línea recta (al menos 1). */
export function walkMinutes(metres: number): number {
  return Math.max(1, Math.ceil((metres * WALK_DETOUR) / WALK_METRES_PER_MINUTE));
}

export interface StopNearby {
  readonly stop: Stop;
  readonly metres: number;
  readonly minutes: number;
}

/** "Cerca de mí": 500 m; si no hay ninguna parada, se amplía hasta 1 km (ADR 0006). */
export const NEAR_RADIUS_M = 500;
export const NEAR_FALLBACK_RADIUS_M = 1000;

/** Paradas cercanas a un punto, de la más cercana a la más lejana. */
export function stopsNear(
  stops: readonly Stop[],
  point: LatLon,
  radius = NEAR_RADIUS_M,
  fallbackRadius = NEAR_FALLBACK_RADIUS_M,
): { readonly radius: number; readonly stops: StopNearby[] } {
  const all = stops
    .map((stop) => ({ stop, metres: metresBetween(point, [stop.lat, stop.lon]) }))
    .filter((s) => s.metres <= fallbackRadius)
    .sort((a, b) => a.metres - b.metres)
    .map((s) => ({ ...s, minutes: walkMinutes(s.metres) }));
  const close = all.filter((s) => s.metres <= radius);
  return close.length > 0 ? { radius, stops: close } : { radius: fallbackRadius, stops: all };
}
