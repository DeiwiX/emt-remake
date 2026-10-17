import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';

import { NetworkRepository, ScheduleRepository, ShapeRepository } from '../data/repositories';
import { Line } from '../models/network.model';
import { ArrivalAlertService } from './arrival-alert.service';
import { ArrivalNotifier } from './arrival-notifier';
import { RealtimeSource } from './realtime.service';
import { FeedTripUpdate, LiveIndex } from './realtime';

const MIN = 60_000;
const line: Line = {
  id: '1',
  name: '1',
  notes: '',
  directions: [
    {
      id: 1,
      headsign: 'Centro',
      stopIds: ['a', 'b', 'c'],
      shapeId: 'g1',
      shapeQuality: 'official',
      minutes: [0, 4, 10],
    },
  ],
};

/** Recorridos del tiempo real: el viaje 1 del bloque 001-01 hace a → b → c. */
const live: LiveIndex = {
  patterns: [{ lineId: '1', directionId: 1, stops: ['a', 'b', 'c'], minutes: [0, 4, 10] }],
  trips: new Map([['G1L', new Map([['001-01', [0]]])]]),
};

/** El autobús 7 llega a "c" dentro de `minutes` minutos, según la EMT. */
const feed = (minutes: number): FeedTripUpdate[] => [
  {
    tripId: 'G1L_F1_001-01_1',
    vehicleId: '7',
    start: null,
    timestamp: Date.now() / 1000,
    stops: [{ sequence: 3, time: Date.now() / 1000 + minutes * 60, skipped: false }],
  },
];

describe('ArrivalAlertService', () => {
  let trips: FeedTripUpdate[];
  const notifier = {
    available: true,
    requestPermission: vi.fn(() => Promise.resolve(true)),
    schedule: vi.fn((at: Date) => Promise.resolve(void at)),
    showNow: vi.fn(() => Promise.resolve()),
    cancel: vi.fn(() => Promise.resolve()),
  };

  function setup() {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: NetworkRepository,
          useValue: { lines: signal([line]), getLine: () => line, getStop: () => undefined },
        },
        {
          provide: RealtimeSource,
          useValue: {
            available: true,
            fetchFeeds: () => Promise.resolve({ vehicles: [], trips }),
          },
        },
        { provide: ArrivalNotifier, useValue: notifier },
        { provide: ShapeRepository, useValue: { getShapes: () => Promise.resolve(new Map()) } },
        // Horario vacío, con los recorridos para leer el tiempo real.
        {
          provide: ScheduleRepository,
          useValue: {
            getTimetables: () =>
              Promise.resolve({ services: new Map(), departures: new Map(), live }),
          },
        },
        { provide: TranslocoService, useValue: { translate: (key: string) => key } },
      ],
    });
    return TestBed.inject(ArrivalAlertService);
  }

  async function flush() {
    await vi.advanceTimersByTimeAsync(0);
    TestBed.tick();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T13:47:00Z'));
    trips = [];
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => vi.useRealTimers());

  const target = (at: number) => ({
    stopId: 'c',
    lineId: '1',
    directionId: 1,
    at,
    tripId: null,
  });

  it('programa un aviso del horario para mañana sin autobuses ahora y lo guarda', async () => {
    const service = setup();
    const tomorrow = Date.now() + 15 * 60 * MIN;
    expect(await service.start(target(tomorrow), 10)).toBe(true);
    await flush();
    expect(notifier.schedule.mock.calls[0]![0].getTime()).toBe(tomorrow - 10 * MIN);
    expect(service.alert()?.scheduledAt).toBe(tomorrow);
    expect(JSON.parse(localStorage.getItem('emt-remake.arrival-alert.v2')!).notifyAt).toBe(
      tomorrow - 10 * MIN,
    );
  });

  it('mueve el aviso cuando el tiempo real dice que el autobús llega más tarde', async () => {
    trips = feed(8);
    const service = setup();
    // Según el horario pasaba dentro de 4 min; avisar 2 min antes.
    await service.start(target(Date.now() + 4 * MIN), 2);
    await flush();
    expect(service.alert()?.tripId).toBe('G1L_F1_001-01_1');
    expect(service.alert()?.notifyAt).toBe(Date.now() + 6 * MIN);
    expect(notifier.schedule.mock.calls.at(-1)![0].getTime()).toBe(Date.now() + 6 * MIN);
  });

  it('recupera el aviso guardado al abrir la app', () => {
    const at = Date.now() + 60 * MIN;
    localStorage.setItem(
      'emt-remake.arrival-alert.v2',
      JSON.stringify({
        ...target(at),
        minutes: 5,
        scheduledAt: at,
        expectedAt: at,
        notifyAt: at - 5 * MIN,
      }),
    );
    expect(setup().alert()?.expectedAt).toBe(at);
  });

  it('quitar el aviso anula la notificación y lo borra', async () => {
    const service = setup();
    await service.start(target(Date.now() + 60 * MIN), 5);
    service.cancel();
    expect(notifier.cancel).toHaveBeenCalled();
    expect(service.alert()).toBeNull();
    expect(localStorage.getItem('emt-remake.arrival-alert.v2')).toBeNull();
  });
});
