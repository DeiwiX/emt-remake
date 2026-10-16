import { JourneyOption } from './planner';
import { TimedJourney, withinReach } from './scheduled-journey';

function timed(leaveAt: number, arrival: number): TimedJourney {
  return {
    option: { legs: [] } as unknown as JourneyOption,
    legs: [],
    leaveAt,
    departure: leaveAt,
    arrival,
  };
}

describe('withinReach', () => {
  it('saliendo: quita las que llegan más de 90 min después que la mejor', () => {
    const best = timed(400, 420);
    const close = timed(410, 500);
    const overnight = timed(1386, 1991);
    expect(withinReach([best, close, overnight], 'depart')).toEqual([best, close]);
  });

  it('llegando a una hora: quita las que salen más de 90 min antes que la mejor', () => {
    const best = timed(500, 540);
    const early = timed(380, 530);
    expect(withinReach([best, early], 'arrive')).toEqual([best]);
  });

  it('sin opciones, nada', () => {
    expect(withinReach([], 'depart')).toEqual([]);
  });
});
