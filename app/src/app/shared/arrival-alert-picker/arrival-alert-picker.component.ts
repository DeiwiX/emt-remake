import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IonButton, IonIcon } from '@ionic/angular';

import { NetworkRepository } from '../../core/data/repositories';
import { alertOptions } from '../../core/realtime/arrival-alert';
import { AlertTarget, ArrivalAlertService } from '../../core/realtime/arrival-alert.service';
import { estimateArrivals } from '../../core/realtime/realtime';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { ScheduleClockService } from '../../core/schedule/schedule-clock.service';
import {
  addDays,
  dayOffsetOf,
  formatClock,
  madridClock,
  madridInstantOf,
} from '../../core/schedule/schedule';

/** Pasos del horario que se ofrecen (los mismos que se ven en la parada). */
const SCHEDULED_COUNT = 3;
const MINUTE_MS = 60_000;

/** Un paso que se puede elegir para el aviso. */
interface Candidate {
  readonly key: string;
  /** Texto a traducir en la plantilla (así cambia si se cargan o cambian los textos). */
  readonly label: { readonly key: string; readonly params: Record<string, unknown> };
  readonly target: AlertTarget;
}

/**
 * "Avísame": se elige un autobús (uno en tiempo real o un paso del horario,
 * también de mañana) y cuántos minutos antes avisar. Solo en la app del móvil.
 */
