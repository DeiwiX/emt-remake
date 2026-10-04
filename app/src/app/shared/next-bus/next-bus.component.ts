import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IonIcon } from '@ionic/angular';

import { ScheduleClockService } from '../../core/schedule/schedule-clock.service';
import { dateKeyOf, dayOffsetOf, formatClock } from '../../core/schedule/schedule';

/** Cuántos pasos se muestran: el próximo y los dos siguientes. */
const COUNT = 3;
/** Por debajo de una hora se destaca lo que falta ("4 min"); por encima, la hora. */
const COUNTDOWN_MINUTES = 60;
/** Hasta este margen basta la hora; después se indica el día. */
const SAME_DAY_MINUTES = 12 * 60;

/** Un paso del bus: lo grande, lo pequeño y la frase para lectores de pantalla. */
interface Passing {
  readonly main: string;
  readonly sub: string;
  readonly spoken: string;
}

/**
 * Próximos buses de una línea por una parada, de un vistazo: tres cápsulas con
 * lo que falta (o la hora, si es tarde) y la hora de paso. Siempre se indica
 * que es horario programado: el tiempo real llegará en la Fase 3.
 */
@Component({
  selector: 'app-next-bus',
  imports: [TranslocoPipe, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      margin-top: 4px;
      font-size: 0.9rem;
      color: var(--ion-color-step-600, var(--ion-text-color-step-400, #666));
    }
    .status {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .passings {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .passing {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 4.25rem;
      padding: 4px 10px;
      border-radius: 10px;
      border: 1px solid var(--ion-color-step-250, #c8c8c8);
      color: var(--ion-text-color);
      line-height: 1.15;
    }
    .passing:first-child {
      border-color: var(--ion-color-primary);
      background: var(--ion-color-primary);
      color: var(--ion-color-primary-contrast);
    }
    .main {
      font-size: 1.05rem;
      font-weight: 700;
      white-space: nowrap;
    }
    .sub {
      font-size: 0.8rem;
      white-space: nowrap;
    }
    .source {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 4px;
      font-size: 0.8rem;
    }
  `,
  template: `
    @switch (view().kind) {
      @case ('loading') {
        <span class="status">
          <ion-icon name="time-outline" aria-hidden="true" />{{ 'nextBus.loading' | transloco }}
        </span>
      }
      @case ('unavailable') {
        <span class="status">
          <ion-icon name="time-outline" aria-hidden="true" />{{ 'nextBus.unavailable' | transloco }}
        </span>
      }
      @case ('ready') {
        <span class="visually-hidden">{{ spoken() }}</span>
        <ul class="passings" aria-hidden="true">
          @for (passing of view().passings; track $index) {
            <li class="passing">
              <span class="main">{{ passing.main }}</span>
              <span class="sub">{{ passing.sub }}</span>
            </li>
          }
        </ul>
        <span class="source" aria-hidden="true">
          <ion-icon name="time-outline" />{{ 'nextBus.scheduled' | transloco }}
        </span>
      }
    }
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
    const result = this.schedule.nextBuses(this.lineId(), this.directionId(), this.stopId(), COUNT);
    if (result.state !== 'ready') return { kind: result.state, passings: [] as Passing[] };
    const now = result.clock.minutes;
    return {
      kind: 'ready' as const,
      passings: result.times.map((minutes) =>
        this.passing(minutes, now, dateKeyOf(result.clock.dateKey, minutes)),
      ),
    };
  });

  /** "Próximos buses según horario: 18:12, en 4 min; 18:27, en 19 min…" */
  protected readonly spoken = computed(() =>
    this.transloco.translate('nextBus.spoken', {
      list: this.view()
        .passings.map((p) => p.spoken)
        .join('; '),
    }),
  );

  private passing(minutes: number, now: number, dateKey: string): Passing {
    const time = formatClock(minutes);
    const wait = Math.max(0, Math.round(minutes - now));
    if (wait < COUNTDOWN_MINUTES) {
      const main =
        wait === 0
          ? this.transloco.translate('nextBus.now')
          : this.transloco.translate('nextBus.inMinutes', { minutes: wait });
      return { main, sub: time, spoken: `${time}, ${main}` };
    }
    if (wait < SAME_DAY_MINUTES) {
      const sub = this.transloco.translate('nextBus.inHours', {
        hours: Math.floor(wait / 60),
        minutes: wait % 60,
      });
      return { main: time, sub, spoken: `${time}, ${sub}` };
    }
    const day = this.weekday(dateKey, dayOffsetOf(minutes));
    return { main: time, sub: day, spoken: `${day} ${time}` };
  }

  private weekday(dateKey: string, offset: number): string {
    if (offset <= 0) return this.transloco.translate('nextBus.today');
    if (offset === 1) return this.transloco.translate('nextBus.tomorrow');
    const date = new Date(
      Date.UTC(
        Number(dateKey.slice(0, 4)),
        Number(dateKey.slice(4, 6)) - 1,
        Number(dateKey.slice(6, 8)),
      ),
    );
    return new Intl.DateTimeFormat(this.transloco.getActiveLang(), {
      weekday: 'short',
      timeZone: 'UTC',
    }).format(date);
  }
}
