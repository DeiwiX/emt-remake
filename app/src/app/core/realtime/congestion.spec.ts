import { Direction } from '../models/network.model';
import { slowStretch } from './congestion';
import { StopPassage } from './realtime.service';

const direction = {
  id: 1,
  headsign: 'Centro',
  shapeId: 's',
  stopIds: ['A', 'B', 'C', 'D', 'E'],
  minutes: [0, 2, 4, 6, 8],
} as unknown as Direction;
/** Minutos desde la salida en cada parada. */
const profile = [0, 2, 4, 6, 8];
const T0 = 1_792_000_000;

function passage(
  stopId: string,
  minute: number,
  overrides: Partial<StopPassage> = {},
): StopPassage {
  return {
    vehicleId: 'bus',
    lineId: '3',
    directionId: 1,
    stopId,
    at: T0 + minute * 60,
    exact: true,
    ...overrides,
  };
}

const stretch = (passages: StopPassage[], nowMinute = 0) =>
  slowStretch(passages, T0 + nowMinute * 60, direction, profile);

describe('slowStretch', () => {
  it('si va como el horario no hay atasco', () => {
    expect(stretch([passage('B', 0), passage('D', 4)], 4)).toBeNull();
  });

  it('lento: 2 min de más y un 50 % más de lo previsto', () => {
    expect(stretch([passage('B', 0), passage('D', 7)], 7)).toMatchObject({
      fromIndex: 1,
      toIndex: 3,
      level: 'slow',
      extraMinutes: 3,
    });
  });

  it('atasco: 5 min de más y el doble de lo previsto', () => {
    expect(stretch([passage('B', 0), passage('C', 8)], 8)).toMatchObject({
      fromIndex: 1,
      toIndex: 2,
      level: 'jam',
      extraMinutes: 6,
    });
  });

  it('sin pasar la siguiente parada, mide lo que lleva en el tramo', () => {
    expect(stretch([passage('C', 0)], 6)).toMatchObject({
      fromIndex: 2,
      toIndex: 3,
      level: 'slow',
    });
  });

  it('no mide en la primera parada (puede esperar la hora de salida) ni tras la última', () => {
    expect(stretch([passage('A', 0)], 10)).toBeNull();
    expect(stretch([passage('E', 0)], 10)).toBeNull();
  });

  it('necesita pasos vistos al cambiar, del mismo sentido, separados entre 2 y 20 min', () => {
    expect(stretch([passage('D', 0, { exact: false })], 9)).toBeNull();
    expect(stretch([passage('B', 0), passage('C', 1)], 1)).toBeNull();
    expect(stretch([passage('B', 0), passage('D', 25)], 25)).toBeNull();
    expect(stretch([passage('B', 0, { directionId: 2 }), passage('D', 9)], 9)).toBeNull();
    expect(stretch([passage('B', 0, { exact: false }), passage('D', 9)], 9)).toBeNull();
  });
});
