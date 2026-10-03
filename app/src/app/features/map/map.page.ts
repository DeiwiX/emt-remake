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
  IonCheckbox,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { NetworkRepository, ShapeRepository } from '../../core/data/repositories';
import { LineColorsService } from '../../core/map/line-colors.service';
import { toMapRoutes, toMapStops } from '../../core/map/map-features';
import { LatLon, ShapeDetail } from '../../core/models/network.model';
import { DataStatusBannerComponent } from '../../shared/data-status-banner/data-status-banner.component';
import { LineBadgeComponent } from '../../shared/line-badge/line-badge.component';
import { MapViewComponent } from '../../shared/map-view/map-view.component';

/** A partir de este zoom se cargan los trazados detallados (RNF-02: geometrías según zoom). */
const DETAIL_ZOOM = 14;

/**
 * Mapa de líneas (RF-01, RF-02). Todo lo que muestra el mapa está también en el
 * panel de texto: lista de líneas con su visibilidad y la línea resaltada (RNF-01).
 */
@Component({
  selector: 'app-map',
  imports: [
    RouterLink,
    TranslocoPipe,
    DataStatusBannerComponent,
    LineBadgeComponent,
    MapViewComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonCheckbox,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './map.page.scss',
  templateUrl: './map.page.html',
})
export class MapPage {
  private readonly network = inject(NetworkRepository);
  private readonly shapes = inject(ShapeRepository);
  private readonly colors = inject(LineColorsService);
  private readonly router = inject(Router);

  /** Línea a resaltar al abrir (/map?line=C1). */
  readonly line = input<string>();

  protected readonly lines = this.network.lines;
  protected readonly hiddenLines = signal<ReadonlySet<string>>(new Set());
  protected readonly highlightedId = linkedSignal(() => this.line() ?? null);
  protected readonly highlightedLine = computed(() => {
    this.lines();
    const id = this.highlightedId();
    return id ? this.network.getLine(id) : undefined;
  });

  private readonly geometries = signal<ReadonlyMap<string, readonly LatLon[]>>(new Map());
  private detailLoaded = false;
  private readonly loadingShapes = new Set<ShapeDetail>();

  protected readonly routes = computed(() =>
    toMapRoutes(this.lines(), this.geometries(), (id) => this.colors.colorFor(id)),
  );

  /** Paradas de la línea resaltada o, si no hay ninguna, todas. */
  protected readonly mapStops = computed(() => {
    const line = this.highlightedLine();
    if (!line) return toMapStops(this.network.stops());
    const ids = new Set(line.directions.flatMap((d) => d.stopIds));
    return toMapStops([...ids].map((id) => this.network.getStop(id)));
  });

  protected readonly visibleLines = computed(() => {
    const hidden = this.hiddenLines();
    if (hidden.size === 0) return null;
    return new Set(
      this.lines()
        .map((l) => l.id)
        .filter((id) => !hidden.has(id)),
    );
  });

  /** Al resaltar una línea, el mapa la encuadra. */
  protected readonly fitPoints = computed(() => {
    const line = this.highlightedLine();
    const geometries = this.geometries();
    return line ? line.directions.flatMap((d) => geometries.get(d.shapeId) ?? []) : [];
  });

  constructor() {
    void this.loadShapes('overview');
  }

  protected isVisible(lineId: string): boolean {
    return !this.hiddenLines().has(lineId);
  }

  protected setVisible(lineId: string, visible: boolean): void {
    this.hiddenLines.update((hidden) => {
      const next = new Set(hidden);
      if (visible) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }

  protected showAll(): void {
    this.hiddenLines.set(new Set());
  }

  protected hideAll(): void {
    this.hiddenLines.set(new Set(this.lines().map((l) => l.id)));
  }

  protected highlight(lineId: string | null): void {
    this.highlightedId.set(lineId);
    // Una línea resaltada siempre es visible.
    if (lineId) this.setVisible(lineId, true);
  }

  protected openStop(stopId: string): void {
    void this.router.navigate(['/stops', stopId]);
  }

  protected onZoom(zoom: number): void {
    if (zoom >= DETAIL_ZOOM) void this.loadShapes('detail');
  }

  private async loadShapes(detail: ShapeDetail): Promise<void> {
    if (this.detailLoaded || this.loadingShapes.has(detail)) return;
    this.loadingShapes.add(detail);
    try {
      const shapes = await this.shapes.getShapes(detail);
      // Si mientras tanto llegó el nivel detallado, no se sustituye por el general.
      if (detail === 'overview' && this.detailLoaded) return;
      this.detailLoaded ||= detail === 'detail';
      this.geometries.set(shapes);
    } catch (error) {
      console.error('No se pudieron cargar los trazados', error);
    } finally {
      this.loadingShapes.delete(detail);
    }
  }
}
