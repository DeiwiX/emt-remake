import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';

import { NetworkRepository } from '../data/repositories';
import { Line } from '../models/network.model';
import { ArrivalAlertService } from './arrival-alert.service';
import { ArrivalNotifier } from './arrival-notifier';
import { RealtimeSource } from './realtime.service';

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
    schedule: vi.fn(() => Promise.resolve()),
    showNow: vi.fn(() => Promise.resolve()),
    cancel: vi.fn(() => Promise.resolve()),
  };

  async function setup() {
    TestBed.configureTestingModule({
      providers: [
        { provide: NetworkRepository, useValue: { getLine: () => line, getStop: () => undefined } },
        {
          provide: RealtimeSource,
          useValue: { available: true, fetchVehicles: () => Promise.resolve(records) },
        },
        { provide: ArrivalNotifier, useValue: notifier },
        { provide: TranslocoService, useValue: { translate: (key: string) => key } },
      ],
    });
    const service = TestBed.inject(ArrivalAlertService);
    await service.start({ stopId: 'c', lineId: '1', directionId: 1, vehicleId: '7', minutes: 5 });
    await vi.advanceTimersByTimeAsync(0);
    TestBed.tick();
    return service;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    // 15:47 en Madrid (horario de verano): el dato tiene 2 minutos.
    vi.setSystemTime(new Date('2026-10-04T13:47:00Z'));
    records = feed('a');
    vi.clearAllMocks();
  });

  afterEach(() => vi.useRealTimers());

  it('programa el aviso para cuando falten los minutos elegidos', async () => {
    const service = await setup();
    // A "c" le faltan 10 − 0 − 2 = 8 min: avisar dentro de 3.
    expect(notifier.schedule).toHaveBeenCalledTimes(1);
    const [at] = notifier.schedule.mock.calls[0] as unknown as [Date];
    expect(at.getTime()).toBe(Date.now() + 3 * 60_000);
    expect(service.alert()?.minutes).toBe(5);
  });

  it('avisa ya cuando un dato nuevo lo acerca lo suficiente y quita el aviso', async () => {
    const service = await setup();
    records = feed('b'); // 10 − 4 − 2 = 4 min.
    await vi.advanceTimersByTimeAsync(60_000);
    TestBed.tick();
    expect(notifier.showNow).toHaveBeenCalledTimes(1);
    expect(service.alert()).toBeNull();
  });

  it('cancela el aviso si el autobús ya no viene', async () => {
    const service = await setup();
    records = [];
    await vi.advanceTimersByTimeAsync(60_000);
    TestBed.tick();
    expect(notifier.cancel).toHaveBeenCalled();
    expect(service.alert()).toBeNull();
  });
});
