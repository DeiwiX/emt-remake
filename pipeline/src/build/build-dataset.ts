import { SCHEMA_VERSION, SIMPLIFY_TOLERANCE_M } from '../config.ts';
import type {
  NetworkFile,
  PublishedDirection,
  PublishedLine,
  PublishedStop,
  ShapesFile,
} from '../output-schema.ts';
import type { EmtLine } from '../sources/emt-lines.ts';
import type { GtfsData } from '../sources/gtfs.ts';
import { type LatLon, encodePolyline, simplify } from './geometry.ts';
import { matchShape } from './match-shapes.ts';
import { directionTimes } from './travel-times.ts';

export interface BuildReport {
  /** Sentidos sin trazado oficial, dibujados uniendo paradas. */
  approximateDirections: { line: string; direction: number; reason: string }[];
  /** Paradas con el mismo código pero datos distintos según la línea. */
  stopConflicts: { stopId: string; detail: string }[];
  /** Calidad del emparejamiento de cada sentido con su trazado oficial. */
  matchedDirections: { line: string; direction: number; shapeId: string; meanDistanceM: number }[];
  /** Sentidos cuyos tiempos se han estimado por distancia (sin horario utilizable). */
  estimatedTimes: { line: string; direction: number }[];
}

export interface Dataset {
  network: NetworkFile;
  shapesOverview: ShapesFile;
  shapesDetail: ShapesFile;
  report: BuildReport;
}

/** Cruza las dos fuentes y produce los ficheros que consume la app. */
export function buildDataset(emtLines: EmtLine[], gtfs: GtfsData): Dataset {
  const report: BuildReport = {
    approximateDirections: [],
    stopConflicts: [],
    matchedDirections: [],
    estimatedTimes: [],
  };
  const stops = collectStops(emtLines, report);
  const geometries = new Map<string, LatLon[]>();

  const lines: PublishedLine[] = emtLines.map((line) => ({
    id: line.code,
    name: line.name,
    notes: line.notes,
    directions: line.directions.map((direction): PublishedDirection => {
      const stopPoints = direction.stops.map((s): LatLon => [s.lat, s.lon]);
      const candidates = gtfs.shapesByLineCode.get(line.code) ?? [];
      const match = matchShape(stopPoints, candidates, gtfs.shapes);

      let shapeId: string;
      if (match) {
        shapeId = `g${match.shapeId}`;
        geometries.set(shapeId, gtfs.shapes.get(match.shapeId)!);
        report.matchedDirections.push({
          line: line.code,
          direction: direction.sentido,
          shapeId: match.shapeId,
          meanDistanceM: Math.round(match.meanDistanceM),
        });
      } else {
        shapeId = `a${line.code}-${direction.sentido}`;
        geometries.set(shapeId, stopPoints);
        report.approximateDirections.push({
          line: line.code,
          direction: direction.sentido,
          reason:
            candidates.length === 0
              ? 'La línea no tiene trazados en el GTFS'
              : 'Ningún trazado del GTFS encaja con sus paradas',
        });
      }

      const times = directionTimes(
        direction.stops,
        match ? gtfs.travelPatterns.get(match.shapeId) : undefined,
      );
      if (times.source === 'estimate') {
        report.estimatedTimes.push({ line: line.code, direction: direction.sentido });
      }
      return {
        id: direction.sentido,
        headsign: headsignFor(line, direction.sentido, direction.stops.at(-1)?.name ?? ''),
        stopIds: direction.stops.map((s) => s.code),
        shapeId,
        shapeQuality: match ? 'official' : 'approximate',
        minutes: times.minutes,
        timesSource: times.source,
      };
    }),
  }));

  return {
    network: { schemaVersion: SCHEMA_VERSION, lines, stops },
    shapesOverview: encodeShapes(geometries, SIMPLIFY_TOLERANCE_M.overview),
    shapesDetail: encodeShapes(geometries, SIMPLIFY_TOLERANCE_M.detail),
    report,
  };
}

/**
 * El sentido 1 va de "cabeceraIda" a "cabeceraVuelta" y el 2 al revés.
 * En líneas de un solo sentido (circulares) se usa el nombre de la última parada.
 */
function headsignFor(line: EmtLine, sentido: number, lastStopName: string): string {
  const head = sentido === 1 ? line.returnHead : line.originHead;
  return head || lastStopName;
}

function collectStops(emtLines: EmtLine[], report: BuildReport): PublishedStop[] {
  const byId = new Map<string, PublishedStop>();
  for (const line of emtLines) {
    for (const direction of line.directions) {
      for (const stop of direction.stops) {
        const published: PublishedStop = {
          id: stop.code,
          name: stop.name,
          address: stop.address,
          lat: round5(stop.lat),
          lon: round5(stop.lon),
        };
        const existing = byId.get(stop.code);
        if (!existing) {
          byId.set(stop.code, published);
        } else if (
          existing.name !== published.name ||
          existing.lat !== published.lat ||
          existing.lon !== published.lon
        ) {
          report.stopConflicts.push({
            stopId: stop.code,
            detail: `Línea ${line.code}: "${published.name}" (${published.lat}, ${published.lon}) frente a "${existing.name}" (${existing.lat}, ${existing.lon})`,
          });
        }
      }
    }
  }
  return [...byId.values()].sort((a, b) => Number(a.id) - Number(b.id));
}

function encodeShapes(geometries: Map<string, LatLon[]>, toleranceM: number): ShapesFile {
  const shapes: Record<string, string> = {};
  for (const [id, points] of [...geometries.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    shapes[id] = encodePolyline(simplify(points, toleranceM));
  }
  return { schemaVersion: SCHEMA_VERSION, toleranceM, shapes };
}

/** 5 decimales son unos 1,1 m: suficiente para una parada y reduce el tamaño. */
function round5(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}