@Component({
  selector: 'app-arrival-alert-picker',
  imports: [TranslocoPipe, IonButton, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
    .alert {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      margin-top: 6px;
      color: var(--ion-text-color);
    }
    ion-button {
      margin: 0;
    }
    .question {
      width: 100%;
    }
  `,
  template: `
    @if (alerts.available()) {
      @if (activeAlert(); as alert) {
        <div class="alert" role="status">
          <ion-icon name="notifications" aria-hidden="true" />
          @if (activeText(); as text) {
            <span
              >{{ text.key | transloco: text.params }}
              @if (text.adjusted) {
                {{ 'alert.adjusted' | transloco }}
              }
            </span>
          }
          <ion-button size="small" fill="clear" (click)="alerts.cancel()">{{
            'alert.cancel' | transloco
          }}</ion-button>
        </div>
      } @else if (step() === 'bus') {
        <div class="alert" role="group" [attr.aria-labelledby]="labelId('bus')">
          <span class="question" [id]="labelId('bus')">{{ 'alert.chooseBus' | transloco }}</span>
          @for (candidate of candidates(); track candidate.key) {
            <ion-button size="small" fill="outline" (click)="pick(candidate.target)">{{
              candidate.label.key | transloco: candidate.label.params
            }}</ion-button>
          }
          <ion-button size="small" fill="clear" (click)="reset()">{{
            'alert.close' | transloco
          }}</ion-button>
        </div>
      } @else if (step() === 'minutes') {
        <div class="alert" role="group" [attr.aria-labelledby]="labelId('minutes')">
          <span class="question" [id]="labelId('minutes')">{{
            'alert.chooseMinutes' | transloco
          }}</span>
          @for (minutes of options(); track minutes) {
            <ion-button
              size="small"
              fill="outline"
              [attr.aria-label]="'alert.option' | transloco: { minutes }"
              (click)="start(minutes)"
              >{{ minutes }}</ion-button
            >
          }
          <ion-button size="small" fill="clear" (click)="reset()">{{
            'alert.close' | transloco
          }}</ion-button>
        </div>
      } @else if (candidates().length > 0) {
        <div class="alert">
          <ion-button size="small" fill="clear" (click)="step.set('bus')">
            <ion-icon slot="start" name="notifications-outline" aria-hidden="true" />
            {{ 'alert.notifyMe' | transloco }}
          </ion-button>
        </div>
      }
      @if (denied()) {
        <small role="alert">{{ 'alert.denied' | transloco }}</small>
      }
    }
  `,
})
export class ArrivalAlertPickerComponent {
  protected readonly alerts = inject(ArrivalAlertService);
  private readonly schedule = inject(ScheduleClockService);
  private readonly realtime = inject(RealtimeService);
  private readonly network = inject(NetworkRepository);
  private readonly transloco = inject(TranslocoService);

  readonly lineId = input.required<string>();
  readonly directionId = input.required<number>();
  readonly stopId = input.required<string>();

  protected readonly step = signal<'idle' | 'bus' | 'minutes'>('idle');
  private readonly target = signal<AlertTarget | null>(null);
  protected readonly denied = signal(false);

  /** El aviso activo, si es de esta línea, sentido y parada. */
  protected readonly activeAlert = computed(() => {
    const alert = this.alerts.alert();
    return alert &&
      alert.stopId === this.stopId() &&
      alert.lineId === this.lineId() &&
      alert.directionId === this.directionId()
      ? alert
      : null;
  });

  /** "Te aviso 5 min antes del bus de las 07:21 (mañana)". */
  protected readonly activeText = computed(() => {
    const alert = this.activeAlert();
    if (!alert) return null;
    const at = madridClock(new Date(alert.expectedAt));
    const today = this.schedule.clock().dateKey;
    const key =
      at.dateKey === today
        ? 'alert.activeToday'
        : at.dateKey === addDays(today, 1)
          ? 'alert.activeTomorrow'
          : 'alert.activeLater';
    return {
      key,
      params: {
        minutes: alert.minutes,
        time: formatClock(at.minutes),
        day: this.weekday(at.dateKey),
      },
      adjusted: alert.vehicleId !== null,
    };
  });

  /** Autobuses en tiempo real camino de la parada y los próximos pasos del horario. */
  protected readonly candidates = computed((): readonly Candidate[] => {
    const now = Date.now();
    const base = { stopId: this.stopId(), lineId: this.lineId(), directionId: this.directionId() };
    const direction = this.network
      .getLine(this.lineId())
      ?.directions.find((d) => d.id === this.directionId());
    const live = direction
      ? estimateArrivals(
          this.realtime.vehicles(),
          this.lineId(),
          direction,
          direction.stopIds.indexOf(this.stopId()),
          this.realtime.now(),
        ).map((a) => ({
          key: `v${a.vehicleId}`,
          label: { key: 'alert.liveOption', params: { minutes: a.minutes } },
          target: { ...base, at: now + a.minutes * MINUTE_MS, vehicleId: a.vehicleId },
        }))
      : [];
    const result = this.schedule.nextBuses(
      this.lineId(),
      this.directionId(),
      this.stopId(),
      SCHEDULED_COUNT,
    );
    const scheduled =
      result.state === 'ready'
        ? result.times.map((minutes) => ({
            key: `s${minutes}`,
            label: this.scheduledLabel(minutes, result.clock.dateKey),
            target: {
              ...base,
              at: madridInstantOf(result.clock.dateKey, minutes),
              vehicleId: null,
            },
          }))
        : [];
    return [...live, ...scheduled].filter((c) => alertOptions(c.target.at, now).length > 0);
  });

  protected readonly options = computed(() => {
    const target = this.target();
    return target ? alertOptions(target.at, Date.now()) : [];
  });

  protected labelId(step: string): string {
    return `alert-${step}-${this.stopId()}-${this.lineId()}-${this.directionId()}`;
  }

  protected pick(target: AlertTarget): void {
    this.target.set(target);
    this.step.set('minutes');
  }

  protected reset(): void {
    this.target.set(null);
    this.step.set('idle');
  }

  protected async start(minutes: number): Promise<void> {
    const target = this.target();
    if (!target) return;
    const started = await this.alerts.start(target, minutes);
    this.denied.set(!started);
    this.reset();
  }

  /** "21:24", "mañana 07:21" o "lun 07:21". */
  private scheduledLabel(minutes: number, referenceDateKey: string): Candidate['label'] {
    const time = formatClock(minutes);
    const offset = dayOffsetOf(minutes);
    if (offset <= 0) return { key: 'alert.todayAt', params: { time } };
    if (offset === 1) return { key: 'alert.tomorrowAt', params: { time } };
    return {
      key: 'alert.dayAt',
      params: { day: this.weekday(addDays(referenceDateKey, offset)), time },
    };
  }

  private weekday(dateKey: string): string {
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
