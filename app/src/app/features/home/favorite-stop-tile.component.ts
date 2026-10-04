import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IonButton, IonIcon } from '@ionic/angular';

import { NetworkRepository } from '../../core/data/repositories';
import { Stop } from '../../core/models/network.model';
import { dayOffsetOf, formatClock } from '../../core/schedule/schedule';
import { ScheduleClockService } from '../../core/schedule/schedule-clock.service';
import { LineBadgeComponent } from '../../shared/line-badge/line-badge.component';
import { NextBusComponent } from '../../shared/next-bus/next-bus.component';

/** Hasta este margen se dice lo que falta ("4 min"); después, la hora. */
const COUNTDOWN_MINUTES = 60;

/**
 * Parada favorita en el inicio. Plegada es una tarjeta pequeña (dos por fila)
 * con el nombre, las líneas y el próximo bus de todas ellas; al pulsarla en
 * cualquier sitio se despliega a lo ancho con los próximos buses de cada línea
 * y el acceso al detalle de la parada.
 */
@Component({
  selector: 'app-favorite-stop-tile',
  imports: [RouterLink, TranslocoPipe, IonButton, IonIcon, LineBadgeComponent, NextBusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.expanded]': 'expanded()' },
  styles: `
    :host {
      display: block;
      border-radius: 16px;
      background: var(--card);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }
    :host(.expanded) {
      grid-column: 1 / -1;
    }
    .toggle {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
      min-height: 44px;
      padding: 12px;
      border: 0;
      border-radius: 16px;
      background: transparent;
      color: var(--ion-text-color);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .toggle:focus-visible {
      outline: 3px solid var(--ion-color-primary);
      outline-offset: 2px;
    }
    .name {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 6px;
      font-weight: 700;
      line-height: 1.2;
    }
    .chevron {
      flex: 0 0 auto;
      font-size: 1.1rem;
      color: var(--muted);
      transition: transform 0.15s ease;
    }
    :host(.expanded) .chevron {
      transform: rotate(180deg);
    }
    .badges {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .badges app-line-badge {
      min-width: 2.25rem;
      min-height: 1.6rem;
      font-size: 0.85rem;
    }
    .next {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.9rem;
      color: var(--muted);
    }
    .next strong {
      font-size: 1.05rem;
      color: var(--ion-text-color);
    }
    .details {
      padding: 0 12px 12px;
    }
    .service {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 8px 0;
      border-top: 1px solid var(--soft);
    }
    .service-text {
      display: flex;
      flex-direction: column;
      font-size: 0.9rem;
    }
    .code {
      margin: 0 0 4px;
      font-size: 0.85rem;
      color: var(--muted);
    }
    @media (prefers-reduced-motion: reduce) {
      .chevron {
        transition: none;
      }
    }
  `,
  template: `
    <button
      type="button"
      class="toggle"
      [attr.aria-expanded]="expanded()"
      [attr.aria-controls]="'fav-stop-' + stop().id"
      (click)="toggled.emit()"
    >
      <span class="name">
        {{ stop().name }}
        <ion-icon class="chevron" name="chevron-down" aria-hidden="true" />
      </span>
      <span class="badges">
        <span class="visually-hidden">{{
          'stops.servedBy' | transloco: { lines: lineIds().join(', ') }
        }}</span>
        @for (lineId of lineIds(); track lineId) {
          <app-line-badge [code]="lineId" />
        }
      </span>
      @if (next(); as next) {
        <span class="next">
          <ion-icon name="time-outline" aria-hidden="true" />
          <span>
            {{ 'favorites.nextLine' | transloco: { id: next.lineId } }}:
            <strong>
              @if (next.wait === null) {
                {{
                  next.tomorrow ? ('plan.tomorrowAt' | transloco: { time: next.time }) : next.time
                }}
              } @else if (next.wait === 0) {
                {{ 'nextBus.now' | transloco }}
              } @else {
                {{ 'nextBus.inMinutes' | transloco: { minutes: next.wait } }}
              }
            </strong>
          </span>
        </span>
      }
    </button>

    @if (expanded()) {
      <div class="details" [id]="'fav-stop-' + stop().id">
        <p class="code">{{ 'stops.code' | transloco: { id: stop().id } }}</p>
        @for (service of services(); track service.lineId + '-' + service.directionId) {
          <div class="service">
            <app-line-badge [code]="service.lineId" />
            <span class="service-text">
              <span class="visually-hidden"
                >{{ 'lines.line' | transloco: { id: service.lineId } }}.</span
              >
              {{ 'lineDetail.towards' | transloco: { headsign: service.headsign } }}
              <app-next-bus
                [lineId]="service.lineId"
                [directionId]="service.directionId"
                [stopId]="stop().id"
              />
            </span>
          </div>
        }
        <ion-button size="small" [routerLink]="['/stops', stop().id]">
          {{ 'map.openStopDetail' | transloco }}
        </ion-button>
      </div>
    }
  `,
})
export class FavoriteStopTileComponent {
  private readonly network = inject(NetworkRepository);
  private readonly schedule = inject(ScheduleClockService);

  readonly stop = input.required<Stop>();
  readonly expanded = input(false);
  readonly toggled = output();

  constructor() {
    void this.schedule.load();
  }

  protected readonly lineIds = computed(() => [
    ...new Set(this.stop().services.map((s) => s.lineId)),
  ]);

  protected readonly services = computed(() =>
    this.stop().services.map((service) => ({
      ...service,
      headsign:
        this.network.getLine(service.lineId)?.directions.find((d) => d.id === service.directionId)
          ?.headsign ?? '',
    })),
  );

  /** El primer bus que pasa por la parada, de cualquiera de sus líneas. */
  protected readonly next = computed(() => {
    let best: { lineId: string; minutes: number; now: number } | null = null;
    for (const service of this.stop().services) {
      const result = this.schedule.nextBuses(
        service.lineId,
        service.directionId,
        this.stop().id,
        1,
      );
      if (result.state !== 'ready') continue;
      const minutes = result.times[0]!;
      if (!best || minutes < best.minutes) {
        best = { lineId: service.lineId, minutes, now: result.clock.minutes };
      }
    }
    if (!best) return null;
    const wait = Math.max(0, Math.round(best.minutes - best.now));
    return {
      lineId: best.lineId,
      wait: wait < COUNTDOWN_MINUTES ? wait : null,
      time: formatClock(best.minutes),
      /** Pasada la medianoche del día de servicio: "mañana 08:30". */
      tomorrow: dayOffsetOf(best.minutes) > 0 && wait >= COUNTDOWN_MINUTES,
    };
  });
}
