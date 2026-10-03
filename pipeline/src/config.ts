const BASE = 'https://datosabiertos.malaga.eu/recursos/transporte/EMT';
const CARTO_BASE =
  'https://datosabiertos.malaga.eu/recursos/urbanismoEInfraestructura/planimetria/callejero';

export const SOURCES = {
  /** Líneas con sus paradas ordenadas por sentido (JSON plano, sin geometría). */
  emtLines: {
    name: 'Líneas y paradas autobuses EMT',
    dataset: 'https://datosabiertos.malaga.eu/dataset/lineas-y-paradas-autobuses-emt',
    url: `${BASE}/EMTLineasYParadas/lineasyparadas.geojson`,
  },
  /** GTFS: solo se usan los trazados (shapes) y su relación con líneas y sentidos. */
  gtfs: {
    name: 'Líneas y horarios bus - Google Transit',
    dataset: 'https://datosabiertos.malaga.eu/dataset/lineas-y-horarios-bus-google-transit',
    url: `${BASE}/lineasYHorarios/google_transit_txt.zip`,
  },
  /** Límites de barrios (polígonos en WGS84, WKT). */
  neighbourhoods: {
    name: 'Sistema de información cartográfica: barrio',
    dataset: 'https://datosabiertos.malaga.eu/dataset/sistema-de-informacion-cartografica-barrio',
    url: `${CARTO_BASE}/da_cartografiaBarrio-4326.csv`,
  },
  /** Límites de distritos municipales (polígonos en WGS84, WKT). */
  districts: {
    name: 'Sistema de información cartográfica: distrito municipal',
    dataset:
      'https://datosabiertos.malaga.eu/dataset/sistema-de-informacion-cartografica-distrito-municipal',
    url: `${CARTO_BASE}/da_cartografiaDistritoMunicipal-4326.csv`,
  },
} as const;

export const LICENSE = {
  id: 'CC-BY-SA-4.0',
  url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  // La ficha del portal es contradictoria (BY frente a BY-SA); se asume la más restrictiva (ADR 0002).
  attribution: 'Datos: Ayuntamiento de Málaga – datosabiertos.malaga.eu (EMT Málaga)',
} as const;

/** Versión del formato de los ficheros publicados. Cambiarla si se rompe la compatibilidad. */
export const SCHEMA_VERSION = 1;

/** Tolerancias de simplificación de trazados, en metros. */
export const SIMPLIFY_TOLERANCE_M = {
  overview: 25,
  detail: 4,
} as const;

/**
 * Si una cifra cae por debajo de esta fracción respecto a la última publicación,
 * se considera que la fuente está rota y no se publica.
 */
export const MIN_RATIO_VS_PREVIOUS = 0.8;

/** Mínimos absolutos de sentido común para la red de la EMT. */
export const MIN_COUNTS = { lines: 20, stops: 500, zones: 100 } as const;

/** Tolerancia de simplificación de los contornos de barrios y distritos, en metros. */
export const ZONE_SIMPLIFY_TOLERANCE_M = 8;

/**
 * Una parada cuenta como "de la zona" si está dentro o a menos de esta distancia
 * del borde: muchas paradas están en las calles que hacen de límite.
 */
export const ZONE_STOP_MARGIN_M = 100;

/** Distancia media máxima (m) entre las paradas de un sentido y su trazado para aceptarlo. */
export const MAX_MEAN_STOP_TO_SHAPE_M = 60;

export const FETCH = { timeoutMs: 60_000, retries: 3 } as const;
