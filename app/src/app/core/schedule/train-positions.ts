import { Direction } from '../models/network.model';
import { Timetables, scheduledTrips } from './schedule';

/**
 * Dónde va cada tren del metro según su horario (17/10/2026). El metro no
 * publica tiempo real, pero es muy puntual: con el horario de cada viaje se sabe
 * entre qué estaciones va y cuánto le falta a la siguiente. Lógica pura.
 */
export interface TrainPosition {
  readonly directionId: number;
  /** Índices (en las paradas de su sentido) de la última estación y la siguiente. */
  readonly fromIndex: number;
  readonly toIndex: number;
  /** Minutos que le faltan para llegar a la siguiente estación. */
  readonly minutesToNext: number;
  /** true si ahora mismo está parado en la estación `fromIndex`. */
  readonly atStation: boolean;
}

/** Trenes en marcha de un sentido a los `minutes` (desde la medianoche de `dateKey`). */
export function trainPositions(
  timetables: Timetables,
  lineId: string,
  direction: Direction,
  dateKey: string,
  minutes: number,
): TrainPosition[] {
  const typical = direction.minutes;
  if (!typical) return [];
  return scheduledTrips(timetables, lineId, direction.id, dateKey).flatMap(
    (trip): TrainPosition[] => {
      const profile = trip.profile ?? typical;
      const times = profile.map((m) => trip.start + m);
      if (minutes < times[0]! || minutes >= times.at(-1)!) return [];
      let from = 0;
      while (from + 1 < times.length && times[from + 1]! <= minutes) from++;
      return [
        {
          directionId: direction.id,
          fromIndex: from,
          toIndex: from + 1,
          minutesToNext: Math.max(1, Math.round(times[from + 1]! - minutes)),
          atStation: times[from] === minutes,
        },
      ];
    },
  );
}
