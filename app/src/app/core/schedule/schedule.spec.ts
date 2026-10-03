import { Line } from '../models/network.model';
import { JourneyOption } from '../planner/planner';
import { compareTimed, scheduleJourney } from '../planner/scheduled-journey';
import {
  Timetables,
  addDays,
  dayOffsetOf,
  formatClock,
  madridClock,
  nextPassing,
  passingTimes,
} from './schedule';

/** Línea 1: sale de "a" a las 7:00, 7:30 y 23:50 laborables; 9:00 festivos. */
const TIMETABLES: Timetables = {
  services: new Map([
    ['LAB', new Set(['20261005', '20261006'])],
    ['FES', new Set(['20261004'])],
  ]),
  departures: new Map([
    [
      '1|1',
      new Map([
        ['LAB', [420, 450, 1430]],
        ['FES', [540]],
      ]),
    ],
    ['2|1', new Map([['LAB', [440, 470]]])],
  ]),
};

const MONDAY = '20261005';

describe('horario programado', () => {
  it('convierte la hora a la de Madrid (verano: UTC+2)', () => {
    expect(madridClock(new Date('2026-10-05T05:30:00Z'))).toEqual({
      dateKey: MONDAY,
      minutes: 7 * 60 + 30,
    });
  });

  it('suma días al cambiar de mes', () => {
    expect(addDays('20261031', 1)).toBe('20261101');
    expect(addDays('20261101', -1)).toBe('20261031');
  });

  it('calcula el paso por una parada sumando los minutos desde la primera', () => {
    // Parada a 10 min de la primera. Lunes: 7:10, 7:40, 0:00 (día siguiente);
    // martes (+1 día): 7:10 → 1440 + 430...
    expect(passingTimes(TIMETABLES, '1', 1, 10, MONDAY).slice(0, 3)).toEqual([430, 460, 1440]);
  });

  it('incluye el viaje de la noche anterior que pasa de medianoche', () => {
    // El lunes a las 23:50 + 15 min pasa el martes a las 0:05.
    expect(passingTimes(TIMETABLES, '1', 1, 15, '20261006')[0]).toBe(5);
  });

  it('devuelve los próximos pasos a partir de una hora', () => {
    expect(nextPassing(TIMETABLES, '1', 1, 0, { dateKey: MONDAY, minutes: 425 }, 2)).toEqual([
      450, 1430,
    ]);
    // Domingo: solo el servicio festivo.
    expect(nextPassing(TIMETABLES, '1', 1, 0, { dateKey: '20261004', minutes: 0 }, 1)).toEqual([
      540,
    ]);
  });

  it('si no hay servicio hoy ni mañana, busca en los días siguientes', () => {
    // El sábado 3 no hay servicio; el domingo 4 sí (festivo, 9:00): 1440 + 540.
    expect(nextPassing(TIMETABLES, '1', 1, 0, { dateKey: '20261003', minutes: 600 }, 1)).toEqual([
      1440 + 540,
    ]);
    // El jueves 1 no hay servicio hasta el domingo 4 (tres días después).
    expect(nextPassing(TIMETABLES, '1', 1, 0, { dateKey: '20261001', minutes: 0 }, 1)).toEqual([
      3 * 1440 + 540,
    ]);
  });

  it('formatea horas y detecta el día siguiente', () => {
    expect(formatClock(450)).toBe('07:30');
    expect(formatClock(1440 + 380)).toBe('06:20');
    expect(dayOffsetOf(1440 + 380)).toBe(1);
  });
});

describe('scheduleJourney', () => {
  const line = (id: string, stopIds: string[], minutes: number[]): Line => ({
    id,
    name: id,
    notes: '',
    directions: [
      {
        id: 1,
        headsign: '',
        stopIds,
        shapeId: id,
        shapeQuality: 'official',
        minutes,
        timesSource: 'schedule',
      },
    ],
  });
  const LINES = [line('1', ['a', 'b', 'c'], [0, 5, 10]), line('2', ['c', 'd'], [0, 8])];
  const leg = (lineId: string, from: string, to: string) => ({
    lineId,
    directionId: 1,
    headsign: '',
    fromStopId: from,
    toStopId: to,
    stopCount: 1,
    minutes: 5,
    estimated: false,
  });
  const direct: JourneyOption = { legs: [leg('1', 'b', 'c')], totalMinutes: 5, walkMinutes: 0 };
  const transfer: JourneyOption = {
    legs: [leg('1', 'a', 'c'), leg('2', 'c', 'd')],
    totalMinutes: 26,
    walkMinutes: 0,
  };

  it('"salir a las": coge el próximo bus y calcula la llegada', () => {
    // En b a las 7:05 (420 + 5); llega a c a las 7:10.
    const journey = scheduleJourney(
      direct,
      LINES,
      TIMETABLES,
      { dateKey: MONDAY, minutes: 400 },
      'depart',
    );
    expect([journey?.departure, journey?.arrival]).toEqual([425, 430]);
  });

  it('encadena el transbordo con margen', () => {
    // L1 sale de a 7:00, llega a c 7:10; L2 pasa por c 7:20 (440) y llega a d 7:28.
    const journey = scheduleJourney(
      transfer,
      LINES,
      TIMETABLES,
      { dateKey: MONDAY, minutes: 400 },
      'depart',
    );
    expect(journey?.legs.map((l) => [l.departure, l.arrival])).toEqual([
      [420, 430],
      [440, 448],
    ]);
  });

  it('"llegar a las": el último bus con el que se llega a tiempo', () => {
    // Para llegar a d antes de las 8:00 (480): L1 7:30 → c 7:40; L2 7:50 → d 7:58.
    const journey = scheduleJourney(
      transfer,
      LINES,
      TIMETABLES,
      { dateKey: MONDAY, minutes: 480 },
      'arrive',
    );
    expect([journey?.departure, journey?.arrival]).toEqual([450, 478]);
  });

  it('"llegar a las" no propone salidas de más de 3 horas antes', () => {
    // A las 12:00 el último que llega a tiempo saldría a las 7:30: demasiado pronto.
    const journey = scheduleJourney(
      transfer,
      LINES,
      TIMETABLES,
      { dateKey: MONDAY, minutes: 720 },
      'arrive',
    );
    expect(journey).toBeNull();
  });

  it('si no quedan buses hoy, propone el primero de mañana', () => {
    const journey = scheduleJourney(
      direct,
      LINES,
      TIMETABLES,
      { dateKey: MONDAY, minutes: 1436 },
      'depart',
    );
    // El último del lunes pasa por b a las 23:55; a las 23:56 toca el martes a las 7:05.
    expect(journey?.departure).toBe(1440 + 425);
  });

  it('sin horario para una línea devuelve null', () => {
    const noTimes: JourneyOption = { legs: [leg('9', 'a', 'b')], totalMinutes: 3, walkMinutes: 0 };
    expect(
      scheduleJourney(noTimes, LINES, TIMETABLES, { dateKey: MONDAY, minutes: 0 }, 'depart'),
    ).toBeNull();
  });

  it('recomienda la que llega antes al salir y la que sale más tarde al llegar', () => {
    const a = { option: direct, legs: [], departure: 400, arrival: 430 };
    const b = { option: direct, legs: [], departure: 410, arrival: 420 };
    expect([a, b].sort(compareTimed('depart'))[0]).toBe(b);
    expect([a, b].sort(compareTimed('arrive'))[0]).toBe(b);
  });
});
