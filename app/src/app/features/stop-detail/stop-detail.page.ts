import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
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

import {
  DataStatusService,
  NetworkRepository,
  ShapeRepository,
} from '../../core/data/repositories';
import { LineColorsService } from '../../core/map/line-colors.service';
import { toMapRoutes, toMapStops } from '../../core/map/map-features';
import { LatLon, Line } from '../../core/models/network.model';
import { MapViewComponent } from '../../shared/map-view/map-view.component';
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
    MapViewComponent,
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
        @defer (on viewport) {
          <app-map-view
            class="detail-map"
            role="region"
            [attr.aria-label]="'stopDetail.mapLabel' | transloco: { name: stop.name }"
            [routes]="mapRoutes()"
            [stops]="mapStops()"
            [fitPoints]="fitPoints()"
            (stopSelected)="openStop($event)"
          />
        } @placeholder {
          <div class="detail-map"></div>
        }
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
  private readonly colors = inject(LineColorsService);
  private readonly router = inject(Router);
  private readonly geometries = signal<ReadonlyMap<string, readonly LatLon[]>>(new Map());

  /** Recibido desde la ruta gracias a withComponentInputBinding. */
  readonly stopId = input.required<string>();

  protected readonly stop = computed(() => {
    this.network.stops();
    return this.network.getStop(this.stopId());
  });
  protected readonly notFound = computed(
    () => this.dataStatus.status().state === 'ready' && !this.stop(),
  );

  /** En el mapa: la parada y los recorridos de las líneas que pasan por ella, en su sentido. */
  protected readonly mapRoutes = computed(() => {
    const services = this.stop()?.services ?? [];
    const lines = [...new Set(services.map((s) => s.lineId))]
      .map((id) => this.network.getLine(id))
      .filter((line): line is Line => !!line);
    return toMapRoutes(
      lines,
      this.geometries(),
      (id) => this.colors.colorFor(id),
      (line, directionId) =>
        services.some((s) => s.lineId === line.id && s.directionId === directionId),
    );
  });
  protected readonly mapStops = computed(() => toMapStops([this.stop()]));
  protected readonly fitPoints = computed<LatLon[]>(() => {
    const stop = this.stop();
    return stop ? [[stop.lat, stop.lon]] : [];
  });

  constructor() {
    inject(ShapeRepository)
      .getShapes('detail')
      .then((shapes) => this.geometries.set(shapes))
      .catch((error: unknown) => console.warn('No se pudieron cargar los trazados', error));
  }

  protected openStop(stopId: string): void {
    if (stopId !== this.stopId()) void this.router.navigate(['/stops', stopId]);
  }

  protected readonly services = computed(() =>
    (this.stop()?.services ?? []).map((service) => ({
      ...service,
      headsign:
        this.network.getLine(service.lineId)?.directions.find((d) => d.id === service.directionId)
          ?.headsign ?? '',
    })),
  );
}
