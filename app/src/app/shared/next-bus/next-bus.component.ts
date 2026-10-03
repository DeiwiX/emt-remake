import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IonIcon } from '@ionic/angular';

import { ScheduleClockService } from '../../core/schedule/schedule-clock.service';
import { dateKeyOf, dayOffsetOf, formatClock } from '../../core/schedule/schedule';

/** Hasta este margen se muestra la hora de hoy (o de esta madrugada); después, el día. */
const SOON_MINUTES = 12 * 60;

/**
 * "Próximo bus según horario: 18:12 (en 4 min) · después 18:27". Siempre se
 * indica que es horario programado: el tiempo real llegará en la Fase 3.
 */
@Component({
  selector: 'app-next-bus',
  imports: [TranslocoPipe, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.9rem;
      color: var(--ion-color-step-600, var(--ion-text-color-step-400, #666));
    }
  `,
  template: `
    <ion-icon name="time-outline" aria-hidden="true" />
    <span>
      @switch (view().kind) {
        @case ('loading') {
          {{ 'nextBus.loading' | transloco }}
        }
        @case ('unavailable') {
          {{ 'nextBus.unavailable' | transloco }}
        }
        @case ('soon') {
          {{ 'nextBus.next' | transloco: { time: view().time, minutes: view().minutes } }}
          @if (view().then) {
            · {{ 'nextBus.then' | transloco: { time: view().then } }}
          }
        }
        @case ('later') {
          {{ 'nextBus.nextAt' | transloco: { time: view().time } }}
          @if (view().then) {
            · {{ 'nextBus.then' | transloco: { time: view().then } }}
          }
        }
        @case ('otherDay') {
          {{ 'nextBus.otherDay' | transloco: { day: view().day, time: view().time } }}
        }
      }
    </span>
  `,
})
export class NextBusComponent {
  private readonly schedule = inject(ScheduleClockService);
  private readonly transloco = inject(TranslocoService);

  readonly lineId = input.required<string>();
  readonly directionId = input.required<number>();
  readonly stopId = input.required<string>();

  constructor() {
    void this.schedule.load();
  }

  protected readonly view = computed(() => {
    const result = this.schedule.nextBuses(this.lineId(), this.directionId(), this.stopId());
    if (result.state !== 'ready')
      return { kind: result.state, time: '', minutes: 0, then: '', day: '' };
    const [first, second] = result.times;
    const wait = Math.round(first! - result.clock.minutes);
    // En las próximas horas (también pasada la medianoche) se da la hora y lo que falta.
    if (wait < SOON_MINUTES) {
      return {
        kind: wait < 60 ? ('soon' as const) : ('later' as const),
        time: formatClock(first!),
        minutes: Math.max(0, wait),
        then: second !== undefined && second - first! < SOON_MINUTES ? formatClock(second) : '',
        day: '',
      };
    }
    return {
      kind: 'otherDay' as const,
      time: formatClock(first!),
      minutes: 0,
      then: '',
      day: this.weekday(dateKeyOf(result.clock.dateKey, first!), dayOffsetOf(first!)),
    };
  });

  private weekday(dateKey: string, offset: number): string {
    if (offset === 1) return this.transloco.translate('nextBus.tomorrow');
    const date = new Date(
      Date.UTC(
        Number(dateKey.slice(0, 4)),
        Number(dateKey.slice(4, 6)) - 1,
        Number(dateKey.slice(6, 8)),
      ),
    );
    return new Intl.DateTimeFormat(this.transloco.getActiveLang(), {
      weekday: 'long',
      timeZone: 'UTC',
    }).format(date);
  }
}
