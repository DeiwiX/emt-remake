import { Direction } from '../models/network.model';
import { Vehicle } from './realtime';

/**
 * Atascos estimados con los autobuses (Fase 8, propuesta 5B). Lógica pura.
 *
 * Con dos datos seguidos del mismo autobús se sabe entre qué paradas ha ido y
 * cuánto ha tardado. Si ha tardado bastante más que su horario en ese tramo,
 * el tramo va lento. La fuente da un dato cada ~5 min, así que hace falta
 * haber visto dos datos de un autobús (unos 5 min con el mapa abierto).
 */

export type CongestionLevel = 'slow' | 'jam';

/** Tramo de un sentido (entre dos paradas) que un autobús acaba de recorrer despacio. */
export interface SlowStretch {
  readonly vehicleId: string;
  readonly lineId: string;
  readonly directionId: number;
  /** Índices de las paradas del sentido entre las que va el tramo. */
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly level: CongestionLevel;
  /** Minutos de más frente al horario. */
  readonly extraMinutes: number;
}

/** Los dos datos deben estar separados entre 2 y 20 min (si no, no se mide nada fiable). */
const MIN_ELAPSED_MINUTES = 2;
const MAX_ELAPSED_MINUTES = 20;
/** Lento: al menos 2 min de más y un 50 % más de lo previsto. */
const SLOW_EXTRA_MINUTES = 2;
const SLOW_RATIO = 1.5;
/** Atasco: al menos 5 min de más y el doble de lo previsto. */
const JAM_EXTRA_MINUTES = 5;
const JAM_RATIO = 2;
/** Un tramo de horario muy corto se cuenta como 1 min, para que un semáforo no parezca un atasco. */
const MIN_SCHEDULED_MINUTES = 1;

/**
 * Tramo lento que ha recorrido un autobús entre su dato anterior y el actual,
 * o null si ha ido normal o no se puede medir.
 *
 * - `lastIndex`: índice de su última parada en el sentido.
 * - `profile`: minutos desde la salida en cada parada (de su viaje del horario).
 * - Si no ha pasado ninguna parada entre los dos datos, se mide el tramo hasta
 *   la siguiente (lleva parado más de lo que debería tardar en llegar).
 * - En la primera parada no se mide: puede estar esperando la hora de salida.
 */
export function slowStretch(
  vehicle: Vehicle,
  previous: Vehicle | undefined,
  direction: Direction,
  lastIndex: number,
  profile: readonly number[],
): SlowStretch | null {
  if (
    !previous ||
    previous.lineId !== vehicle.lineId ||
    previous.directionId !== vehicle.directionId ||
    previous.dateKey !== vehicle.dateKey
  ) {
    return null;
  }
  const elapsed = (vehicle.seconds - previous.seconds) / 60;
  if (elapsed < MIN_ELAPSED_MINUTES || elapsed > MAX_ELAPSED_MINUTES) return null;
  const fromIndex = direction.stopIds.lastIndexOf(previous.lastStopId, lastIndex);
  if (fromIndex <= 0) return null;
  const toIndex = fromIndex === lastIndex ? lastIndex + 1 : lastIndex;
  if (toIndex >= direction.stopIds.length) return null;
  const from = profile[fromIndex];
  const to = profile[toIndex];
  if (from === undefined || to === undefined) return null;

  const scheduled = Math.max(MIN_SCHEDULED_MINUTES, to - from);
  const extra = elapsed - scheduled;
  const ratio = elapsed / scheduled;
  const level: CongestionLevel | null =
    extra >= JAM_EXTRA_MINUTES && ratio >= JAM_RATIO
      ? 'jam'
      : extra >= SLOW_EXTRA_MINUTES && ratio >= SLOW_RATIO
        ? 'slow'
        : null;
  if (!level) return null;
  return {
    vehicleId: vehicle.id,
    lineId: vehicle.lineId,
    directionId: vehicle.directionId,
    fromIndex,
    toIndex,
    level,
    extraMinutes: Math.round(extra),
  };
}
