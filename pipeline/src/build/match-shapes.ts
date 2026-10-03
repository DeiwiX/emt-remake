import { MAX_MEAN_STOP_TO_SHAPE_M } from '../config.ts';
import type { GtfsShapeUsage } from '../sources/gtfs.ts';
import { type LatLon, projectOntoLine } from './geometry.ts';

/** Fracción mínima de pares de paradas consecutivas que deben avanzar a lo largo del trazado. */
const MIN_ORDER_AGREEMENT = 0.8;
/** Diferencia de distancia media (m) por debajo de la cual se prefiere el trazado con más viajes. */
const TIE_MARGIN_M = 5;

export interface ShapeMatch {
  shapeId: string;
  meanDistanceM: number;
  orderAgreement: number;
}

/**
 * Elige el trazado GTFS que corresponde a un sentido de una línea.
 *
 * La equivalencia entre "sentido" (fuente EMT) y "direction_id" (GTFS) no está
 * documentada, así que se decide por geometría: el trazado debe pasar cerca de
 * las paradas y recorrerlas en el mismo orden. Devuelve null si ninguno encaja.
 */
export function matchShape(
  stops: LatLon[],
  candidates: GtfsShapeUsage[],
  shapes: Map<string, LatLon[]>,
): ShapeMatch | null {
  if (stops.length < 2) return null;

  const scored = candidates.flatMap(({ shapeId, trips }) => {
    const line = shapes.get(shapeId);
    if (!line || line.length < 2) return [];
    const projections = projectOntoLine(stops, line);
    const meanDistanceM = projections.reduce((sum, p) => sum + p.distance, 0) / projections.length;
    let forward = 0;
    for (let i = 1; i < projections.length; i++) {
      if (projections[i]!.along >= projections[i - 1]!.along) forward++;
    }
    return [{ shapeId, trips, meanDistanceM, orderAgreement: forward / (projections.length - 1) }];
  });

  const acceptable = scored
    .filter(
      (s) => s.orderAgreement >= MIN_ORDER_AGREEMENT && s.meanDistanceM <= MAX_MEAN_STOP_TO_SHAPE_M,
    )
    .sort((a, b) =>
      Math.abs(a.meanDistanceM - b.meanDistanceM) < TIE_MARGIN_M
        ? b.trips - a.trips
        : a.meanDistanceM - b.meanDistanceM,
    );

  const best = acceptable[0];
  return best
    ? {
        shapeId: best.shapeId,
        meanDistanceM: best.meanDistanceM,
        orderAgreement: best.orderAgreement,
      }
    : null;
}
