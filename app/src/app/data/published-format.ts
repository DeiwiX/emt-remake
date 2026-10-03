/**
 * Formato de los ficheros que publica pipeline/ (ver pipeline/src/output-schema.ts)
 * y su validación. Todo lo que llega de la red se valida antes de usarse: si no
 * encaja, se descarta y se sigue usando la última copia válida (RNF-09).
 */

/** Versión del formato que entiende esta versión de la app. */
export const SUPPORTED_SCHEMA_VERSION = 1;

export class DataFormatError extends Error {
  override name = 'DataFormatError';
}

export interface FileEntry {
  path: string;
  bytes: number;
  sha256: string;
}

export interface ManifestFile {
  schemaVersion: number;
  dataVersion: string;
  generatedAt: string;
  files: {
    network: FileEntry;
    shapesOverview: FileEntry;
    shapesDetail: FileEntry;
    /** Barrios y distritos. Opcional: las publicaciones anteriores no lo tienen. */
    zones?: FileEntry;
    /** Salidas programadas. Opcional, como zones. */
    timetables?: FileEntry;
  };
  license: { id: string; url: string; attribution: string };
}

export interface PublishedDirection {
  id: number;
  headsign: string;
  stopIds: string[];
  shapeId: string;
  shapeQuality: 'official' | 'approximate';
  /** Opcionales: las publicaciones anteriores a "Cómo llegar" no los traen. */
  minutes?: number[];
  timesSource?: 'schedule' | 'estimate';
}

export interface PublishedLine {
  id: string;
  name: string;
  notes: string;
  directions: PublishedDirection[];
}

export interface PublishedStop {
  id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
}

export interface NetworkFile {
  schemaVersion: number;
  lines: PublishedLine[];
  stops: PublishedStop[];
}

export interface ShapesFile {
  schemaVersion: number;
  toleranceM: number;
  shapes: Record<string, string>;
}

export interface PublishedZone {
  id: string;
  kind: 'neighbourhood' | 'district';
  name: string;
  /** Polígonos: [anillo exterior, ...huecos], como polilíneas codificadas. */
  polygons: string[][];
  stopIds: string[];
}

export interface ZonesFile {
  schemaVersion: number;
  zones: PublishedZone[];
}

export function parseZones(value: unknown): ZonesFile {
  const z = record(value, 'zones');
  schema(z['schemaVersion'], 'zones');
  const zones = array(z['zones'], 'zones.zones').map((raw, i): PublishedZone => {
    const where = `zones[${i}]`;
    const zone = record(raw, where);
    const kind = zone['kind'];
    if (kind !== 'neighbourhood' && kind !== 'district') {
      throw new DataFormatError(`${where}.kind: valor no válido`);
    }
    return {
      id: nonEmpty(zone['id'], `${where}.id`),
      kind,
      name: nonEmpty(zone['name'], `${where}.name`),
      polygons: array(zone['polygons'], `${where}.polygons`).map((polygon, p) =>
        array(polygon, `${where}.polygons[${p}]`).map((ring, r) =>
          string(ring, `${where}.polygons[${p}][${r}]`),
        ),
      ),
      stopIds: array(zone['stopIds'], `${where}.stopIds`).map((id, s) =>
        string(id, `${where}.stopIds[${s}]`),
      ),
    };
  });
  return { schemaVersion: SUPPORTED_SCHEMA_VERSION, zones };
}

export interface TimetablesFile {
  schemaVersion: number;
  services: Record<string, string[]>;
  departures: Record<string, Record<string, number[]>>;
}

export function parseTimetables(value: unknown): TimetablesFile {
  const t = record(value, 'timetables');
  schema(t['schemaVersion'], 'timetables');
  const services = Object.fromEntries(
    Object.entries(record(t['services'], 'timetables.services')).map(([service, dates]) => [
      service,
      array(dates, `services.${service}`).map((d, i) => {
        const date = string(d, `services.${service}[${i}]`);
        if (!/^\d{8}$/.test(date))
          throw new DataFormatError(`services.${service}[${i}]: fecha no válida`);
        return date;
      }),
    ]),
  );
  const departures = Object.fromEntries(
    Object.entries(record(t['departures'], 'timetables.departures')).map(([key, byService]) => [
      key,
      Object.fromEntries(
        Object.entries(record(byService, `departures.${key}`)).map(([service, times]) => [
          service,
          array(times, `departures.${key}.${service}`).map((m, i) =>
            number(m, `departures.${key}.${service}[${i}]`),
          ),
        ]),
      ),
    ]),
  );
  return { schemaVersion: SUPPORTED_SCHEMA_VERSION, services, departures };
}

export function parseManifest(value: unknown): ManifestFile {
  const m = record(value, 'manifest');
  schema(m['schemaVersion'], 'manifest');
  const files = record(m['files'], 'manifest.files');
  const license = record(m['license'], 'manifest.license');
  const generatedAt = string(m['generatedAt'], 'manifest.generatedAt');
  if (Number.isNaN(Date.parse(generatedAt))) {
    throw new DataFormatError('manifest.generatedAt: fecha no válida');
  }
  return {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    dataVersion: string(m['dataVersion'], 'manifest.dataVersion'),
    generatedAt,
    files: {
      network: fileEntry(files['network'], 'network'),
      shapesOverview: fileEntry(files['shapesOverview'], 'shapesOverview'),
      shapesDetail: fileEntry(files['shapesDetail'], 'shapesDetail'),
      ...(files['zones'] === undefined ? {} : { zones: fileEntry(files['zones'], 'zones') }),
      ...(files['timetables'] === undefined
        ? {}
        : { timetables: fileEntry(files['timetables'], 'timetables') }),
    },
    license: {
      id: string(license['id'], 'license.id'),
      url: string(license['url'], 'license.url'),
      attribution: string(license['attribution'], 'license.attribution'),
    },
  };
}

