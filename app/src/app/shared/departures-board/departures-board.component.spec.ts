import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';

import es from '../../../../public/i18n/es.json';
import { NetworkRepository } from '../../core/data/repositories';
import { Line, Stop } from '../../core/models/network.model';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { ScheduleClockService } from '../../core/schedule/schedule-clock.service';
import { DeparturesBoardComponent } from './departures-board.component';

const line = (id: string, headsign: string): Line => ({
  id,
  name: id,
  notes: '',
  directions: [
    {
      id: 1,
      headsign,
      stopIds: ['s'],
      shapeId: id,
      shapeQuality: 'official',
      minutes: [0],
      timesSource: 'schedule',
    },
  ],
});

describe('Panel de salidas', () => {
  it('junta las líneas y las ordena por la que pasa antes', () => {
    const lines = { '3': line('3', 'El Palo'), '11': line('11', 'Universidad') };
    const times: Record<string, number[]> = { '3': [610, 640], '11': [605, 700] };
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: { es },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        {
          provide: ScheduleClockService,
          useValue: {
            load: () => Promise.resolve(),
            timetables: signal({}),
            clock: signal({ dateKey: '20261017', minutes: 600 }),
            nextBuses: (lineId: string) => ({
              state: 'ready',
              times: times[lineId],
              clock: { dateKey: '20261017', minutes: 600 },
            }),
          },
        },
        {
          provide: RealtimeService,
          useValue: { watch: () => undefined, arrivals: () => [] },
        },
        {
          provide: NetworkRepository,
          useValue: {
            lines: signal(Object.values(lines)),
            getLine: (id: string) => lines[id as keyof typeof lines],
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(DeparturesBoardComponent);
    fixture.componentRef.setInput('stop', {
      id: 's',
      name: 'Parada',
      lat: 0,
      lon: 0,
      services: [
        { lineId: '3', directionId: 1 },
        { lineId: '11', directionId: 1 },
      ],
    } as unknown as Stop);
    fixture.detectChanges();
    const rows = [...fixture.nativeElement.querySelectorAll('li')].map((li: HTMLElement) =>
      li.textContent!.replace(/\s+/g, ' ').trim(),
    );
    expect(rows).toEqual([
      expect.stringContaining('Universidad 5 min 10:05'),
      expect.stringContaining('El Palo 10 min 10:10'),
      expect.stringContaining('El Palo 40 min 10:40'),
      expect.stringContaining('Universidad 11:40'),
    ]);
  });
});
