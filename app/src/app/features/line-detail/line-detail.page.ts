import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  IonBackButton,
  IonButton,
  IonButtons,
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
import { RealtimeService } from '../../core/realtime/realtime.service';
import { ageMinutes } from '../../core/realtime/realtime';
import { LatLon } from '../../core/models/network.model';
import { MapViewComponent } from '../../shared/map-view/map-view.component';
import { DataStatusBannerComponent } from '../../shared/data-status-banner/data-status-banner.component';
import { FavoriteButtonComponent } from '../../shared/favorite-button/favorite-button.component';
import { LineBadgeComponent } from '../../shared/line-badge/line-badge.component';

/** Detalle de línea (RF-03): mapa ancho con el recorrido y panel con sentidos y paradas en orden. */
@Component({
  selector: 'app-line-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    DataStatusBannerComponent,
    FavoriteButtonComponent,
    LineBadgeComponent,
    MapViewComponent,
    IonBackButton,
    IonButton,
    IonButtons,
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
  styleUrl: './line-detail.page.scss',
  templateUrl: './line-detail.page.html',
})
export class LineDetailPage {
  private readonly network = inject(NetworkRepository);
  private readonly dataStatus = inject(DataStatusService);
  private readonly colors = inject(LineColorsService);
  private readonly router = inject(Router);
  protected readonly simpleMode = inject(SimpleModeService).active;
  private readonly geometries = signal<ReadonlyMap<string, readonly LatLon[]>>(new Map());

  /** Parámetros de la ruta (/lines/:lineId?direction=2), enlazados por withComponentInputBinding. */
  readonly lineId = input.required<string>();
  readonly direction = input<string>();

  protected readonly line = computed(() => {
    // Se lee lines() para recalcular cuando llegan los datos.
    this.network.lines();
    return this.network.getLine(this.lineId());
  });
  protected readonly notFound = computed(
    () => this.dataStatus.status().state === 'ready' && !this.line(),
  );

  protected readonly selectedDirectionId = linkedSignal(() => {
    const directions = this.line()?.directions ?? [];
    const requested = Number(this.direction());
    return directions.some((d) => d.id === requested) ? requested : (directions[0]?.id ?? 1);
  });

  protected readonly selectedDirection = computed(() =>
    this.line()?.directions.find((d) => d.id === this.selectedDirectionId()),
  );

  /** Recorrido del sentido elegido y sus paradas, para el mapa del detalle. */
  protected readonly mapRoutes = computed(() => {
    const line = this.line();
    const directionId = this.selectedDirectionId();
    return line
      ? toMapRoutes(
          [line],
          this.geometries(),
          (id) => this.colors.colorFor(id),
          (_, d) => d === directionId,
        )
      : [];
  });
  protected readonly mapStops = computed(() =>
    toMapStops((this.selectedDirection()?.stopIds ?? []).map((id) => this.network.getStop(id))),
  );
  protected readonly fitPoints = computed(() => this.mapRoutes()[0]?.points ?? []);

  /** Autobuses de la línea en el sentido elegido (tiempo real, solo en la app del móvil). */
  private readonly realtime = inject(RealtimeService);
  protected readonly vehicles = computed(() => {
    const now = this.realtime.now();
    const color = this.colors.colorFor(this.lineId());
    return this.realtime
      .vehicles()
      .filter(
        (v) =>
          v.lineId === this.lineId() &&
          v.directionId === this.selectedDirection()?.id &&
          ageMinutes(v, now) !== null,
      )
      .map((v) => ({
        id: v.id,
        lineId: v.lineId,
        lat: v.lat,
        lon: v.lon,
        color: color.line,
        textColor: color.text,
      }));
  });

  constructor() {
    this.realtime.watch();
    inject(ShapeRepository)
      .getShapes('detail')
      .then((shapes) => this.geometries.set(shapes))
      .catch((error: unknown) => console.warn('No se pudieron cargar los trazados', error));
  }

  protected openStop(stopId: string): void {
    void this.router.navigate(['/stops', stopId]);
  }

  protected readonly stops = computed(() =>
    (this.selectedDirection()?.stopIds ?? []).map((id) => ({
      id,
      name: this.network.getStop(id)?.name ?? id,
    })),
  );
}
