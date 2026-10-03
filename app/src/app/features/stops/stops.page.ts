import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { NetworkRepository } from '../../core/data/repositories';
import { searchStops } from '../../core/search/search';
import { DataStatusBannerComponent } from '../../shared/data-status-banner/data-status-banner.component';
import { StopListComponent } from '../../shared/stop-list/stop-list.component';

/**
 * Hay más de 1.000 paradas: se pintan por bloques para que la lista sea fluida
 * en móviles modestos (RNF-02) y no abrume a los lectores de pantalla.
 */
const PAGE_SIZE = 100;

/** Todas las paradas, con filtro, navegables sin mapa (RF-06). */
@Component({
  selector: 'app-stops',
  imports: [
    TranslocoPipe,
    DataStatusBannerComponent,
    StopListComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonSearchbar,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/" [text]="'common.back' | transloco" />
        </ion-buttons>
        <ion-title>{{ 'stops.title' | transloco }}</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar
          [placeholder]="'stops.filterPlaceholder' | transloco"
          [attr.aria-label]="'stops.filterPlaceholder' | transloco"
          [debounce]="200"
          (ionInput)="setQuery($event.detail.value ?? '')"
        />
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <app-data-status-banner />
      @if (allStops().length > 0) {
        <p class="ion-padding-horizontal" role="status">
          {{ 'stops.showing' | transloco: { shown: visible().length, total: filtered().length } }}
        </p>
        <app-stop-list [stops]="visible()" [label]="'stops.title' | transloco" />
        @if (visible().length < filtered().length) {
          <div class="ion-padding">
            <ion-button expand="block" fill="outline" (click)="showMore()">
              {{ 'stops.showMore' | transloco }}
            </ion-button>
          </div>
        }
      }
    </ion-content>
  `,
})
export class StopsPage {
  protected readonly allStops = inject(NetworkRepository).stops;
  private readonly query = signal('');
  private readonly limit = signal(PAGE_SIZE);

  protected readonly filtered = computed(() => {
    const query = this.query();
    const stops = this.allStops();
    return query.trim() ? searchStops(stops, query, stops.length) : stops;
  });
  protected readonly visible = computed(() => this.filtered().slice(0, this.limit()));

  protected setQuery(value: string): void {
    this.query.set(value);
    this.limit.set(PAGE_SIZE);
  }

  protected showMore(): void {
    this.limit.update((n) => n + PAGE_SIZE);
  }
}
