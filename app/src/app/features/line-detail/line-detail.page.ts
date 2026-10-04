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
import { LatLon } from '../../core/models/network.model';
import { MapViewComponent } from '../../shared/map-view/map-view.component';
import { DataStatusBannerComponent } from '../../shared/data-status-banner/data-status-banner.component';
import { LineBadgeComponent } from '../../shared/line-badge/line-badge.component';

/** Detalle de línea en texto (RF-03): sentidos y paradas en orden. El mapa llega en el incremento 5. */
@Component({
  selector: 'app-line-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    DataStatusBannerComponent,
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
  styles: `
    .heading {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .heading h1 {
      margin: 0;
      font-size: 1.25rem;
    }
    .directions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .directions ion-button {
      flex: 1 1 10rem;
      min-height: 44px;
      text-transform: none;
      white-space: normal;
    }
  `,
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

  constructor() {
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
