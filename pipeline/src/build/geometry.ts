export type LatLon = [lat: number, lon: number];

const EARTH_RADIUS_M = 6_371_000;
const DEG = Math.PI / 180;

/**
 * Proyección equirectangular local en metros. A la escala de una ciudad el error
 * es despreciable y evita trigonometría en cada comparación.
 */
function projector(referenceLat: number): (p: LatLon) => [x: number, y: number] {
  const cosLat = Math.cos(referenceLat * DEG);
  return ([lat, lon]) => [lon * DEG * cosLat * EARTH_RADIUS_M, lat * DEG * EARTH_RADIUS_M];
}

export function distanceM(a: LatLon, b: LatLon): number {
  const project = projector((a[0] + b[0]) / 2);
  const [ax, ay] = project(a);
  const [bx, by] = project(b);
  return Math.hypot(ax - bx, ay - by);
}

/** Simplificación Douglas-Peucker con tolerancia en metros. Conserva el primer y el último punto. */
export function simplify(points: LatLon[], toleranceM: number): LatLon[] {
  if (points.length <= 2) return [...points];
  const project = projector(points[0]![0]);
  const xy = points.map(project);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDistance = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = pointToSegment(xy[i]!, xy[start]!, xy[end]!).distance;
      if (d > maxDistance) {
        maxDistance = d;
        index = i;
      }
    }
    if (index !== -1 && maxDistance > toleranceM) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

export interface Projection {
  /** Distancia en metros del punto a la línea. */
  distance: number;
  /** Posición a lo largo de la línea, en metros desde su inicio. */
  along: number;
}

/** Proyecta cada punto sobre la polilínea: distancia a ella y posición a lo largo. */
export function projectOntoLine(points: LatLon[], line: LatLon[]): Projection[] {
  if (line.length < 2) throw new Error('La polilínea necesita al menos dos puntos');
  const project = projector(line[0]![0]);
  const lineXy = line.map(project);
  const cumulative = [0];
  for (let i = 1; i < lineXy.length; i++) {
    const [ax, ay] = lineXy[i - 1]!;
    const [bx, by] = lineXy[i]!;
    cumulative.push(cumulative[i - 1]! + Math.hypot(bx - ax, by - ay));
  }

  return points.map((point) => {
    const p = project(point);
    let best: Projection = { distance: Infinity, along: 0 };
    for (let i = 1; i < lineXy.length; i++) {
      const { distance, t } = pointToSegment(p, lineXy[i - 1]!, lineXy[i]!);
      if (distance < best.distance) {
        const segmentLength = cumulative[i]! - cumulative[i - 1]!;
        best = { distance, along: cumulative[i - 1]! + t * segmentLength };
      }
    }
    return best;
  });
}

function pointToSegment(
  [px, py]: [number, number],
  [ax, ay]: [number, number],
  [bx, by]: [number, number],
): { distance: number; t: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return { distance: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}

/**
 * Codifica la polilínea con el algoritmo de Google (precisión 1e-5, unos 1,1 m).
 * Es un formato compacto y estándar que la app decodifica sin dependencias.
 */
export function encodePolyline(points: LatLon[]): string {
  let output = '';
  let previousLat = 0;
  let previousLon = 0;
  for (const [lat, lon] of points) {
    const latE5 = Math.round(lat * 1e5);
    const lonE5 = Math.round(lon * 1e5);
    output += encodeSigned(latE5 - previousLat) + encodeSigned(lonE5 - previousLon);
    previousLat = latE5;
    previousLon = lonE5;
  }
  return output;
}

function encodeSigned(value: number): string {
  let rest = value < 0 ? ~(value << 1) : value << 1;
  let output = '';
  while (rest >= 0x20) {
    output += String.fromCharCode((0x20 | (rest & 0x1f)) + 63);
    rest >>= 5;
  }
  return output + String.fromCharCode(rest + 63);
}

/** Inverso de encodePolyline; se usa en las pruebas y servirá de referencia para la app. */
export function decodePolyline(encoded: string): LatLon[] {
  const points: LatLon[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  const next = (): number => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lon += next();
    points.push([lat / 1e5, lon / 1e5]);
  }
  return points;
}
