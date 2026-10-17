import { TestBed } from '@angular/core/testing';

import { ScheduleClockService } from '../schedule/schedule-clock.service';
import { LiveFeeds, RealtimeService, RealtimeSource, updatePassages } from './realtime.service';
import { LiveTrip } from './realtime';

/** Fuente falsa: cuenta las descargas. */
class FakeSource extends RealtimeSource {
  readonly available = true;
  calls = 0;
  fetchFeeds(): Promise<LiveFeeds> {
    this.calls++;
    return Promise.resolve({ vehicles: [], trips: [] });
  }
}

/** Descargas: cada 30 s mientras se usa y nada en segundo plano. */
describe('RealtimeService', () => {
  let source: FakeSource;
  let service: RealtimeService;
  let hidden = false;
  const destroy: (() => void)[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    hidden = false;
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() =>
      hidden ? 'hidden' : 'visible',
    );
    source = new FakeSource();
    TestBed.configureTestingModule({
      providers: [
        { provide: RealtimeSource, useValue: source },
        {
          provide: ScheduleClockService,
          useValue: { load: () => Promise.resolve(), timetables: () => null },
        },
      ],
    });
    service = TestBed.inject(RealtimeService);
  });

  afterEach(() => {
    destroy.splice(0).forEach((fn) => fn());
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const watch = () =>
    service.watch({
      onDestroy: (fn) => {
        destroy.push(fn);
        return () => undefined;
      },
    });

  it('pregunta al empezar y luego cada 30 s (la EMT renueva el dato cada minuto)', async () => {
    watch();
    await vi.advanceTimersByTimeAsync(0);
    expect(source.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(source.calls).toBe(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(source.calls).toBe(3);
  });

  it('con la app en segundo plano no descarga y al volver pide al momento', async () => {
    watch();
    await vi.advanceTimersByTimeAsync(0);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(source.calls).toBe(1);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(source.calls).toBe(2);
  });

  it('el botón "Actualizar" descarga siempre', async () => {
    watch();
    await vi.advanceTimersByTimeAsync(0);
    await service.refreshNow();
    expect(source.calls).toBe(2);
  });
});

describe('updatePassages (atascos)', () => {
  const trip = (arrivals: (number | null)[]): LiveTrip => ({
    tripId: 't',
    vehicleId: 'bus',
    lineId: '1',
    directionId: 1,
    stops: ['a', 'b', 'c'],
    arrivals,
    delays: [null, null, null],
    timestamp: 1000,
  });

  it('apunta la parada que deja atrás y solo es exacta si se vio el cambio', () => {
    const first = updatePassages(new Map(), [trip([null, 1100, 1200])], 1000);
    expect(first.get('bus')).toEqual([
      { vehicleId: 'bus', lineId: '1', directionId: 1, stopId: 'a', at: 1000, exact: false },
    ]);
    // Sin cambios, se conserva.
    expect(updatePassages(first, [trip([null, 1100, 1200])], 1060)).toEqual(first);
    const second = updatePassages(first, [trip([null, null, 1200])], 1150);
    expect(second.get('bus')!.map((p) => [p.stopId, p.at, p.exact])).toEqual([
      ['a', 1000, false],
      ['b', 1150, true],
    ]);
  });
});
