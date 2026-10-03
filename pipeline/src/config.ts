const BASE = 'https://datosabiertos.malaga.eu/recursos/transporte/EMT';

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
export const MIN_COUNTS = { lines: 20, stops: 500 } as const;

/** Distancia media máxima (m) entre las paradas de un sentido y su trazado para aceptarlo. */
export const MAX_MEAN_STOP_TO_SHAPE_M = 60;

export const FETCH = { timeoutMs: 60_000, retries: 3 } as const;
