import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { DataStatusService, NetworkRepository } from '../../core/data/repositories';
import { DataStatusBannerComponent } from '../../shared/data-status-banner/data-status-banner.component';
import { LineBadgeComponent } from '../../shared/line-badge/line-badge.component';

/** Detalle de parada en texto (RF-04): datos, ubicación y líneas con su sentido. */
@Component({
  selector: 'app-stop-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    DataStatusBannerComponent,
    LineBadgeComponent,
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/stops" [text]="'common.back' | transloco" />
        </ion-buttons>
        <ion-title>{{ 'stopDetail.title' | transloco: { id: stopId() } }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <app-data-status-banner />
      @if (stop(); as stop) {
        <div class="ion-padding-horizontal">
          <h1>{{ stop.name }}</h1>
          <p>{{ 'stops.code' | transloco: { id: stop.id } }}</p>
          @if (stop.address) {
            <p>{{ 'stopDetail.address' | transloco: { address: stop.address } }}</p>
          }
          <p>{{ 'stopDetail.coordinates' | transloco: { lat: stop.lat, lon: stop.lon } }}</p>
        </div>
        <h2 class="ion-padding-horizontal">{{ 'stopDetail.lines' | transloco }}</h2>
        <ion-list [attr.aria-label]="'stopDetail.lines' | transloco">
          @for (service of services(); track service.lineId + '-' + service.directionId) {
            <ion-item
              [routerLink]="['/lines', service.lineId]"
              [queryParams]="{ direction: service.directionId }"
              detail
            >
              <app-line-badge slot="start" [code]="service.lineId" />
              <ion-label class="ion-text-wrap">
                <span class="visually-hidden"
                  >{{ 'lines.line' | transloco: { id: service.lineId } }}.</span
                >
                {{ 'lineDetail.towards' | transloco: { headsign: service.headsign } }}
              </ion-label>
            </ion-item>
          }
        </ion-list>
      } @else if (notFound()) {
        <p class="ion-padding" role="status">
          {{ 'stopDetail.notFound' | transloco: { id: stopId() } }}
        </p>
      }
    </ion-content>
  `,
})
export class StopDetailPage {
  private readonly network = inject(NetworkRepository);
  private readonly dataStatus = inject(DataStatusService);

  /** Recibido desde la ruta gracias a withComponentInputBinding. */
  readonly stopId = input.required<string>();

  protected readonly stop = computed(() => {
    this.network.stops();
    return this.network.getStop(this.stopId());
  });
  protected readonly notFound = computed(
    () => this.dataStatus.status().state === 'ready' && !this.stop(),
  );

  protected readonly services = computed(() =>
    (this.stop()?.services ?? []).map((service) => ({
      ...service,
      headsign:
        this.network.getLine(service.lineId)?.directions.find((d) => d.id === service.directionId)
          ?.headsign ?? '',
    })),
  );
}
