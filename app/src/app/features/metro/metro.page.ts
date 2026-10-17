import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { NetworkRepository } from '../../core/data/repositories';
import { LineColorsService } from '../../core/map/line-colors.service';
import { DataDateComponent } from '../../shared/data-date/data-date.component';
import { DataStatusBannerComponent } from '../../shared/data-status-banner/data-status-banner.component';
import { LineBadgeComponent } from '../../shared/line-badge/line-badge.component';
import { ScheduleClockService } from '../../core/schedule/schedule-clock.service';
import { trainPositions } from '../../core/schedule/train-positions';

/**
 * Pantalla del metro (Fase 11, opción C): un esquema de cada línea, no un mapa,
 * para que se lea de un vistazo. Cada estación abre su detalle con los próximos
 * trenes en los dos sentidos (y las líneas de bus que pasan cerca, en el mapa).
 */
@Component({
  selector: 'app-metro',
  imports: [
    DataDateComponent,
    DataStatusBannerComponent,
    LineBadgeComponent,
    RouterLink,
    TranslocoPipe,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonNote,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .lines {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 12px 0;
    }
    .lines ion-button {
      margin: 0;
    }
    h2 {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1.05rem;
    }
    ol {
      margin: 8px 0 16px;
      padding: 0;
      list-style: none;
    }
    /* Cada estación: su tramo de la franja de color, el punto y una fila separada. */
    li {
      position: relative;
    }
    li::before {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      left: 17px;
      width: 6px;
      background: var(--line-color);
    }
    li:first-child::before {
      top: 50%;
      border-radius: 3px 3px 0 0;
    }
    li:last-child::before {
      bottom: 50%;
      border-radius: 0 0 3px 3px;
    }
    li a {
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 64px;
      color: var(--ion-text-color);
      text-decoration: none;
    }
    li a:focus-visible {
      outline: 3px solid var(--ion-color-primary);
      outline-offset: 2px;
      border-radius: 8px;
    }
    .dot {
      flex: none;
      box-sizing: border-box;
      width: 18px;
      height: 18px;
      margin-left: 11px;
      border: 4px solid var(--line-color);
      border-radius: 50%;
      background: var(--ion-background-color);
    }
    .dot.transfer {
      width: 24px;
      height: 24px;
      margin-left: 8px;
      /* Más grande que las demás: que el texto quede alineado igual. */
      margin-right: -3px;
      border-color: var(--ion-text-color);
    }
    /* Hay un tren en la estación: el punto se rellena y late. */
    .dot.train {
      background: var(--line-color);
      box-shadow: 0 0 0 0 var(--line-color);
      animation: metro-here 1.6s ease-out infinite;
    }
    @keyframes metro-here {
      to {
        box-shadow: 0 0 0 8px transparent;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .dot.train {
        animation: none;
      }
    }
    .body {
      display: flex;
      flex: 1;
      align-items: center;
      gap: 8px;
      align-self: stretch;
      padding: 10px 0;
      border-bottom: 1px solid color-mix(in srgb, var(--ion-text-color) 12%, transparent);
    }
    li:last-child .body {
      border-bottom: 0;
    }
    .info {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 6px;
    }
    .name {
      font-weight: 600;
    }
    .times {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    /* Un sentido: hacia dónde y cuánto falta (o "En parada"). */
    .time {
      display: flex;
      align-items: baseline;
      gap: 6px;
      padding: 3px 10px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--line-color) 14%, transparent);
      font-size: 0.8rem;
    }
    .time .to {
      color: var(--muted);
    }
    .time .wait {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .time.here {
      background: var(--line-color);
      color: #fff;
    }
    .time.here .to {
      color: rgba(255, 255, 255, 0.85);
    }
    .other {
      display: flex;
      gap: 4px;
    }
    .other app-line-badge {
      min-width: 2rem;
      min-height: 1.4rem;
      font-size: 0.8rem;
    }
    .chevron {
      flex: none;
      color: var(--muted);
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/" [text]="'common.back' | transloco" />
        </ion-buttons>
        <ion-title>{{ 'metro.title' | transloco }}</ion-title>
        <app-data-date slot="end" />
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding-horizontal">
      <app-data-status-banner />
      @if (lines().length === 0) {
        <p>{{ 'metro.none' | transloco }}</p>
      } @else {
        <div class="lines" role="group" [attr.aria-label]="'metro.lines' | transloco">
          @for (line of lines(); track line.id) {
            <ion-button
              [fill]="line.id === selected()?.id ? 'solid' : 'outline'"
              [attr.aria-pressed]="line.id === selected()?.id"
              (click)="selectedId.set(line.id)"
            >
              {{ line.id }} · {{ line.name }}
            </ion-button>
          }
        </div>
        @if (selected(); as line) {
          <h2>
            <app-line-badge [code]="line.id" />
            {{ line.name }}
          </h2>
          <ol [style.--line-color]="color()" [attr.aria-label]="'metro.stations' | transloco">
            @for (station of stations(); track station.id) {
              <li>
                <a [routerLink]="['/stops', station.id]">
                  <span
                    class="dot"
                    [class.transfer]="station.others.length > 0"
                    [class.train]="station.trainHere"
                  ></span>
                  <span class="body">
                    <span class="info">
                      <span class="name">{{ station.name }}</span>
                      <!-- Próximo tren en cada sentido: hacia dónde y cuánto falta. -->
                      @if (station.next.length > 0) {
                        <span class="times">
                          @for (n of station.next; track n.directionId) {
                            <span class="time" [class.here]="n.here">
                              <span class="to">{{
                                'metro.towards' | transloco: { headsign: n.headsign }
                              }}</span>
                              <span class="wait">{{
                                n.here
                                  ? ('metro.atStation' | transloco)
                                  : ('metro.minutes' | transloco: { minutes: n.wait })
                              }}</span>
                            </span>
                          }
                        </span>
                      }
                    </span>
                    @if (station.others.length > 0) {
                      <span class="other">
                        <span class="visually-hidden">{{ 'metro.transfer' | transloco }}</span>
                        @for (id of station.others; track id) {
                          <app-line-badge [code]="id" />
                        }
                      </span>
                    }
                    <ion-icon class="chevron" name="chevron-forward" aria-hidden="true" />
                  </span>
                </a>
              </li>
            }
          </ol>
          <ion-button fill="outline" [routerLink]="['/map']" [queryParams]="{ line: line.id }">
            {{ 'metro.onMap' | transloco }}
          </ion-button>
        }
        <p>
          <ion-note>{{ 'metro.note' | transloco }}</ion-note>
        </p>
      }
    </ion-content>
  `,
})
export class MetroPage {
  private readonly network = inject(NetworkRepository);
  private readonly schedule = inject(ScheduleClockService);
  private readonly colors = inject(LineColorsService);

  protected readonly lines = computed(() => this.network.lines().filter((l) => l.mode === 'metro'));
  protected readonly selectedId = linkedSignal(() => this.lines()[0]?.id ?? null);
  protected readonly selected = computed(
    () => this.lines().find((l) => l.id === this.selectedId()) ?? null,
  );
  protected readonly color = computed(() => {
    const line = this.selected();
    return line ? this.colors.colorFor(line.id).line : '';
  });

  constructor() {
    void this.schedule.load();
  }

  /**
   * Estaciones en el orden del primer sentido, con las otras líneas de metro que
   * paran en ellas y el próximo tren en cada sentido ("En parada" si hay uno en
   * la estación), según el horario (17/10/2026).
   */
  protected readonly stations = computed(() => {
    const line = this.selected();
    if (!line || line.directions.length === 0) return [];
    const order = line.directions[0]!.stopIds;
    const clock = this.schedule.clock();
    const timetables = this.schedule.timetables();
    // Estaciones con un tren parado ahora, por sentido ("L1|1|MATZ").
    const stopped = new Set<string>();
    if (timetables) {
      for (const d of line.directions) {
        for (const p of trainPositions(timetables, line.id, d, clock.dateKey, clock.minutes)) {
          if (p.atStation) stopped.add(`${d.id}|${d.stopIds[p.fromIndex]}`);
        }
      }
    }
    return order.map((id) => {
      const next = line.directions.flatMap((d) => {
        if (d.stopIds.at(-1) === id) return [];
        const result = this.schedule.nextBuses(line.id, d.id, id, 1);
        const time = result.state === 'ready' ? result.times[0] : undefined;
        if (time === undefined) return [];
        const wait = Math.max(0, Math.round(time - clock.minutes));
        return [
          {
            directionId: d.id,
            headsign: d.headsign,
            wait,
            here: wait === 0 || stopped.has(`${d.id}|${id}`),
          },
        ];
      });
      const stop = this.network.getStop(id);
      const others = [
        ...new Set(
          (stop?.services ?? [])
            .map((s) => s.lineId)
            .filter((other) => other !== line.id && this.network.getLine(other)?.mode === 'metro'),
        ),
      ];
      return { id, name: stop?.name ?? id, others, next, trainHere: next.some((n) => n.here) };
    });
  });
}
