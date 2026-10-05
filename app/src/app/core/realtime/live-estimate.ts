import { Direction } from '../models/network.model';
import { ScheduledTrip } from '../schedule/schedule';
import { Vehicle } from './realtime';

/**
 * Fase 6: estimación con el retraso real de cada autobús. Lógica pura.
 *
 * - Se casa el autobús con el viaje del horario que está haciendo (el que debía
 *   pasar por su última parada más cerca de la hora del dato, prefiriendo que
 *   vaya tarde a que vaya adelantado). Así se usan los tiempos entre paradas de
 *   ese viaje (más lentos en hora punta) y se sabe cuánto retraso lleva.
 * - Con dos datos seguidos del mismo autobús se mide a qué ritmo avanza frente
 *   al horario (atascos, calles despejadas) y se aplica a lo que le queda.
 */

/** Lo que ayuda a afinar: viajes del horario y el dato anterior de cada autobús. */
export interface LiveContext {
  /** Viajes de un sentido el día del dato (minutos desde su medianoche). */
  readonly trips?: (
    lineId: string,
    directionId: number,
    dateKey: string,
  ) => readonly ScheduledTrip[];
  /** Dato anterior (distinto) del mismo autobús. */
  readonly previous?: (vehicleId: string) => Vehicle | undefined;
}

export interface VehicleProgress {
  /** Minutos desde la salida en cada parada del sentido (del viaje casado o típicos). */
  readonly profile: readonly number[];
  /** Ritmo frente al horario: 1 = como el horario; 0,8 = va un 20 % más lento. */
  readonly pace: number;
  /** Minutos de retraso (negativo: adelantado); null si no se ha podido casar con un viaje. */
  readonly delay: number | null;
}

/** Un autobús se casa con un viaje si va entre 10 min adelantado y 40 min tarde. */
const MAX_EARLY_MINUTES = 10;
const MAX_LATE_MINUTES = 40;
/** Ir adelantado es raro: en la comparación cuenta el triple que ir tarde. */
const EARLY_WEIGHT = 3;
/** Para medir el ritmo, los dos datos deben estar separados al menos esto. */
const MIN_PACE_INTERVAL_MINUTES = 2;
/** El ritmo medido se mezcla con el del horario y se acota (un semáforo no es un atasco). */
const PACE_WEIGHT = 0.5;
const MIN_PACE = 0.6;
const MAX_PACE = 1.4;

/**
 * Viaje, retraso y ritmo de un autobús que acaba de pasar por la parada
 * `lastIndex` de su sentido.
 */
export function vehicleProgress(
  vehicle: Vehicle,
  direction: Direction,
  lastIndex: number,
  context: LiveContext = {},
): VehicleProgress | null {
  const typical = direction.minutes;
  if (!typical) return null;
  const reportMinutes = vehicle.seconds / 60;

  let profile: readonly number[] = typical;
  let delay: number | null = null;
  let bestCost = Infinity;
  for (const trip of context.trips?.(vehicle.lineId, direction.id, vehicle.dateKey) ?? []) {
    const tripProfile = trip.profile ?? typical;
    const scheduled = trip.start + tripProfile[lastIndex]!;
    const tripDelay = reportMinutes - scheduled;
    if (tripDelay < -MAX_EARLY_MINUTES || tripDelay > MAX_LATE_MINUTES) continue;
    const cost = tripDelay < 0 ? -tripDelay * EARLY_WEIGHT : tripDelay;
    if (cost < bestCost) {
      bestCost = cost;
      profile = tripProfile;
      delay = tripDelay;
    }
  }

  let pace = 1;
  const previous = context.previous?.(vehicle.id);
  if (
    previous &&
    previous.lineId === vehicle.lineId &&
    previous.directionId === vehicle.directionId &&
    previous.dateKey === vehicle.dateKey
  ) {
    const elapsed = (vehicle.seconds - previous.seconds) / 60;
    const previousIndex = direction.stopIds.lastIndexOf(previous.lastStopId, lastIndex);
    if (elapsed >= MIN_PACE_INTERVAL_MINUTES && previousIndex !== -1) {
      const scheduled = profile[lastIndex]! - profile[previousIndex]!;
      const measured = scheduled / elapsed;
      pace = clamp(1 - PACE_WEIGHT + PACE_WEIGHT * measured, MIN_PACE, MAX_PACE);
    }
  }
  return { profile, pace, delay };
}

/**
 * Minutos que le faltan a un autobús para llegar a la parada `stopIndex`,
 * contados desde ahora (`ageMinutes` después del dato).
 */
export function minutesToStop(
  progress: VehicleProgress,
  lastIndex: number,
  stopIndex: number,
  ageMinutes: number,
): number {
  const scheduled = progress.profile[stopIndex]! - progress.profile[lastIndex]!;
  return scheduled / progress.pace - ageMinutes;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
