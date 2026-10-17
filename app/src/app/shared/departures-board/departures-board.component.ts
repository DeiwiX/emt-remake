import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { NetworkRepository } from '../../core/data/repositories';
import { Stop } from '../../core/models/network.model';
import { ArrivalContextService } from '../../core/realtime/arrival-context.service';
import { estimateArrivals } from '../../core/realtime/realtime';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { formatClock } from '../../core/schedule/schedule';
import { ScheduleClockService } from '../../core/schedule/schedule-clock.service';
import { LineBadgeComponent } from '../line-badge/line-badge.component';

/** Salidas que se muestran en el panel. */
const COUNT = 8;
/** Pasos del horario que se miran por línea y sentido (los primeros pueden ser los ya vistos en tiempo real). */
const PER_SERVICE = 4;
/** Hasta este margen se dice lo que falta ("4 min"); después, la hora. */
const COUNTDOWN_MINUTES = 60;

/** Una salida del panel. */
interface Departure {
  readonly key: string;
  readonly lineId: string;
  readonly headsign: string;
  /** Minutos que faltan desde ahora. */
  readonly wait: number;
  readonly time: string;
  readonly live: boolean;
}

/**
 * Panel de salidas de una parada (17/10/2026): los próximos autobuses de todas
 * sus líneas juntos, ordenados por el que pasa antes. Los vistos en tiempo
 * real llevan un punto verde; el resto, del horario.
 */
@Component({
  selector: 'app-departures-board',
  imports: [TranslocoPipe, LineBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
    ol {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 48px;
      padding: 6px 0;
      border-top: 1px solid var(--soft, rgba(0, 0, 0, 0.08));
    }
    li:first-child {
      border-top: 0;
    }
    .headsign {
      flex: 1;
      min-width: 0;
      font-size: 0.9rem;
    }
    .when {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      line-height: 1.15;
      white-space: nowrap;
    }
    .main {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 700;
    }
    .sub {
      font-size: 0.8rem;
      color: var(--muted);
    }
    .live-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #1e8e3e;
      box-shadow: 0 0 0 3px rgba(30, 142, 62, 0.2);
    }
    .empty {
      margin: 0;
      color: var(--muted);
    }
  `,
  template: `
    @if (departures().length > 0) {
      <ol [attr.aria-label]="'departures.title' | transloco">
        @for (d of departures(); track d.key) {
          <li>
            <app-line-badge [code]="d.lineId" />
            <span class="headsign">
              <span class="visually-hidden">{{ 'lines.line' | transloco: { id: d.lineId } }}.</span>
              {{ 'lineDetail.towards' | transloco: { headsign: d.headsign } }}
            </span>
            <span class="when">
              <span class="main">
                @if (d.live) {
                  <span
                    class="live-dot"
                    [attr.aria-label]="'realtime.liveLabel' | transloco"
                  ></span>
                }
                @if (d.wait === 0) {
                  {{ 'nextBus.now' | transloco }}
                } @else if (d.wait < countdown) {
                  {{ 'nextBus.inMinutes' | transloco: { minutes: d.wait } }}
                } @else {
                  {{ d.time }}
                }
              </span>
              @if (d.wait < countdown) {
                <span class="sub">{{ d.time }}</span>
              }
            </span>
          </li>
        }
      </ol>
    } @else if (loaded()) {
      <p class="empty">{{ 'departures.none' | transloco }}</p>
    }
  `,
})
export class DeparturesBoardComponent {
  private readonly schedule = inject(ScheduleClockService);
  private readonly network = inject(NetworkRepository);
  private readonly realtime = inject(RealtimeService);
  private readonly arrivalContext = inject(ArrivalContextService);

  readonly stop = input.required<Stop>();
  protected readonly countdown = COUNTDOWN_MINUTES;
  protected readonly loaded = computed(() => this.schedule.timetables() !== null);

  constructor() {
    void this.schedule.load();
    this.realtime.watch();
  }

  protected readonly departures = computed((): readonly Departure[] => {
    const stop = this.stop();
    const clock = this.schedule.clock();
    const all: Departure[] = [];
    for (const service of stop.services) {
      const direction = this.network
        .getLine(service.lineId)
        ?.directions.find((d) => d.id === service.directionId);
      if (!direction) continue;
      const base = { lineId: service.lineId, headsign: direction.headsign };
      // En tiempo real (como mucho dos por sentido, como en los próximos buses).
      const live = estimateArrivals(
        this.realtime.vehicles(),
        service.lineId,
        direction,
        direction.stopIds.indexOf(stop.id),
        this.realtime.now(),
        this.arrivalContext.context(),
      ).slice(0, 2);
      for (const a of live) {
        all.push({
          ...base,
          key: `v${a.vehicleId}`,
          wait: a.minutes,
          time: formatClock(clock.minutes + a.minutes),
          live: true,
        });
      }
      // Del horario, los que van detrás de los vistos en tiempo real (sin contar dos veces el mismo bus).
      const after = live.length > 0 ? clock.minutes + live.at(-1)!.minutes + 2 : -Infinity;
      const result = this.schedule.nextBuses(
        service.lineId,
        service.directionId,
        stop.id,
        PER_SERVICE,
      );
      if (result.state !== 'ready') continue;
      for (const minutes of result.times.filter((m) => m > after)) {
        all.push({
          ...base,
          key: `${service.lineId}|${service.directionId}|${minutes}`,
          wait: Math.max(0, Math.round(minutes - clock.minutes)),
          time: formatClock(minutes),
          live: false,
        });
      }
    }
    return all.sort((a, b) => a.wait - b.wait).slice(0, COUNT);
  });
}
