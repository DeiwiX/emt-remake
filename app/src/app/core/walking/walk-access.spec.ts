import { JourneyOption, Leg } from '../planner/planner';
import { withStreetTransfers } from './walk-access';

const leg = (from: string, to: string): Leg => ({
  lineId: from,
  directionId: 1,
  headsign: '',
  fromStopId: from,
  toStopId: to,
  stopCount: 1,
  minutes: 5,
  estimated: false,
});

describe('withStreetTransfers', () => {
  const option: JourneyOption = {
    legs: [leg('a', 'b'), leg('b2', 'c'), leg('c', 'd')],
    accessMinutes: 0,
    egressMinutes: 0,
    totalMinutes: 30,
    transferWalks: [2, 0],
  };

  it('cambia los minutos del transbordo a pie por los de la calle y ajusta el total', () => {
    const refined = withStreetTransfers(option, (from, to) =>
      from === 'b' && to === 'b2' ? 4 : null,
    );
    expect(refined.transferWalks).toEqual([4, 0]);
    expect(refined.totalMinutes).toBe(32);
  });

  it('sin camino por la calle deja la estimación', () => {
    expect(withStreetTransfers(option, () => null)).toBe(option);
  });
});
