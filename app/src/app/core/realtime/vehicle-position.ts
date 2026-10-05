import { metresBetween } from '../location/geo';
import { LatLon } from '../models/network.model';

/**
 * Posición estimada de un autobús entre dos datos de la fuente (Fase 4). La
 * fuente da la última parada por la que pasó cada ~5 min; aquí se avanza sobre
 * el trazado de su línea al ritmo del horario desde esa parada, para que el
 * autobús se mueva por el mapa en vez de saltar. Lógica pura.
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

/** Dónde está el autobús sobre el trazado, y si está parado en una parada. */
export interface TrackedPlace extends TrackedPosition {
  /** Índice de la parada en la que está parado (subiendo y bajando viajeros), o null. */
  readonly stoppedAt: number | null;
}

/** Parte del tramo que, como mucho, se puede pasar parado en la parada. */
const MAX_DWELL_SHARE = 0.5;

/**
 * Dónde está el autobús: salió de la parada `fromStop` hace `elapsedMinutes` y
 * avanza al ritmo de `stopMinutes` (minutos desde el inicio en cada parada).
 * En cada parada se queda parado `dwellMinutes[k]` (subida y bajada de
 * viajeros) y luego recorre el tramo; el horario ya incluye ese tiempo. Si se
 * le acabara el tiempo, se queda al final del trazado.
 */
export function positionOnTrack(
  track: RouteTrack,
  stopMinutes: readonly number[],
  fromStop: number,
  elapsedMinutes: number,
  dwellMinutes: readonly number[] = [],
): TrackedPlace {
  const target = stopMinutes[fromStop]! + Math.max(0, elapsedMinutes);
  let k = fromStop;
  while (k < stopMinutes.length - 1 && stopMinutes[k + 1]! <= target) k++;
  if (k >= stopMinutes.length - 1) {
    const end = track.stopDistances[stopMinutes.length - 1] ?? track.cumulative.at(-1)!;
    return { ...pointAt(track, end), stoppedAt: null };
  }
  const span = stopMinutes[k + 1]! - stopMinutes[k]!;
  const dwell = Math.min(dwellMinutes[k] ?? 0, span * MAX_DWELL_SHARE);
  const inSegment = target - stopMinutes[k]!;
  if (inSegment < dwell) {
    return { ...pointAt(track, track.stopDistances[k]!), stoppedAt: k };
  }
  const fraction = span - dwell > 0 ? (inSegment - dwell) / (span - dwell) : 0;
  const along =
    track.stopDistances[k]! + fraction * (track.stopDistances[k + 1]! - track.stopDistances[k]!);
  return { ...pointAt(track, along), stoppedAt: null };
}

/**
 * Posición a partir de lo que publica la fuente: el punto donde estaba el bus
 * hace `elapsedMinutes` (proyectado sobre el trazado, a partir de su última
 * parada) y el avance desde entonces al ritmo del horario, con sus paradas.
 */
export function positionFromReport(
  track: RouteTrack,
  stopMinutes: readonly number[],
  lastStop: number,
  reported: LatLon,
  elapsedMinutes: number,
  dwellMinutes: readonly number[] = [],
): TrackedPlace {
  const last = stopMinutes.length - 1;
  const from = track.stopDistances[lastStop]!;
  const to = track.stopDistances[Math.min(last, lastStop + 2)] ?? track.cumulative.at(-1)!;
  // Dónde estaba al publicarse el dato (no antes de su última parada).
  const along = Math.max(from, nearestAlong(track, reported, from, to));
  // Ese punto, en "minutos de horario" desde el inicio, más lo transcurrido. Si
  // estaba ya entre paradas, había terminado de parar en la anterior.
  let k = lastStop;
  while (k < last && track.stopDistances[k + 1]! <= along) k++;
  const length = k < last ? track.stopDistances[k + 1]! - track.stopDistances[k]! : 0;
  const fraction = length > 0 ? (along - track.stopDistances[k]!) / length : 0;
  let atReport = stopMinutes[last]!;
  if (k < last) {
    const span = stopMinutes[k + 1]! - stopMinutes[k]!;
    const dwell = Math.min(dwellMinutes[k] ?? 0, span * MAX_DWELL_SHARE);
    atReport = stopMinutes[k]! + (fraction > 0 ? dwell + fraction * (span - dwell) : 0);
  }
  return positionOnTrack(
    track,
    stopMinutes,
    k,
    atReport - stopMinutes[k]! + Math.max(0, elapsedMinutes),
    dwellMinutes,
  );
}

/** Distancia sobre el trazado del punto más cercano a `p`, buscando entre `from` y `to` metros. */
function nearestAlong(track: RouteTrack, p: LatLon, from: number, to: number): number {
  const { points, cumulative } = track;
  let best = { distance: Infinity, along: from };
  for (let i = 0; i < points.length - 1; i++) {
    if (cumulative[i + 1]! < from || cumulative[i]! > to) continue;
    const projected = project(points[i]!, points[i + 1]!, p);
    const distance = metresBetween(projected.point, p);
    if (distance < best.distance) {
      best = {
        distance,
        along: cumulative[i]! + projected.fraction * (cumulative[i + 1]! - cumulative[i]!),
      };
    }
  }
  return best.along;
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

/** Suavizado: fracción de la diferencia con la estimación que se corrige cada segundo. */
const SMOOTHING = 0.15;
/** Si la estimación salta más que esto (otro viaje, dato muy distinto), se coloca sin más. */
const MAX_SMOOTH_METRES = 1_500;
/** Lo más que avanza un autobús en un segundo (~70 km/h). */
const MAX_METRES_PER_TICK = 20;

/** Lo que se dibujó en el instante anterior para un autobús. */
export interface SmoothState {
  readonly shown: number;
  readonly target: number;
}

/**
 * Fase 6: cuando llega un dato nuevo la estimación puede saltar hacia delante o
 * hacia atrás. En vez de teletransportar el autobús, se sigue su avance y se
 * corrige la diferencia poco a poco (~15 s), así se mueve con suavidad.
 */
export function smoothAlong(previous: SmoothState | undefined, target: number): SmoothState {
  if (!previous || Math.abs(target - previous.target) > MAX_SMOOTH_METRES) {
    return { shown: target, target };
  }
  // El avance normal de un segundo (como mucho lo que corre un autobús); el resto es
  // un salto de la estimación, que se corrige poco a poco.
  const step = Math.min(Math.max(target - previous.target, 0), MAX_METRES_PER_TICK);
  const advanced = previous.shown + step;
  return { shown: advanced + (target - advanced) * SMOOTHING, target };
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
