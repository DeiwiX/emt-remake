import { LatLon } from '../core/models/network.model';

/**
 * Decodifica una polilínea con el algoritmo de Google (precisión 1e-5), el
 * formato que genera pipeline/src/build/geometry.ts.
 */
export function decodePolyline(encoded: string): LatLon[] {
  const points: LatLon[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  const nextValue = (): number => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) throw new Error('Polilínea truncada');
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    lat += nextValue();
    lon += nextValue();
    points.push([lat / 1e5, lon / 1e5]);
  }
  return points;
}
