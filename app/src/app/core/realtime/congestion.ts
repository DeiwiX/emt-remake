import { Direction } from '../models/network.model';
import { StopPassage } from './realtime.service';

/**
 * Atascos estimados con los autobuses (Fase 8, propuesta 5B). Lógica pura.
 *
 * Con el tiempo real de la EMT se sabe cuándo deja cada autobús una parada
 * atrás (con un minuto de margen). Si entre dos paradas ha tardado bastante más
 * que su horario, el tramo va lento; también si lleva en un tramo mucho más de
 * lo que debería tardar en recorrerlo.
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

/** El tramo debe medir entre 2 y 20 min (si no, no se mide nada fiable). */
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
 * Tramo lento de un autobús, o null si va normal o no se puede medir.
 *
 * - `passages`: las dos últimas paradas que ha dejado atrás (la más reciente al final).
 * - `profile`: minutos desde la salida en cada parada del sentido, según el horario.
 * - Si aún no ha dejado atrás la siguiente parada, se mide lo que lleva en el
 *   tramo hasta ella (`now`, segundos Unix).
 * - En la primera parada no se mide: puede estar esperando la hora de salida.
 */
export function slowStretch(
  passages: readonly StopPassage[],
  now: number,
  direction: Direction,
  profile: readonly number[],
): SlowStretch | null {
  const last = passages.at(-1);
  if (!last || !last.exact) return null;
  const lastIndex = direction.stopIds.indexOf(last.stopId);
  if (lastIndex === -1) return null;
  const previous = passages.length > 1 ? passages.at(-2)! : null;
  const measured =
    previous?.exact &&
    previous.lineId === last.lineId &&
    previous.directionId === last.directionId &&
    measure(
      direction.stopIds.lastIndexOf(previous.stopId, lastIndex - 1),
      lastIndex,
      (last.at - previous.at) / 60,
      profile,
    );
  if (measured)
    return {
      ...measured,
      vehicleId: last.vehicleId,
      lineId: last.lineId,
      directionId: last.directionId,
    };
  // Sin pasar la siguiente: lleva en el tramo desde que dejó atrás la última.
  const ongoing = measure(lastIndex, lastIndex + 1, (now - last.at) / 60, profile);
  return ongoing
    ? { ...ongoing, vehicleId: last.vehicleId, lineId: last.lineId, directionId: last.directionId }
    : null;
}

function measure(
  fromIndex: number,
  toIndex: number,
  elapsed: number,
  profile: readonly number[],
): Pick<SlowStretch, 'fromIndex' | 'toIndex' | 'level' | 'extraMinutes'> | null {
  if (fromIndex <= 0 || toIndex <= fromIndex) return null;
  if (elapsed < MIN_ELAPSED_MINUTES || elapsed > MAX_ELAPSED_MINUTES) return null;
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
  return level ? { fromIndex, toIndex, level, extraMinutes: Math.round(extra) } : null;
}
