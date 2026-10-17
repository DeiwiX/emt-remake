import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';

import es from '../../../../public/i18n/es.json';
import { NetworkRepository } from '../../core/data/repositories';
import { Line } from '../../core/models/network.model';
import { ArrivalAlertService } from '../../core/realtime/arrival-alert.service';
import { ArrivalContextService } from '../../core/realtime/arrival-context.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { formatClock, madridClock } from '../../core/schedule/schedule';
import { ScheduleClockService } from '../../core/schedule/schedule-clock.service';
import { NextBusComponent } from './next-bus.component';

const line: Line = {
  id: '3',
  name: '3',
  notes: '',
  directions: [
    {
      id: 1,
      headsign: 'El Palo',
      stopIds: ['a', 'b'],
      shapeId: 's',
      shapeQuality: 'official',
      minutes: [0, 5],
      timesSource: 'schedule',
    },
  ],
};

/** "Avísame" eligiendo cualquiera de los próximos buses (16/10/2026). */
describe('Próximos buses y "Avísame"', () => {
  const clock = madridClock(new Date());
  // Pasos cada 15 min a partir de dentro de media hora (todos admiten aviso).
  const times = Array.from({ length: 12 }, (_, i) => clock.minutes + 30 + i * 15);

  function render() {
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: { es },
          preloadLangs: true,
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        {
          provide: ScheduleClockService,
          useValue: {
            load: () => Promise.resolve(),
            clock: signal(clock),
            nextBuses: (_l: string, _d: number, _s: string, count = 2) => ({
              state: 'ready',
              times: times.slice(0, count),
              // El primero, corregido con 3 min de retraso habitual (Fase 10).
              delays: times.slice(0, count).map((_, i) => (i === 0 ? 3 : 0)),
              clock,
            }),
          },
        },
        {
          provide: RealtimeService,
          useValue: { watch: () => undefined, vehicles: signal([]), now: signal(clock) },
        },
        { provide: ArrivalContextService, useValue: { context: signal({}) } },
        {
          provide: NetworkRepository,
          useValue: { getLine: () => line, getStop: () => undefined },
        },
        {
          provide: ArrivalAlertService,
          useValue: { available: () => true, alert: signal(null), start: vi.fn() },
        },
      ],
    });
    const fixture = TestBed.createComponent(NextBusComponent);
    fixture.componentRef.setInput('lineId', '3');
    fixture.componentRef.setInput('directionId', 1);
    fixture.componentRef.setInput('stopId', 'b');
    fixture.detectChanges();
    return fixture;
  }

  it('cada hora se puede tocar: elige ese bus y lo marca', async () => {
    const fixture = render();
    await fixture.whenStable();
    const pills = fixture.nativeElement.querySelectorAll('button.passing');
    expect(pills.length).toBe(3);
    pills[1].click();
    fixture.detectChanges();
    await fixture.whenStable();
    const question = fixture.nativeElement.querySelector('app-arrival-alert-picker .question');
    expect(question.textContent).toContain(formatClock(times[1]!));
    expect(pills[1].classList).toContain('selected');
    expect(pills[0].classList).not.toContain('selected');
  });

  it('dice cuándo una hora va corregida con el retraso habitual', async () => {
    const fixture = render();
    await fixture.whenStable();
    const pills = fixture.nativeElement.querySelectorAll('button.passing');
    expect(pills[0].textContent).toContain('+3 habitual');
    expect(pills[1].textContent).not.toContain('habitual');
    expect(fixture.nativeElement.textContent).toContain('Horario con el retraso habitual');
  });

  it('"Más horarios" ofrece hasta 12 pasos del horario', async () => {
    const fixture = render();
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    const buttons = () => [...element.querySelectorAll('app-arrival-alert-picker ion-button')];
    (buttons()[0] as HTMLElement).click(); // "Avísame"
    fixture.detectChanges();
    // 3 pasos, "Más horarios" y "Cancelar".
    expect(buttons().length).toBe(5);
    (buttons().find((b) => b.textContent?.includes('Más horarios')) as HTMLElement).click();
    fixture.detectChanges();
    // 12 pasos y "Cancelar".
    expect(buttons().length).toBe(13);
  });
});
