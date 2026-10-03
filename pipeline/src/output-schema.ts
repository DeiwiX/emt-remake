/**
 * Formato de los ficheros publicados (versión SCHEMA_VERSION).
 * Es el contrato con la app: cualquier cambio incompatible exige subir la versión.
 */

export interface PublishedStop {
  /** Código público de la parada (codParada de la EMT). */
  id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
}

export type ShapeQuality = 'official' | 'approximate';

export interface PublishedDirection {
  /** 1 o 2, como en la fuente de la EMT. */
  id: number;
  /** Destino del sentido ("hacia ..."). */
  headsign: string;
  /** Códigos de parada en orden de paso. */
  stopIds: string[];
  shapeId: string;
  /** "approximate" = paradas unidas con tramos rectos, sin trazado oficial. */
  shapeQuality: ShapeQuality;
}

export interface PublishedLine {
  /** Código visible de la línea ("1", "C1", "N2"...). */
  id: string;
  name: string;
  /** Observaciones e incidencias publicadas por la EMT, tal cual. */
  notes: string;
  directions: PublishedDirection[];
}

export interface NetworkFile {
  schemaVersion: number;
  lines: PublishedLine[];
  stops: PublishedStop[];
}

export interface ShapesFile {
  schemaVersion: number;
  toleranceM: number;
  /** Polilíneas codificadas (algoritmo de Google, precisión 1e-5) por shapeId. */
  shapes: Record<string, string>;
}

export interface PublishedZone {
  /** "d" + número de distrito o "b" + identificador de barrio. */
  id: string;
  kind: 'neighbourhood' | 'district';
  name: string;
  /** Polígonos; cada uno es [anillo exterior, ...huecos] como polilíneas codificadas. */
  polygons: string[][];
  /** Paradas dentro de la zona o a menos de 100 m de su borde. */
  stopIds: string[];
}

/** Barrios y distritos (añadido sin romper el formato: la app lo trata como opcional). */
export interface ZonesFile {
  schemaVersion: number;
  zones: PublishedZone[];
}

export interface FileEntry {
  path: string;
  bytes: number;
  sha256: string;
}

export interface Manifest {
  schemaVersion: number;
  /** Huella del contenido: solo cambia si cambian los datos, no la fecha de generación. */
  dataVersion: string;
  generatedAt: string;
  counts: {
    lines: number;
    stops: number;
    shapes: number;
    approximateShapes: number;
    zones: number;
  };
  files: {
    network: FileEntry;
    shapesOverview: FileEntry;
    shapesDetail: FileEntry;
    zones: FileEntry;
  };
  sources: { name: string; dataset: string; url: string; lastModified: string | null }[];
  license: { id: string; url: string; attribution: string };
}
