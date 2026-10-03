/**
 * Tipos previstos para fases posteriores. Solo existen para que el modelo ya
 * contemple estas entidades (RNF-07); no hay implementación en la Fase 1.
 */

/** Fase 3: autobús en servicio. */
export interface Vehicle {
  readonly id: string;
  readonly lineId: string;
  readonly directionId: number;
  readonly lat: number;
  readonly lon: number;
  /** Última parada por la que ha pasado, si se conoce. */
  readonly lastStopId?: string;
  readonly updatedAt: Date;
}

/** Fase 3: llegada prevista de un autobús a una parada. */
export interface Arrival {
  readonly stopId: string;
  readonly lineId: string;
  readonly directionId: number;
  readonly vehicleId?: string;
  readonly expectedAt: Date;
  /** Distingue siempre los datos oficiales de las estimaciones propias. */
  readonly source: 'official' | 'estimated';
  readonly updatedAt: Date;
}

/** Fase 4: aviso del servicio. */
export interface ServiceAlert {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly lineIds: readonly string[];
  readonly stopIds: readonly string[];
  readonly validFrom?: Date;
  readonly validTo?: Date;
}

/** Fase 2: favorito guardado en el dispositivo. */
export type Favorite =
  | { readonly kind: 'line'; readonly lineId: string }
  | { readonly kind: 'stop'; readonly stopId: string }
  | { readonly kind: 'place'; readonly label: string; readonly lat: number; readonly lon: number };
