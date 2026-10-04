/**
 * "Avísame cuando falten X minutos" (Fase 4). Lógica pura: dada la llegada
 * estimada del autobús elegido, decide si avisar ya, programar el aviso o
 * darlo por perdido. El servicio la aplica cada vez que llega un dato nuevo.
 */

/** Opciones que se ofrecen al usuario, en minutos. */
export const ALERT_MINUTES: readonly number[] = [2, 5, 10, 15];

/** Un aviso programado sobre un autobús concreto camino de una parada. */
export interface ArrivalAlert {
  readonly stopId: string;
  readonly lineId: string;
  readonly directionId: number;
  readonly vehicleId: string;
  /** Avisar cuando falten estos minutos. */
  readonly minutes: number;
}

export type AlertDecision =
  /** El autobús ya no aparece camino de la parada (pasó o dejó de emitir). */
  | { readonly kind: 'lost' }
  /** Ya faltan los minutos pedidos (o menos): avisar ahora. */
  | { readonly kind: 'now'; readonly eta: number }
  /** Avisar dentro de `inMinutes`. */
  | { readonly kind: 'later'; readonly inMinutes: number };

/** `eta`: minutos que faltan según la última estimación (null si el bus no está). */
export function decideAlert(minutes: number, eta: number | null): AlertDecision {
  if (eta === null) return { kind: 'lost' };
  if (eta <= minutes) return { kind: 'now', eta };
  return { kind: 'later', inMinutes: eta - minutes };
}

/** Opciones que tienen sentido con el autobús a `eta` minutos (las menores). */
export function alertOptions(eta: number): readonly number[] {
  return ALERT_MINUTES.filter((m) => m < eta);
}
