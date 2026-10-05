import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';

import { NetworkRepository, ScheduleRepository } from '../data/repositories';
import { Line } from '../models/network.model';
import { ArrivalAlertService } from './arrival-alert.service';
import { ArrivalNotifier } from './arrival-notifier';
import { RealtimeSource } from './realtime.service';

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

/** Autobús 7 de la línea 1 que pasó por `stop` a las 15:45 (hora de Madrid). */
const feed = (stop: string) => [
  {
    codBus: '7',
    codLinea: '1.0',
    sentido: '1',
    codParIni: stop,
    geometry: { type: 'Point', coordinates: ['-4.45', '36.7'] },
    properties: { last_update: '2026-10-04 15:45:00' },
  },
];

describe('ArrivalAlertService', () => {
  let records: unknown[];
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
          useValue: { available: true, fetchVehicles: () => Promise.resolve(records) },
        },
        { provide: ArrivalNotifier, useValue: notifier },
        // Sin horario: el aviso se ajusta solo con los minutos típicos.
        {
          provide: ScheduleRepository,
          useValue: { getTimetables: () => new Promise(() => undefined) },
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
    // 15:47 en Madrid (horario de verano): el dato tiene 2 minutos.
    vi.setSystemTime(new Date('2026-10-04T13:47:00Z'));
    records = [];
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => vi.useRealTimers());

  const target = (at: number) => ({
    stopId: 'c',
    lineId: '1',
    directionId: 1,
    at,
    vehicleId: null,
  });

  it('programa un aviso del horario para mañana sin autobuses ahora y lo guarda', async () => {
    const service = setup();
    const tomorrow = Date.now() + 15 * 60 * MIN;
    expect(await service.start(target(tomorrow), 10)).toBe(true);
    await flush();
    expect(notifier.schedule.mock.calls[0]![0].getTime()).toBe(tomorrow - 10 * MIN);
    expect(service.alert()?.scheduledAt).toBe(tomorrow);
    expect(JSON.parse(localStorage.getItem('emt-remake.arrival-alert.v1')!).notifyAt).toBe(
      tomorrow - 10 * MIN,
    );
  });

  it('mueve el aviso cuando el tiempo real dice que el autobús llega más tarde', async () => {
    records = feed('a'); // A "c" le faltan 10 − 0 − 2 = 8 min.
    const service = setup();
    // Según el horario pasaba dentro de 4 min; avisar 2 min antes.
    await service.start(target(Date.now() + 4 * MIN), 2);
    await flush();
    expect(service.alert()?.vehicleId).toBe('7');
    expect(service.alert()?.notifyAt).toBe(Date.now() + 6 * MIN);
    expect(notifier.schedule.mock.calls.at(-1)![0].getTime()).toBe(Date.now() + 6 * MIN);
  });

  it('recupera el aviso guardado al abrir la app', () => {
    const at = Date.now() + 60 * MIN;
    localStorage.setItem(
      'emt-remake.arrival-alert.v1',
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
    expect(localStorage.getItem('emt-remake.arrival-alert.v1')).toBeNull();
  });
});
