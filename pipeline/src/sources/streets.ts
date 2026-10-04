import type { LatLon } from '../build/geometry.ts';
import { ValidationError, requireMalagaCoordinate } from '../validation.ts';
import { parseCsv } from './csv.ts';
import { titleCase } from './zones.ts';

/** Calle del callejero municipal con los portales que tiene. */
export interface RawStreet {
  id: string;
  name: string;
  portals: { number: number; point: LatLon }[];
}

/**
 * Cruza las tablas del callejero ("Sistema de información cartográfica"):
 * vías (nombre y tipo), tipos de vía y números de portal con su posición.
 * Se descartan las vías y los portales dados de baja.
 */
export function parseStreets(viasCsv: string, typesCsv: string, numbersCsv: string): RawStreet[] {
  const types = new Map(
    parseCsv(typesCsv).map((row) => [row['CODTIPVIAL'] ?? '', (row['DESTIPVIAL'] ?? '').trim()]),
  );
  const streets = new Map<string, RawStreet>();
  for (const [i, row] of parseCsv(viasCsv).entries()) {
    if ((row['FECBAJA'] ?? '').trim()) continue;
    const id = (row['CODVIAL5'] ?? '').trim();
    const name = (row['NOMVIAL'] ?? '').trim();
    if (!id || !name) throw new ValidationError(`vía fila ${i + 2}: falta código o nombre`);
    const type = types.get(row['CODTIPVIAL'] ?? '') ?? '';
    streets.set(id, { id, name: titleCase(type ? `${type} ${name}` : name), portals: [] });
  }
  for (const [i, row] of parseCsv(numbersCsv).entries()) {
    if ((row['FECBAJA'] ?? '').trim()) continue;
    const street = streets.get((row['CODVIAL5'] ?? '').trim());
    const number = Number.parseInt(row['NUMERO'] ?? '', 10);
    if (!street || !Number.isFinite(number)) continue;
    street.portals.push({ number, point: parseWktPoint(row['SDOPUNTO'] ?? '', `portal fila ${i + 2}`) });
  }
  return [...streets.values()];
}

/** "POINT (lon lat)" -> [lat, lon]. */
function parseWktPoint(wkt: string, where: string): LatLon {
  const match = /^POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/i.exec(wkt.trim());
  if (!match) throw new ValidationError(`${where}: punto no válido "${wkt}"`);
  const lon = Number(match[1]);
  const lat = Number(match[2]);
  requireMalagaCoordinate(lat, lon, where);
  return [lat, lon];
}