export function parseNetwork(value: unknown): NetworkFile {
  const n = record(value, 'network');
  schema(n['schemaVersion'], 'network');
  const stops = array(n['stops'], 'network.stops').map(parseStop);
  const stopIds = new Set(stops.map((s) => s.id));
  const lines = array(n['lines'], 'network.lines').map(parseLine);

  if (lines.length === 0 || stops.length === 0) {
    throw new DataFormatError('network: no hay líneas o paradas');
  }
  // Integridad referencial: toda parada citada por una línea debe existir.
  for (const line of lines) {
    for (const direction of line.directions) {
      const missing = direction.stopIds.find((id) => !stopIds.has(id));
      if (missing) {
        throw new DataFormatError(
          `network: la línea ${line.id} cita la parada ${missing}, que no existe`,
        );
      }
    }
  }
  return { schemaVersion: SUPPORTED_SCHEMA_VERSION, lines, stops };
}

export function parseShapes(value: unknown): ShapesFile {
  const s = record(value, 'shapes');
  schema(s['schemaVersion'], 'shapes');
  const shapes = record(s['shapes'], 'shapes.shapes');
  for (const [id, encoded] of Object.entries(shapes)) string(encoded, `shapes.${id}`);
  return {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    toleranceM: number(s['toleranceM'], 'shapes.toleranceM'),
    shapes: shapes as Record<string, string>,
  };
}

/**
 * Tiempos de un sentido (opcionales). Si vienen mal formados se descartan en vez
 * de rechazar toda la red: el planificador puede funcionar con una estimación.
 */
function parseTimes(
  direction: Record<string, unknown>,
  where: string,
  stopCount: number,
): Pick<PublishedDirection, 'minutes' | 'timesSource'> {
  const minutes = direction['minutes'];
  const source = direction['timesSource'];
  const valid =
    Array.isArray(minutes) &&
    minutes.length === stopCount &&
    minutes.every((m) => typeof m === 'number' && Number.isFinite(m)) &&
    (source === 'schedule' || source === 'estimate');
  if (!valid) {
    if (minutes !== undefined) console.warn(`${where}: tiempos no válidos, se ignoran`);
    return {};
  }
  return { minutes: minutes as number[], timesSource: source };
}

function parseLine(value: unknown, index: number): PublishedLine {
  const where = `network.lines[${index}]`;
  const l = record(value, where);
  const directions = array(l['directions'], `${where}.directions`).map(
    (d, i): PublishedDirection => {
      const dw = `${where}.directions[${i}]`;
      const direction = record(d, dw);
      const quality = direction['shapeQuality'];
      if (quality !== 'official' && quality !== 'approximate') {
        throw new DataFormatError(`${dw}.shapeQuality: valor no válido`);
      }
      const stopIds = array(direction['stopIds'], `${dw}.stopIds`).map((id, j) =>
        string(id, `${dw}.stopIds[${j}]`),
      );
      return {
        id: number(direction['id'], `${dw}.id`),
        headsign: string(direction['headsign'], `${dw}.headsign`),
        stopIds,
        shapeId: string(direction['shapeId'], `${dw}.shapeId`),
        shapeQuality: quality,
        ...parseTimes(direction, dw, stopIds.length),
      };
    },
  );
  if (directions.length === 0) throw new DataFormatError(`${where}: sin sentidos`);
  return {
    id: nonEmpty(l['id'], `${where}.id`),
    name: string(l['name'], `${where}.name`),
    notes: string(l['notes'], `${where}.notes`),
    directions,
  };
}

function parseStop(value: unknown, index: number): PublishedStop {
  const where = `network.stops[${index}]`;
  const s = record(value, where);
  return {
    id: nonEmpty(s['id'], `${where}.id`),
    name: string(s['name'], `${where}.name`),
    address: string(s['address'], `${where}.address`),
    lat: number(s['lat'], `${where}.lat`),
    lon: number(s['lon'], `${where}.lon`),
  };
}

function fileEntry(value: unknown, where: string): FileEntry {
  const f = record(value, `manifest.files.${where}`);
  return {
    path: nonEmpty(f['path'], `${where}.path`),
    bytes: number(f['bytes'], `${where}.bytes`),
    sha256: nonEmpty(f['sha256'], `${where}.sha256`),
  };
}

function schema(value: unknown, where: string): void {
  if (value !== SUPPORTED_SCHEMA_VERSION) {
    throw new DataFormatError(`${where}: versión de formato ${String(value)} no compatible`);
  }
}

function record(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DataFormatError(`${where}: se esperaba un objeto`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) throw new DataFormatError(`${where}: se esperaba una lista`);
  return value;
}

function string(value: unknown, where: string): string {
  if (typeof value !== 'string') throw new DataFormatError(`${where}: se esperaba texto`);
  return value;
}

function nonEmpty(value: unknown, where: string): string {
  const text = string(value, where);
  if (text.trim() === '') throw new DataFormatError(`${where}: está vacío`);
  return text;
}

function number(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new DataFormatError(`${where}: se esperaba un número`);
  }
  return value;
}
