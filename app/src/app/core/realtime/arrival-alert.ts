/**
 * "Avísame cuando falten X minutos" (Fase 4). Lógica pura: el aviso se pone
 * sobre un paso concreto de un autobús por una parada (del horario, también
 * de mañana, o uno visto en tiempo real) y, cada vez que hay datos nuevos, se
 * decide si su hora cambia, si hay que avisar ya o si ya terminó.
 */

/** Minutos de antelación que se ofrecen al usuario. */
export const ALERT_MINUTES: readonly number[] = [2, 5, 10, 15, 20, 30];

const MINUTE_MS = 60_000;
/** Un autobús en tiempo real se asocia al aviso si llega a menos de esto de la hora esperada. */
export const MATCH_WINDOW_MS = 10 * MINUTE_MS;
/** Pasado este tiempo desde la llegada esperada el aviso se da por terminado. */
const EXPIRE_MS = 5 * MINUTE_MS;
/** Cambios menores que esto en la hora del aviso no lo reprograman. */
const RESCHEDULE_MS = 20_000;

/** El aviso activo (uno a la vez). Las horas son instantes en milisegundos. */
export interface ArrivalAlert {
  readonly stopId: string;
  readonly lineId: string;
  readonly directionId: number;
  /** Avisar cuando falten estos minutos. */
  readonly minutes: number;
  /** Hora de paso elegida (del horario o la estimada en ese momento). */
  readonly scheduledAt: number;
  /** Hora de paso esperada ahora: cambia con el tiempo real. */
  readonly expectedAt: number;
  /** Autobús en tiempo real asociado, cuando se conoce. */
  readonly vehicleId: string | null;
  /** Hora para la que está programada la notificación. */
  readonly notifyAt: number;
}

/** Llegada de un autobús en tiempo real a la parada del aviso. */
export interface LiveArrival {
  readonly vehicleId: string;
  readonly at: number;
}

export function createAlert(
  target: {
    readonly stopId: string;
    readonly lineId: string;
    readonly directionId: number;
    readonly at: number;
    readonly vehicleId: string | null;
  },
  minutes: number,
): ArrivalAlert {
  return {
    stopId: target.stopId,
    lineId: target.lineId,
    directionId: target.directionId,
    minutes,
    scheduledAt: target.at,
    expectedAt: target.at,
    vehicleId: target.vehicleId,
    notifyAt: target.at - minutes * MINUTE_MS,
  };
}

/** Minutos de antelación posibles para un paso a `at` (el aviso debe quedar en el futuro). */
export function alertOptions(at: number, now: number): readonly number[] {
  return ALERT_MINUTES.filter((m) => at - m * MINUTE_MS > now);
}

export type AlertUpdate =
  /** Nada cambia. */
  | { readonly kind: 'keep' }
  /** Hay que (re)programar la notificación para `alert.notifyAt`. */
  | { readonly kind: 'schedule'; readonly alert: ArrivalAlert }
  /** El autobús se ha adelantado y ya toca avisar: avisar ahora y terminar. */
  | { readonly kind: 'notify-now'; readonly alert: ArrivalAlert }
  /** Terminado sin más avisos (el sistema ya avisó o el paso quedó atrás). */
  | { readonly kind: 'done' };

/**
 * Recalcula el aviso con los autobuses en tiempo real (`live`, o null si no
 * hay datos: entonces se mantiene la hora que hubiera).
 */
export function updateAlert(
  alert: ArrivalAlert,
  live: readonly LiveArrival[] | null,
  now: number,
): AlertUpdate {
  let { vehicleId, expectedAt } = alert;
  if (live) {
    const own = vehicleId ? live.find((l) => l.vehicleId === vehicleId) : undefined;
    // Sin el autobús asociado, el que llegue más cerca de la hora esperada.
    const match = own ?? nearest(live, expectedAt);
    if (match) {
      vehicleId = match.vehicleId;
      expectedAt = match.at;
    }
  }
  if (now > expectedAt + EXPIRE_MS) return { kind: 'done' };
  const notifyAt = expectedAt - alert.minutes * MINUTE_MS;
  const updated: ArrivalAlert = { ...alert, vehicleId, expectedAt, notifyAt };
  if (notifyAt <= now) {
    // Si la notificación programada ya debía haber saltado, el sistema ya avisó.
    return alert.notifyAt <= now ? { kind: 'done' } : { kind: 'notify-now', alert: updated };
  }
  if (Math.abs(notifyAt - alert.notifyAt) < RESCHEDULE_MS) {
    return vehicleId === alert.vehicleId && expectedAt === alert.expectedAt
      ? { kind: 'keep' }
      : // Mismo aviso, pero se guarda el autobús asociado y la nueva hora esperada.
        { kind: 'schedule', alert: { ...updated, notifyAt: alert.notifyAt } };
  }
  return { kind: 'schedule', alert: updated };
}

function nearest(live: readonly LiveArrival[], at: number): LiveArrival | undefined {
  let best: LiveArrival | undefined;
  for (const arrival of live) {
    const distance = Math.abs(arrival.at - at);
    if (distance <= MATCH_WINDOW_MS && (!best || distance < Math.abs(best.at - at))) {
      best = arrival;
    }
  }
  return best;
}

/** Lee un aviso guardado; null si no es válido. */
export function parseAlert(raw: string | null): ArrivalAlert | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ArrivalAlert>;
    const numbers = [value.minutes, value.scheduledAt, value.expectedAt, value.notifyAt];
    if (
      typeof value.stopId !== 'string' ||
      typeof value.lineId !== 'string' ||
      typeof value.directionId !== 'number' ||
      numbers.some((n) => typeof n !== 'number' || !Number.isFinite(n)) ||
      (value.vehicleId !== null && typeof value.vehicleId !== 'string')
    ) {
      return null;
    }
    return value as ArrivalAlert;
  } catch {
    return null;
  }
}
