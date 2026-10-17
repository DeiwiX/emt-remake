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
      position: relative;
      margin: 8px 0 16px;
      padding: 0;
      list-style: none;
    }
    /* La línea: una franja de su color que une las estaciones. */
    ol::before {
      content: '';
      position: absolute;
      top: 22px;
      bottom: 22px;
      left: 17px;
      width: 6px;
      border-radius: 3px;
      background: var(--line-color);
    }
    li a {
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 44px;
      padding: 4px 0;
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
      width: 16px;
      height: 16px;
      margin-left: 12px;
      border: 4px solid var(--line-color);
      border-radius: 50%;
      background: var(--ion-background-color);
    }
    .dot.transfer {
      width: 22px;
      height: 22px;
      margin-left: 9px;
      border-color: var(--ion-text-color);
    }
    .name {
      flex: 1;
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
                  <span class="dot" [class.transfer]="station.others.length > 0"></span>
                  <span class="name">{{ station.name }}</span>
                  @if (station.others.length > 0) {
                    <span class="other">
                      <span class="visually-hidden">{{ 'metro.transfer' | transloco }}</span>
                      @for (id of station.others; track id) {
                        <app-line-badge [code]="id" />
                      }
                    </span>
                  }
                  <ion-icon class="chevron" name="chevron-forward" aria-hidden="true" />
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

  /** Estaciones en el orden del primer sentido, con las otras líneas de metro que paran en ellas. */
  protected readonly stations = computed(() => {
    const line = this.selected();
    const direction = line?.directions[0];
    if (!line || !direction) return [];
    return direction.stopIds.map((id) => {
      const stop = this.network.getStop(id);
      const others = [
        ...new Set(
          (stop?.services ?? [])
            .map((s) => s.lineId)
            .filter((other) => other !== line.id && this.network.getLine(other)?.mode === 'metro'),
        ),
      ];
      return { id, name: stop?.name ?? id, others };
    });
  });
}
