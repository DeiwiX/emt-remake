import { strFromU8, unzipSync } from 'fflate';

import { parseCsv } from './csv.ts';
import type { LatLon } from '../build/geometry.ts';
import { ValidationError, requireMalagaCoordinate, requireNumber } from '../validation.ts';

export interface GtfsShapeUsage {
  shapeId: string;
  /** Número de viajes que usan este trazado: sirve para elegir la variante principal. */
  trips: number;
}

export interface GtfsData {
  /** Trazados por shape_id, con los puntos en orden. */
  shapes: Map<string, LatLon[]>;
  /** Trazados usados por cada línea (route_short_name), de más a menos viajes. */
  shapesByLineCode: Map<string, GtfsShapeUsage[]>;
}

/** Solo estos ficheros: stop_times (unos 35 MB) no hace falta en la Fase 1. */
const NEEDED_FILES = ['routes', 'trips', 'shapes'] as const;
type NeededFile = (typeof NEEDED_FILES)[number];

export function parseGtfsZip(zip: Uint8Array): GtfsData {
  const files = unzipSync(zip, {
    filter: (file) => (NEEDED_FILES as readonly string[]).includes(baseName(file.name)),
  });
  const tables = new Map<string, Record<string, string>[]>(
    Object.entries(files).map(([name, bytes]) => [baseName(name), parseCsv(strFromU8(bytes))]),
  );
  const table = (name: NeededFile): Record<string, string>[] => {
    const rows = tables.get(name);
    if (!rows?.length) throw new ValidationError(`GTFS: falta o está vacío ${name}`);
    return rows;
  };

  const lineCodeByRouteId = new Map(
    table('routes').map((r) => [r['route_id'] ?? '', (r['route_short_name'] ?? '').trim()]),
  );

  const usage = new Map<string, Map<string, number>>();
  for (const trip of table('trips')) {
    const code = lineCodeByRouteId.get(trip['route_id'] ?? '');
    const shapeId = trip['shape_id'];
    if (!code || !shapeId) continue;
    const counts = usage.get(code) ?? new Map<string, number>();
    counts.set(shapeId, (counts.get(shapeId) ?? 0) + 1);
    usage.set(code, counts);
  }

  const shapesByLineCode = new Map(
    [...usage.entries()].map(([code, counts]) => [
      code,
      [...counts.entries()]
        .map(([shapeId, trips]) => ({ shapeId, trips }))
        .sort((a, b) => b.trips - a.trips),
    ]),
  );

  return { shapes: parseShapes(table('shapes')), shapesByLineCode };
}

function parseShapes(rows: Record<string, string>[]): Map<string, LatLon[]> {
  const points = new Map<string, { seq: number; point: LatLon }[]>();
  rows.forEach((row, i) => {
    const where = `GTFS shapes, fila ${i + 2}`;
    const id = row['shape_id'];
    if (!id) throw new ValidationError(`${where}: falta shape_id`);
    const lat = requireNumber(row['shape_pt_lat'], `${where}.shape_pt_lat`);
    const lon = requireNumber(row['shape_pt_lon'], `${where}.shape_pt_lon`);
    requireMalagaCoordinate(lat, lon, where);
    const list = points.get(id) ?? [];
    list.push({ seq: requireNumber(row['shape_pt_sequence'], `${where}.seq`), point: [lat, lon] });
    points.set(id, list);
  });
  return new Map(
    [...points.entries()].map(([id, list]) => [
      id,
      list.sort((a, b) => a.seq - b.seq).map((p) => p.point),
    ]),
  );
}

/** "carpeta/routes.txt" -> "routes" (el portal publica variantes .txt y .csv). */
function baseName(path: string): string {
  return (path.split('/').pop() ?? '').replace(/\.(txt|csv)$/i, '');
}
