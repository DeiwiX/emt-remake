import { Line } from '../models/network.model';
import { ServiceClock, Timetables, passingTimes } from '../schedule/schedule';
import { JourneyOption, Leg } from './planner';

/** "Salir a las" (o "ahora") o "Llegar a las". */
export type TimeMode = 'depart' | 'arrive';

/** Margen mínimo entre bajar de un bus y subir al siguiente, además del tramo a pie. */
const TRANSFER_BUFFER_MINUTES = 2;
/** Salidas del primer bus que se prueban hacia atrás en "Llegar a las". */
const MAX_ARRIVE_BY_CANDIDATES = 60;
/**
 * En "Llegar a las" no se proponen salidas de más de 3 horas antes: un bus
 * nocturno de madrugada "llega a tiempo" a las 22:00, pero no es una opción útil.
 */
const MAX_ARRIVE_BY_WINDOW_MINUTES = 180;

export interface TimedLeg {
  readonly leg: Leg;
  /** Minutos desde la medianoche del día de referencia (ver schedule.ts). */
  readonly departure: number;
  readonly arrival: number;
}

export interface TimedJourney {
  readonly option: JourneyOption;
  readonly legs: readonly TimedLeg[];
  readonly departure: number;
  readonly arrival: number;
}

/**
 * Encaja una opción en el horario programado: qué bus coger en cada tramo y a
 * qué hora se llega. Devuelve null si alguna línea no tiene horario o no quedan
 * buses en el día de referencia y el siguiente.
 */
export function scheduleJourney(
  option: JourneyOption,
  lines: readonly Line[],
  timetables: Timetables,
  clock: ServiceClock,
  mode: TimeMode,
): TimedJourney | null {
  const plans = option.legs.map((leg) => legPlan(leg, lines, timetables, clock.dateKey));
  if (plans.some((p) => p === null)) return null;
  const legPlans = plans as LegPlan[];

  if (mode === 'depart') return ride(option, legPlans, clock.minutes);

  // "Llegar a las": el último primer bus con el que se llega a tiempo.
  const earliest = clock.minutes - MAX_ARRIVE_BY_WINDOW_MINUTES;
  const candidates = legPlans[0]!.times
    .filter((t) => t <= clock.minutes && t >= earliest)
    .reverse();
  for (const departure of candidates.slice(0, MAX_ARRIVE_BY_CANDIDATES)) {
    const journey = ride(option, legPlans, departure);
    if (journey && journey.arrival <= clock.minutes) return journey;
  }
  return null;
}

/** Ordena para recomendar: antes la que llega antes (salir) o la que sale más tarde (llegar). */
export function compareTimed(mode: TimeMode) {
  return (a: TimedJourney, b: TimedJourney) =>
    mode === 'depart'
      ? a.arrival - b.arrival || a.option.legs.length - b.option.legs.length
      : b.departure - a.departure || a.arrival - b.arrival;
}

interface LegPlan {
  leg: Leg;
  /** Pasos programados por la parada de subida. */
  times: number[];
  /** Minutos de viaje entre subida y bajada según el horario. */
  rideMinutes: number;
}

function legPlan(
  leg: Leg,
  lines: readonly Line[],
  timetables: Timetables,
  dateKey: string,
): LegPlan | null {
  const direction = lines
    .find((l) => l.id === leg.lineId)
    ?.directions.find((d) => d.id === leg.directionId);
  if (!direction?.minutes) return null;
  const from = direction.stopIds.indexOf(leg.fromStopId);
  const to = direction.stopIds.indexOf(leg.toStopId, from + 1);
  if (from === -1 || to === -1) return null;
  const offset = direction.minutes[from]!;
  const times = passingTimes(timetables, leg.lineId, leg.directionId, offset, dateKey);
  if (times.length === 0) return null;
  return { leg, times, rideMinutes: direction.minutes[to]! - offset };
}

function ride(option: JourneyOption, plans: LegPlan[], from: number): TimedJourney | null {
  let ready = from;
  const legs: TimedLeg[] = [];
  for (const [i, plan] of plans.entries()) {
    const departure = plan.times.find((t) => t >= ready);
    if (departure === undefined) return null;
    const arrival = departure + plan.rideMinutes;
    legs.push({ leg: plan.leg, departure, arrival });
    const isLast = i === plans.length - 1;
    ready = arrival + (isLast ? 0 : option.walkMinutes + TRANSFER_BUFFER_MINUTES);
  }
  return { option, legs, departure: legs[0]!.departure, arrival: legs.at(-1)!.arrival };
}
