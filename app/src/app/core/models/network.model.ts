/**
 * Modelo de dominio de la red de autobuses. Las pantallas solo conocen estos
 * tipos, nunca el formato de una fuente concreta (RNF-07).
 */

export type LatLon = readonly [lat: number, lon: number];

/** "approximate" = recorrido dibujado uniendo paradas, sin trazado oficial. */
export type ShapeQuality = 'official' | 'approximate';

export interface Direction {
  /** 1 o 2, como en la fuente de la EMT. */
  readonly id: number;
  /** Destino del sentido ("hacia ..."). */
  readonly headsign: string;
  /** Códigos de parada en orden de paso. */
  readonly stopIds: readonly string[];
  readonly shapeId: string;
  readonly shapeQuality: ShapeQuality;
}

export interface Line {
  /** Código visible ("1", "C1", "N2"...). */
  readonly id: string;
  readonly name: string;
  /** Observaciones e incidencias publicadas por la EMT. */
  readonly notes: string;
  readonly directions: readonly Direction[];
}

export interface StopService {
  readonly lineId: string;
  readonly directionId: number;
}

export interface Stop {
  /** Código público de la parada. */
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly lat: number;
  readonly lon: number;
  /** Líneas y sentidos que pasan por la parada. */
  readonly services: readonly StopService[];
}

/** Nivel de detalle de los trazados: vista general o zoom cercano. */
export type ShapeDetail = 'overview' | 'detail';
