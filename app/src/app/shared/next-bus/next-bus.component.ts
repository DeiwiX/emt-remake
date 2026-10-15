import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IonIcon } from '@ionic/angular';

import { NetworkRepository } from '../../core/data/repositories';
import { estimateArrivals } from '../../core/realtime/realtime';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { ArrivalContextService } from '../../core/realtime/arrival-context.service';
import { ScheduleClockService } from '../../core/schedule/schedule-clock.service';
import { dateKeyOf, dayOffsetOf, formatClock } from '../../core/schedule/schedule';
import { ArrivalAlertPickerComponent } from '../arrival-alert-picker/arrival-alert-picker.component';

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
  /** true si es una llegada estimada en tiempo real (si no, del horario). */
  readonly live?: boolean;
  /** Clave del paso para el aviso: "v<autobús>" (tiempo real) o "s<minutos>" (horario). */
  readonly key: string;
}

/**
 * Próximos buses de una línea por una parada, de un vistazo: tres cápsulas con
 * lo que falta (o la hora, si es tarde) y la hora de paso. Las primeras, si las
 * hay, son llegadas en tiempo real (con un punto verde); el resto, del horario.
 * Debajo se dice de dónde sale cada una.
 */
@Component({
  selector: 'app-next-bus',
  imports: [TranslocoPipe, IonIcon, ArrivalAlertPickerComponent],
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
    /* Con "Avísame" disponible cada cápsula es un botón: al tocarla se elige ese bus. */
    button.passing {
      min-height: 44px;
      background: transparent;
      font: inherit;
      cursor: pointer;
    }
    button.passing:focus-visible {
      outline: 3px solid var(--ion-color-primary);
      outline-offset: 2px;
    }
    /* El bus elegido para el aviso, en coral: se ve cuál se ha elegido. */
    .passings .passing.passing.selected {
      border-color: var(--app-accent);
      background: var(--app-accent);
      color: #fff;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-accent) 30%, transparent);
    }
    :host-context(.ion-palette-dark) .passings .passing.passing.selected {
      color: #1c2b4a;
    }
    .passings .passing.passing.selected .live-dot {
      background: currentColor;
      box-shadow: none;
    }
    .bell {
      font-size: 0.75rem;
      opacity: 0.8;
    }
    li.passing:first-child,
    li:first-child > .passing {
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
    .passing.live {
      border-color: #1e8e3e;
    }
    li.passing.live:first-child,
    li:first-child > .passing.live {
      background: #17703a;
      border-color: #17703a;
      color: #fff;
    }
    .live-dot {
      display: inline-block;
      flex: none;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #1e8e3e;
      box-shadow: 0 0 0 3px rgba(30, 142, 62, 0.2);
    }
    li.passing.live:first-child .live-dot,
    li:first-child > .passing.live .live-dot {
      background: #fff;
      box-shadow: none;
    }
    .main {
      display: inline-flex;
      align-items: center;
      gap: 5px;
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
        @if (view().passings.length === 0) {
          <span class="status">
            <ion-icon name="time-outline" aria-hidden="true" />{{
              'nextBus.unavailable' | transloco
            }}
          </span>
        }
      }
    }
    @if (view().passings.length > 0) {
      <span class="visually-hidden" role="status">{{ spoken() }}</span>
      <ul class="passings" [attr.aria-hidden]="selectable().size === 0 ? 'true' : null">
        @for (passing of view().passings; track $index) {
          @if (selectable().has(passing.key)) {
            <!-- Tocar una hora abre el aviso para ese bus (no solo para el primero). -->
            <li>
              <button
                type="button"
                class="passing"
                [class.live]="passing.live"
                [class.selected]="selected().has(passing.key)"
                [attr.aria-pressed]="selected().has(passing.key)"
                [attr.aria-label]="'alert.notifyForBus' | transloco: { bus: passing.spoken }"
                (click)="picker()?.select(passing.key)"
              >
                <span class="main">
                  @if (passing.live) {
                    <span class="live-dot"></span>
                  }
                  {{ passing.main }}
                </span>
                <span class="sub"
                  >{{ passing.sub }}
                  <ion-icon class="bell" name="notifications-outline" aria-hidden="true"
                /></span>
              </button>
            </li>
          } @else {
            <li
              class="passing"
              [class.live]="passing.live"
              [class.selected]="selected().has(passing.key)"
              aria-hidden="true"
            >
              <span class="main">
                @if (passing.live) {
                  <span class="live-dot"></span>
                }
                {{ passing.main }}
              </span>
              <span class="sub">{{ passing.sub }}</span>
            </li>
          }
        }
      </ul>
      <!-- De dónde sale cada tiempo: tiempo real (y antigüedad del dato) y horario. -->
      <span class="source" aria-hidden="true">
        @if (live(); as live) {
          <span class="live-dot"></span>
          {{ 'realtime.source' | transloco: { age: live.age } }}
          @if (live.delay !== null) {
            · {{ delayText(live.delay) }}
          }
          @if (view().scheduled > 0) {
            · {{ 'nextBus.restScheduled' | transloco }}
          }
        } @else {
          <ion-icon name="time-outline" />{{ 'nextBus.scheduled' | transloco }}
        }
      </span>
    }
    <!-- "Avísame": sobre un bus en tiempo real o del horario (solo en la app del móvil). -->
    <app-arrival-alert-picker
      [lineId]="lineId()"
      [directionId]="directionId()"
      [stopId]="stopId()"
    />
  `,
})
export class NextBusComponent {
  private readonly schedule = inject(ScheduleClockService);
  private readonly transloco = inject(TranslocoService);
  private readonly network = inject(NetworkRepository);
  private readonly realtime = inject(RealtimeService);
  private readonly arrivalContext = inject(ArrivalContextService);

  readonly lineId = input.required<string>();
  readonly directionId = input.required<number>();
  readonly stopId = input.required<string>();

  protected readonly picker = viewChild(ArrivalAlertPickerComponent);
  /** Pasos que se pueden tocar para "Avísame" (solo en la app del móvil y sin aviso en esta línea). */
  protected readonly selectable = computed(
    () => this.picker()?.selectableKeys() ?? new Set<string>(),
  );

  /** Hora del bus elegido para el aviso (o del aviso activo), resaltada. */
  protected readonly selected = computed(() => this.picker()?.selectedKeys() ?? new Set<string>());

  constructor() {
    void this.schedule.load();
    this.realtime.watch();
  }

  /** Llegada estimada con la posición real de los autobuses (null si no hay dato útil). */
  protected readonly live = computed(() => {
    const direction = this.network
      .getLine(this.lineId())
      ?.directions.find((d) => d.id === this.directionId());
    if (!direction) return null;
    const arrivals = estimateArrivals(
      this.realtime.vehicles(),
      this.lineId(),
      direction,
      direction.stopIds.indexOf(this.stopId()),
      this.realtime.now(),
      this.arrivalContext.context(),
    );
    const [first] = arrivals;
    if (!first) return null;
    return {
      arrivals: arrivals.slice(0, COUNT - 1),
      minutes: arrivals.slice(0, COUNT - 1).map((a) => a.minutes),
      age: first.ageMinutes,
      delay: first.delayMinutes,
    };
  });

  /** "Va 3 min tarde", "Va en hora" o "Va 2 min adelantado" (frente a su viaje del horario). */
  protected delayText(delay: number): string {
    if (Math.abs(delay) < 2) return this.transloco.translate('realtime.onTime');
    return this.transloco.translate(delay > 0 ? 'realtime.late' : 'realtime.early', {
      minutes: Math.abs(delay),
    });
  }

  /**
   * Cápsulas: primero las llegadas en tiempo real (como mucho dos) y después los
   * pasos del horario que van detrás de ellas (para no contar dos veces el mismo
   * autobús), hasta tres en total.
   */
  protected readonly view = computed(() => {
    const result = this.schedule.nextBuses(
      this.lineId(),
      this.directionId(),
      this.stopId(),
      COUNT + 2,
    );
    const now = this.schedule.clock().minutes;
    const liveMinutes = this.live()?.minutes ?? [];
    const live = (this.live()?.arrivals ?? []).map((a) =>
      this.livePassing(a.minutes, now, a.vehicleId),
    );
    if (result.state !== 'ready') {
      return { kind: result.state, passings: live, scheduled: 0 };
    }
    const after = liveMinutes.length > 0 ? now + liveMinutes.at(-1)! + 2 : -Infinity;
    const scheduled = result.times
      .filter((minutes) => minutes > after)
      .slice(0, COUNT - live.length)
      .map((minutes) =>
        this.passing(minutes, result.clock.minutes, dateKeyOf(result.clock.dateKey, minutes)),
      );
    return {
      kind: 'ready' as const,
      passings: [...live, ...scheduled],
      scheduled: scheduled.length,
    };
  });

  private livePassing(minutes: number, now: number, vehicleId: string): Passing {
    const time = formatClock(now + minutes);
    const main =
      minutes === 0
        ? this.transloco.translate('nextBus.now')
        : this.transloco.translate('realtime.pill', { minutes });
    return {
      main,
      sub: time,
      spoken: `${this.transloco.translate('realtime.liveLabel')}: ${main}`,
      live: true,
      key: `v${vehicleId}`,
    };
  }

  /** "Próximos buses: en tiempo real, en ~4 min; 18:27, en 19 min…" */
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
      return { main, sub: time, spoken: `${time}, ${main}`, key: `s${minutes}` };
    }
    if (wait < SAME_DAY_MINUTES) {
      const sub = this.transloco.translate('nextBus.inHours', {
        hours: Math.floor(wait / 60),
        minutes: wait % 60,
      });
      return { main: time, sub, spoken: `${time}, ${sub}`, key: `s${minutes}` };
    }
    const day = this.weekday(dateKey, dayOffsetOf(minutes));
    return { main: time, sub: day, spoken: `${day} ${time}`, key: `s${minutes}` };
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
