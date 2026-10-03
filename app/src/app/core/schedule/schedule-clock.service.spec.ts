import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { NetworkRepository, ScheduleRepository } from '../data/repositories';
import { Line } from '../models/network.model';
import { ScheduleClockService } from './schedule-clock.service';

describe('ScheduleClockService', () => {
  const line: Line = {
    id: '1',
    name: '1',
    notes: '',
    directions: [
      {
        id: 1,
        headsign: '',
        stopIds: ['a', 'b'],
        shapeId: 'g1',
        shapeQuality: 'official',
        minutes: [0, 10],
        timesSource: 'schedule',
      },
    ],
  };

  function setup(failing = false) {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: NetworkRepository,
          useValue: { lines: signal([line]), stops: signal([]), getLine: () => line },
        },
        {
          provide: ScheduleRepository,
          useValue: {
            getTimetables: () =>
              failing
                ? Promise.reject(new Error('sin red'))
                : Promise.resolve({
                    // Todos los días de prueba funciona un servicio con salidas cada hora.
                    services: new Map([['S', new Set(dateKeysAroundNow())]]),
                    departures: new Map([
                      ['1|1', new Map([['S', Array.from({ length: 24 }, (_, h) => h * 60)]])],
                    ]),
                  }),
          },
        },
      ],
    });
    return TestBed.inject(ScheduleClockService);
  }

  it('da los próximos pasos por una parada sumando su desfase', async () => {
    const service = setup();
    expect(service.nextBuses('1', 1, 'b').state).toBe('loading');
    await service.load();
    const result = service.nextBuses('1', 1, 'b');
    expect(result.state).toBe('ready');
    if (result.state === 'ready') {
      // Salidas a en punto: por "b" pasan a y 10.
      expect(result.times.every((t) => t % 60 === 10)).toBe(true);
      expect(result.times[0]).toBeGreaterThanOrEqual(result.clock.minutes);
    }
  });

  it('marca como no disponible una parada que no es de la línea o si falla la descarga', async () => {
    const service = setup(true);
    await service.load();
    expect(service.nextBuses('1', 1, 'b').state).toBe('unavailable');
  });
});

/** Ayer, hoy y mañana en AAAAMMDD (hora de Madrid aproximada con la del sistema). */
function dateKeysAroundNow(): string[] {
  return [-1, 0, 1].map((d) => {
    const date = new Date(Date.now() + d * 86_400_000);
    return date.toISOString().slice(0, 10).replaceAll('-', '');
  });
}
