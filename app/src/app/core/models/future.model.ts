/**
 * Tipos previstos para fases posteriores. Solo existen para que el modelo ya
 * contemple estas entidades (RNF-07); no hay implementación en la Fase 1.
 */

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
