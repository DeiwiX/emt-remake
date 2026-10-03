import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
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
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { NetworkRepository, ShapeRepository } from '../../core/data/repositories';
import { LineColorsService } from '../../core/map/line-colors.service';
import { toMapRoutes, toMapStops } from '../../core/map/map-features';
import { MapBaseLayer } from '../../core/map/map-provider';
import { ColorScheme, ColorSchemeService } from '../../core/theme/color-scheme.service';
import { LatLon, ShapeDetail } from '../../core/models/network.model';
import { searchLines, searchStops } from '../../core/search/search';
import { DataStatusBannerComponent } from '../../shared/data-status-banner/data-status-banner.component';
import { LineBadgeComponent } from '../../shared/line-badge/line-badge.component';
import { MapViewComponent } from '../../shared/map-view/map-view.component';

/** Paradas que se pintan como resultado de búsqueda; la lista completa está en Paradas. */
const MAX_STOP_RESULTS = 30;

/** Lo último que ha elegido el usuario: es lo que el mapa encuadra. */
type MapFocus = { kind: 'line'; id: string } | { kind: 'stop'; id: string };

/** Foto aérea del PNOA (IGN). Pendiente de que el desarrollador apruebe el servicio. */
const SATELLITE_AVAILABLE = false;

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
    IonSearchbar,
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

  /** Capa del mapa elegida en esta pantalla; el callejero empieza con el tema de la app. */
  protected readonly baseLayer = signal<MapBaseLayer>('streets');
  protected readonly mapScheme = linkedSignal<ColorScheme>(inject(ColorSchemeService).scheme);
  protected readonly satelliteAvailable = SATELLITE_AVAILABLE;

  /** Búsqueda de líneas y paradas dentro del mapa (RF-05). */
  protected readonly query = signal('');
  protected readonly searching = computed(() => this.query().trim().length > 0);
  protected readonly lineResults = computed(() =>
    searchLines(this.lines(), this.query(), Infinity),
  );
  private readonly allStopResults = computed(() =>
    searchStops(this.network.stops(), this.query(), Infinity),
  );
  protected readonly stopResults = computed(() => this.allStopResults().slice(0, MAX_STOP_RESULTS));
  protected readonly totalStopResults = computed(() => this.allStopResults().length);

  /** Parada marcada en el mapa (elegida en la búsqueda o tocada en el mapa). */
  protected readonly selectedStopId = signal<string | null>(null);
  protected readonly selectedStop = computed(() => {
    this.network.stops();
    const id = this.selectedStopId();
    return id ? this.network.getStop(id) : undefined;
  });
  protected readonly selectedStopMarker = computed(
    () => toMapStops([this.selectedStop()])[0] ?? null,
  );
  /** Líneas que pasan por la parada marcada, con el destino de cada sentido. */
  protected readonly selectedStopServices = computed(() =>
    (this.selectedStop()?.services ?? []).map((service) => ({
      ...service,
      headsign:
        this.network.getLine(service.lineId)?.directions.find((d) => d.id === service.directionId)
          ?.headsign ?? '',
    })),
  );

  private readonly focus = linkedSignal<MapFocus | null>(() => {
    const line = this.line();
    return line ? { kind: 'line', id: line } : null;
  });

  private readonly geometries = signal<ReadonlyMap<string, readonly LatLon[]>>(new Map());
  private detailLoaded = false;
  private readonly loadingShapes = new Set<ShapeDetail>();

  protected readonly routes = computed(() =>
    toMapRoutes(this.lines(), this.geometries(), (id) => this.colors.colorFor(id)),
  );

  /**
   * Mientras se busca, se resaltan las líneas que coinciden y el resto se atenúa
   * (si no coincide ninguna, todas quedan atenuadas). Si no, la línea elegida.
   */
  protected readonly highlightedLines = computed<ReadonlySet<string> | null>(() => {
    if (this.searching()) return new Set(this.lineResults().map((l) => l.id));
    const id = this.highlightedId();
    return id ? new Set([id]) : null;
  });

  /**
   * Mientras se busca, solo las paradas que coinciden; si no, las de la línea
   * resaltada o, si no hay ninguna, todas.
   */
  protected readonly mapStops = computed(() => {
    if (this.searching()) return toMapStops(this.allStopResults());
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

  /** El mapa encuadra la última línea resaltada o la última parada elegida. */
  protected readonly fitPoints = computed<LatLon[]>(() => {
    const focus = this.focus();
    if (focus?.kind === 'stop') {
      const stop = this.selectedStop();
      return stop ? [[stop.lat, stop.lon]] : [];
    }
    const line = focus ? this.network.getLine(focus.id) : undefined;
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

  protected setLayer(layer: MapBaseLayer, scheme: ColorScheme): void {
    this.baseLayer.set(layer);
    this.mapScheme.set(scheme);
  }

  protected highlight(lineId: string | null): void {
    this.highlightedId.set(lineId);
    if (lineId) {
      this.focus.set({ kind: 'line', id: lineId });
      // Una línea resaltada siempre es visible.
      this.setVisible(lineId, true);
    }
  }

  /** Marca una parada y centra el mapa en ella, sin salir del mapa. */
  protected selectStop(stopId: string | null): void {
    this.selectedStopId.set(stopId);
    if (stopId) this.focus.set({ kind: 'stop', id: stopId });
  }

  protected chooseLine(lineId: string): void {
    this.highlight(lineId);
    this.query.set('');
  }

  protected chooseStop(stopId: string): void {
    this.selectStop(stopId);
    this.query.set('');
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
