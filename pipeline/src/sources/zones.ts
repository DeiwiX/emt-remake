import type { LatLon } from '../build/geometry.ts';
import { ValidationError, requireMalagaCoordinate } from '../validation.ts';
import { parseCsv } from './csv.ts';

export type ZoneKind = 'neighbourhood' | 'district';

/** Polígono: anillo exterior seguido de los huecos, cada uno como lista de puntos. */
export type Polygon = LatLon[][];

export interface RawZone {
  id: string;
  kind: ZoneKind;
  name: string;
  polygons: Polygon[];
}

/** Columnas de los CSV del "Sistema de información cartográfica" del Ayuntamiento. */
const COLUMNS: Record<ZoneKind, { id: string; name: string }> = {
  neighbourhood: { id: 'ID_BARRIO', name: 'NOMBARRIO' },
  district: { id: 'NUMERO', name: 'NOMBRE' },
};

/** Lee el CSV de barrios o de distritos (geometría en la columna SDOAREA, WKT en WGS84). */
export function parseZonesCsv(text: string, kind: ZoneKind): RawZone[] {
  const columns = COLUMNS[kind];
  return parseCsv(text).map((row, i) => {
    const where = `${kind} fila ${i + 2}`;
    const id = (row[columns.id] ?? '').trim();
    const name = (row[columns.name] ?? '').trim();
    if (!id || !name) throw new ValidationError(`${where}: falta identificador o nombre`);
    const polygons = parseWktPolygons(row['SDOAREA'] ?? '', where);
    return { id: `${kind === 'district' ? 'd' : 'b'}${id}`, kind, name: titleCase(name), polygons };
  });
}

/**
 * Interpreta POLYGON y MULTIPOLYGON en WKT ("lon lat"). Solo lo necesario para
 * estos ficheros: sin Z/M ni geometrías vacías.
 */
export function parseWktPolygons(wkt: string, where = 'WKT'): Polygon[] {
  const type = wkt.trim().split(/\s*\(/)[0]?.toUpperCase();
  if (type !== 'POLYGON' && type !== 'MULTIPOLYGON') {
    throw new ValidationError(`${where}: geometría no admitida (${type ?? 'vacía'})`);
  }
  // Cada polígono es "((anillo), (hueco), ...)": se separan por ")), ((" en MULTIPOLYGON.
  const body = wkt.slice(wkt.indexOf('(')).trim();
  const polygonTexts = type === 'POLYGON' ? [body.slice(1, -1)] : splitMultipolygon(body);
  return polygonTexts.map((polygonText) =>
    [...polygonText.matchAll(/\(([^()]+)\)/g)].map((ring) =>
      ring[1]!.split(',').map((pair): LatLon => {
        const [lon, lat] = pair.trim().split(/\s+/).map(Number);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          throw new ValidationError(`${where}: coordenada no válida "${pair.trim()}"`);
        }
        requireMalagaCoordinate(lat!, lon!, where);
        return [lat!, lon!];
      }),
    ),
  );
}

function splitMultipolygon(body: string): string[] {
  const inner = body.slice(1, -1);
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '(') {
      if (depth === 0) start = i;
      depth++;
    } else if (inner[i] === ')') {
      depth--;
      if (depth === 0) parts.push(inner.slice(start, i + 1));
    }
  }
  return parts;
}

/** Palabras que van en minúscula salvo al principio ("Carretera de Cadiz"). */
const LOWERCASE_WORDS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'a']);

/** "TEATINOS-UNIVERSIDAD" -> "Teatinos-Universidad"; "CARRETERA DE CADIZ" -> "Carretera de Cadiz". */
export function titleCase(text: string): string {
  return text
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word, i) =>
      i > 0 && LOWERCASE_WORDS.has(word)
        ? word
        : word.replace(
            /(^|[-(/])(\p{L})/gu,
            (_, sep: string, letter: string) => sep + letter.toLocaleUpperCase('es'),
          ),
    )
    .join(' ');
}
