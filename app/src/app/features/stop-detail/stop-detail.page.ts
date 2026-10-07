import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonIcon,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
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
import { SimpleModeService } from '../../core/settings/simple-mode.service';
import { VehicleTrackerService } from '../../core/realtime/vehicle-tracker.service';
import { LatLon, Line } from '../../core/models/network.model';
import { MapViewComponent } from '../../shared/map-view/map-view.component';
import { DataDateComponent } from '../../shared/data-date/data-date.component';
import { DataStatusBannerComponent } from '../../shared/data-status-banner/data-status-banner.component';
import { FavoriteButtonComponent } from '../../shared/favorite-button/favorite-button.component';
import { LineBadgeComponent } from '../../shared/line-badge/line-badge.component';
import { NextBusComponent } from '../../shared/next-bus/next-bus.component';
import { LocateBusButtonComponent } from '../../shared/locate-bus-button/locate-bus-button.component';

/** Detalle de parada en texto (RF-04): datos, ubicación y líneas con su sentido. */
@Component({
  selector: 'app-stop-detail',
  imports: [
    DataDateComponent,
    RouterLink,
    TranslocoPipe,
    DataStatusBannerComponent,
    FavoriteButtonComponent,
    LineBadgeComponent,
    MapViewComponent,
    NextBusComponent,
    LocateBusButtonComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonIcon,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './stop-detail.page.scss',
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/stops" [text]="'common.back' | transloco" />
        </ion-buttons>
        <ion-title>{{ 'stopDetail.title' | transloco: { id: stopId() } }}</ion-title>
        <app-data-date slot="end" />
      </ion-toolbar>
    </ion-header>
    <ion-content [scrollY]="false">
      <!-- Mismo esquema que Mapa y Paradas: mapa ancho y panel con las líneas y el próximo
           bus. En modo sencillo no hay mapa y el panel ocupa todo. -->
      <div class="split-layout" [class.text-only]="simpleMode()">
        @if (!simpleMode()) {
          <div class="split-map">
            @if (stop(); as stop) {
              <app-map-view
                class="split-map-fill"
                [label]="'stopDetail.mapLabel' | transloco: { name: stop.name }"
                [routes]="mapRoutes()"
                [stops]="mapStops()"
                [vehicles]="vehicles()"
                [fitPoints]="fitPoints()"
                (stopSelected)="openStop($event)"
              />
            }
          </div>
        }

        <section
          class="split-panel"
          [attr.aria-label]="'stopDetail.title' | transloco: { id: stopId() }"
        >
          <app-data-status-banner />
          @if (stop(); as stop) {
            <div class="ion-padding-horizontal">
              <h1>{{ stop.name }}</h1>
              <p>{{ 'stops.code' | transloco: { id: stop.id } }}</p>
              <app-favorite-button
                [favorite]="{ kind: 'stop', stopId: stop.id }"
                [label]="'favorites.stopLabel' | transloco: { name: stop.name }"
                [showText]="true"
              />
              <!-- Abre el Mapa siguiendo el autobús que antes llega a esta parada. -->
              <app-locate-bus-button [stop]="stop" />
              @if (stop.address) {
                <p>{{ 'stopDetail.address' | transloco: { address: stop.address } }}</p>
              }
              <!-- Sin mapa, la ubicación se da en coordenadas. -->
              @if (simpleMode()) {
                <p>{{ 'stopDetail.coordinates' | transloco: { lat: stop.lat, lon: stop.lon } }}</p>
              }
            </div>
            <h2 class="ion-padding-horizontal">{{ 'stopDetail.lines' | transloco }}</h2>
            <ion-list [attr.aria-label]="'stopDetail.lines' | transloco">
              @for (service of services(); track service.lineId + '-' + service.directionId) {
                <!-- El enlace a la línea va aparte: dentro de la fila están los botones del aviso. -->
                <ion-item>
                  <app-line-badge slot="start" [code]="service.lineId" />
                  <ion-label class="ion-text-wrap">
                    <span class="visually-hidden"
                      >{{ 'lines.line' | transloco: { id: service.lineId } }}.</span
                    >
                    {{ 'lineDetail.towards' | transloco: { headsign: service.headsign } }}
                    <app-next-bus
                      [lineId]="service.lineId"
                      [directionId]="service.directionId"
                      [stopId]="stop.id"
                    />
                  </ion-label>
                  <ion-button
                    slot="end"
                    fill="clear"
                    [routerLink]="['/lines', service.lineId]"
                    [queryParams]="{ direction: service.directionId }"
                    [attr.aria-label]="'stopDetail.openLine' | transloco: { id: service.lineId }"
                  >
                    <ion-icon slot="icon-only" name="chevron-forward" aria-hidden="true" />
                  </ion-button>
                </ion-item>
              }
            </ion-list>
            <p class="ion-padding-horizontal">
              <ion-note>{{ 'stopDetail.nextBusNote' | transloco }}</ion-note>
            </p>
          } @else if (notFound()) {
            <p class="ion-padding" role="status">
              {{ 'stopDetail.notFound' | transloco: { id: stopId() } }}
            </p>
          }
        </section>
      </div>
    </ion-content>
  `,
})
export class StopDetailPage {
  private readonly network = inject(NetworkRepository);
  private readonly dataStatus = inject(DataStatusService);
  private readonly colors = inject(LineColorsService);
  private readonly router = inject(Router);
  protected readonly simpleMode = inject(SimpleModeService).active;
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

  /** Autobuses en tiempo real de las líneas y sentidos que pasan por la parada (solo en el móvil). */
  private readonly tracker = inject(VehicleTrackerService);
  protected readonly vehicles = computed(() => {
    const services = this.stop()?.services ?? [];
    return this.tracker
      .vehicles()
      .filter((v) => services.some((s) => s.lineId === v.lineId && s.directionId === v.directionId))
      .map((v) => {
        const color = this.colors.colorFor(v.lineId);
        return {
          id: v.id,
          lineId: v.lineId,
          lat: v.point[0],
          lon: v.point[1],
          bearing: v.bearing,
          color: color.line,
          textColor: color.text,
        };
      });
  });
  protected readonly fitPoints = computed<LatLon[]>(() => {
    const stop = this.stop();
    return stop ? [[stop.lat, stop.lon]] : [];
  });

  constructor() {
    this.tracker.watch();
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
