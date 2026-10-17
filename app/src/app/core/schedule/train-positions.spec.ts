import { Direction } from '../models/network.model';
import { Timetables } from './schedule';
import { trainPositions } from './train-positions';

const direction: Direction = {
  id: 1,
  headsign: 'Andalucía Tech',
  stopIds: ['MATZ', 'MGDL', 'MPCH', 'MLUN'],
  shapeId: 's',
  shapeQuality: 'official',
  minutes: [0, 2, 4, 7],
};
const timetables: Timetables = {
  services: new Map([['LAB', new Set(['20261019'])]]),
  // Trenes que salen de Atarazanas a las 10:00 y a las 10:05.
  departures: new Map([['L1|1', new Map([['LAB', [600, 605]]])]]),
};

describe('Dónde va cada tren del metro (horario)', () => {
  it('entre qué estaciones va y cuánto le falta a la siguiente', () => {
    // A las 10:05: el de las 10:00 va de El Perchel (10:04) a La Unión (10:07);
    // el de las 10:05 está saliendo de Atarazanas.
    expect(trainPositions(timetables, 'L1', direction, '20261019', 605)).toEqual([
      {
        directionId: 1,
        fromIndex: 2,
        toIndex: 3,
        minutesToNext: 2,
        atStation: false,
        progress: 1 / 3,
      },
      { directionId: 1, fromIndex: 0, toIndex: 1, minutesToNext: 2, atStation: true, progress: 0 },
    ]);
  });

  it('antes de salir o ya llegados no cuentan', () => {
    expect(trainPositions(timetables, 'L1', direction, '20261019', 590)).toEqual([]);
    expect(trainPositions(timetables, 'L1', direction, '20261019', 700)).toEqual([]);
  });
});
