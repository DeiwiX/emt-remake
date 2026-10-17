import { Line } from '../models/network.model';
import { PassingTrip, ServiceClock, Timetables, passingTrips } from '../schedule/schedule';
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
  /** El bus de este tramo se ha visto en tiempo real (su salida es la estimada). */
  readonly live?: boolean;
}

export interface TimedJourney {
  readonly option: JourneyOption;
  readonly legs: readonly TimedLeg[];
  /** Hora a la que hay que salir: la del primer bus menos lo que se tarda en llegar a la parada. */
  readonly leaveAt: number;
  readonly departure: number;
  /** Llegada al destino: la del último bus más lo que se anda después (si el destino es una calle). */
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
  /**
   * "Salir ahora" con el primer bus visto en tiempo real (17/10/2026): minutos
   * (en el reloj de `clock`) a los que pasa por la parada de subida.
   */
  liveFirstDeparture?: number,
): TimedJourney | null {
  const plans = option.legs.map((leg) => legPlan(leg, lines, timetables, clock.dateKey));
  if (plans.some((p) => p === null)) return null;
  const legPlans = plans as LegPlan[];

  // Desde "Mi ubicación" no se puede coger un bus antes de llegar andando a la parada.
  if (mode === 'depart') {
    return ride(option, legPlans, clock.minutes + option.accessMinutes, liveFirstDeparture);
  }

  // "Llegar a las": el último primer bus con el que se llega a tiempo.
  const earliest = clock.minutes - MAX_ARRIVE_BY_WINDOW_MINUTES;
  const candidates = legPlans[0]!.trips
    .map((t) => t.departure)
    .filter(
      (t) => t <= clock.minutes - option.egressMinutes && t - option.accessMinutes >= earliest,
    )
    .reverse();
  for (const departure of candidates.slice(0, MAX_ARRIVE_BY_CANDIDATES)) {
    const journey = ride(option, legPlans, departure);
    if (journey && journey.arrival <= clock.minutes) return journey;
  }
  return null;
}

/**
 * Tramo con un bus visto en tiempo real: sale cuando dice la estimación y tarda
 * lo que el viaje del horario más cercano (o lo típico del tramo).
 */
function liveTrip(plan: LegPlan, departure: number): PassingTrip {
  const nearest = plan.trips.reduce<PassingTrip | null>(
    (best, t) =>
      !best || Math.abs(t.departure - departure) < Math.abs(best.departure - departure) ? t : best,
    null,
  );
  const minutes = nearest ? nearest.arrival - nearest.departure : plan.leg.minutes;
  return { departure, arrival: departure + minutes };
}

/** Ordena para recomendar: antes la que llega antes (salir) o la que sale más tarde (llegar). */
export function compareTimed(mode: TimeMode) {
  return (a: TimedJourney, b: TimedJourney) =>
    mode === 'depart'
      ? a.arrival - b.arrival ||
        b.leaveAt - a.leaveAt ||
        a.option.legs.length - b.option.legs.length
      : b.leaveAt - a.leaveAt || a.arrival - b.arrival;
}

/**
 * Una opción que llega más de 90 min después que la mejor (o sale 90 min antes),
 * o que tarda 90 min más, no se ofrece.
 */
export const MAX_GAP_MINUTES = 90;

/**
 * Quita las opciones que no tienen sentido frente a la mejor (16/10/2026): de
 * noche salía, por ejemplo, un transbordo que llegaba ocho horas más tarde.
 * `sorted` debe venir ordenado con compareTimed (la mejor, primero).
 */
export function withinReach(sorted: readonly TimedJourney[], mode: TimeMode): TimedJourney[] {
  const best = sorted[0];
  if (!best) return [];
  const duration = (t: TimedJourney) => t.arrival - t.leaveAt;
  return sorted.filter(
    (t) =>
      (mode === 'depart'
        ? t.arrival - best.arrival <= MAX_GAP_MINUTES
        : best.leaveAt - t.leaveAt <= MAX_GAP_MINUTES) &&
      // Tampoco las que tardan mucho más (p. ej. un búho y horas de espera hasta el siguiente).
      duration(t) - duration(best) <= MAX_GAP_MINUTES,
  );
}

interface LegPlan {
  leg: Leg;
  /** Viajes programados: paso por la parada de subida y por la de bajada. */
  trips: PassingTrip[];
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
  const trips = passingTrips(
    timetables,
    leg.lineId,
    leg.directionId,
    { index: from, typical: direction.minutes[from]! },
    { index: to, typical: direction.minutes[to]! },
    dateKey,
  );
  return trips.length > 0 ? { leg, trips } : null;
}

function ride(
  option: JourneyOption,
  plans: LegPlan[],
  from: number,
  liveFirstDeparture?: number,
): TimedJourney | null {
  let ready = from;
  const legs: TimedLeg[] = [];
  for (const [i, plan] of plans.entries()) {
    const live = i === 0 && liveFirstDeparture !== undefined && liveFirstDeparture >= from;
    const trip = live
      ? liveTrip(plan, liveFirstDeparture)
      : plan.trips.find((t) => t.departure >= ready);
    if (!trip) return null;
    const { departure, arrival } = trip;
    legs.push(
      live ? { leg: plan.leg, departure, arrival, live } : { leg: plan.leg, departure, arrival },
    );
    const isLast = i === plans.length - 1;
    ready = arrival + (isLast ? 0 : (option.transferWalks[i] ?? 0) + TRANSFER_BUFFER_MINUTES);
  }
  // Hacia atrás: en cada tramo, el último bus con el que se sigue cogiendo el
  // siguiente. Así no se espera horas en un transbordo (16/10/2026: de noche
  // proponía un búho a la 01:36 para esperar hasta las 07:46 el siguiente bus).
  for (let i = legs.length - 2; i >= 0; i--) {
    // El bus visto en tiempo real es el que hay: no se cambia por otro.
    if (legs[i]!.live) continue;
    const deadline =
      legs[i + 1]!.departure - (option.transferWalks[i] ?? 0) - TRANSFER_BUFFER_MINUTES;
    const current = legs[i]!;
    const later = plans[i]!.trips.filter(
      (t) => t.departure >= current.departure && t.arrival <= deadline,
    );
    const latest = later.at(-1);
    if (latest) legs[i] = { ...current, departure: latest.departure, arrival: latest.arrival };
  }
  const departure = legs[0]!.departure;
  return {
    option,
    legs,
    leaveAt: departure - option.accessMinutes,
    departure,
    arrival: legs.at(-1)!.arrival + option.egressMinutes,
  };
}
