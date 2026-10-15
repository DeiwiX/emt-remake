import { Direction } from '../models/network.model';
import { slowStretch } from './congestion';
import { Vehicle } from './realtime';

const direction = {
  id: 1,
  headsign: 'Centro',
  shapeId: 's',
  stopIds: ['A', 'B', 'C', 'D', 'E'],
  minutes: [0, 2, 4, 6, 8],
} as unknown as Direction;
/** Minutos desde la salida en cada parada. */
const profile = [0, 2, 4, 6, 8];

function report(lastStopId: string, minute: number, overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'bus',
    lineId: '3',
    directionId: 1,
    lastStopId,
    lat: 0,
    lon: 0,
    seconds: (8 * 60 + minute) * 60,
    dateKey: '20261015',
    ...overrides,
  };
}

function stretch(previous: Vehicle | undefined, current: Vehicle) {
  return slowStretch(
    current,
    previous,
    direction,
    direction.stopIds.indexOf(current.lastStopId),
    profile,
  );
}

describe('slowStretch', () => {
  it('si va como el horario no hay atasco', () => {
    expect(stretch(report('B', 0), report('D', 4))).toBeNull();
  });

  it('lento: 2 min de más y un 50 % más de lo previsto', () => {
    expect(stretch(report('B', 0), report('D', 7))).toMatchObject({
      fromIndex: 1,
      toIndex: 3,
      level: 'slow',
      extraMinutes: 3,
    });
  });

  it('atasco: 5 min de más y el doble de lo previsto', () => {
    expect(stretch(report('B', 0), report('C', 8))).toMatchObject({
      fromIndex: 1,
      toIndex: 2,
      level: 'jam',
      extraMinutes: 6,
    });
  });

  it('sin pasar ninguna parada, mide el tramo hasta la siguiente', () => {
    expect(stretch(report('C', 0), report('C', 6))).toMatchObject({
      fromIndex: 2,
      toIndex: 3,
      level: 'slow',
    });
  });

  it('no mide en la primera parada (puede esperar la hora de salida) ni en la última', () => {
    expect(stretch(report('A', 0), report('A', 10))).toBeNull();
    expect(stretch(report('E', 0), report('E', 10))).toBeNull();
  });

  it('necesita dos datos del mismo viaje separados entre 2 y 20 min', () => {
    expect(stretch(undefined, report('D', 9))).toBeNull();
    expect(stretch(report('B', 0), report('C', 1))).toBeNull();
    expect(stretch(report('B', 0), report('D', 25))).toBeNull();
    expect(stretch(report('B', 0, { directionId: 2 }), report('D', 9))).toBeNull();
    expect(stretch(report('B', 0, { dateKey: '20261014' }), report('D', 9))).toBeNull();
  });
});
