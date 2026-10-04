import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
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
import { ZonesStore } from '../../core/data/zones-store.service';
import { SimpleModeService } from '../../core/settings/simple-mode.service';
import { LineColorsService } from '../../core/map/line-colors.service';
import { toMapRoutes, toMapStops } from '../../core/map/map-features';
import { LatLon, ShapeDetail, Zone } from '../../core/models/network.model';
import { searchLines, searchStops, searchZones } from '../../core/search/search';
import { DataStatusBannerComponent } from '../../shared/data-status-banner/data-status-banner.component';
import { LineBadgeComponent } from '../../shared/line-badge/line-badge.component';
import { MapViewComponent } from '../../shared/map-view/map-view.component';
import { StopCardComponent } from '../../shared/stop-card/stop-card.component';

/** Paradas que se pintan como resultado de búsqueda; la lista completa está en Paradas. */
const MAX_STOP_RESULTS = 30;

/** Lo último que ha elegido el usuario: es lo que el mapa encuadra. */
type MapFocus =
  { kind: 'line'; id: string } | { kind: 'stop'; id: string } | { kind: 'zone'; id: string };

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
    StopCardComponent,
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
  protected readonly simpleMode = inject(SimpleModeService).active;

  /** Línea a resaltar al abrir (/map?line=C1). */
  readonly line = input<string>();
  /** Barrio o distrito a marcar al abrir (/map?zone=...). */
  readonly zone = input<string>();

  protected readonly lines = this.network.lines;
  protected readonly hiddenLines = signal<ReadonlySet<string>>(new Set());
  protected readonly highlightedId = linkedSignal(() => this.line() ?? null);
  protected readonly highlightedLine = computed(() => {
    this.lines();
    const id = this.highlightedId();
    return id ? this.network.getLine(id) : undefined;
  });

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

  /** Barrios y distritos: se descargan al abrir el mapa y solo se usan al buscar. */
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly zonesStore = inject(ZonesStore);
  private readonly zones = this.zonesStore.zones;
  protected readonly zoneResults = computed(() => searchZones(this.zones(), this.query()));
  protected readonly selectedZoneId = linkedSignal(() => this.zone() ?? null);
  protected readonly selectedZone = computed(() =>
    this.zones().find((zone) => zone.id === this.selectedZoneId()),
  );
  /** Paradas de la zona elegida, en el orden de la lista de paradas (por nombre). */
  protected readonly zoneStops = computed(() => {
    const ids = new Set(this.selectedZone()?.stopIds ?? []);
    return this.network.stops().filter((stop) => ids.has(stop.id));
  });
  /** Líneas que pasan por alguna parada de la zona elegida. */
  protected readonly zoneLines = computed(() => {
    const lineIds = new Set(this.zoneStops().flatMap((stop) => stop.services.map((s) => s.lineId)));
    return this.lines().filter((line) => lineIds.has(line.id));
  });

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

  private readonly focus = linkedSignal<MapFocus | null>(() => {
    const zone = this.zone();
    if (zone) return { kind: 'zone', id: zone };
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
    const stop = this.selectedStop();
    if (stop && this.focus()?.kind === 'stop') {
      return new Set(stop.services.map((s) => s.lineId));
    }
    if (this.selectedZone()) return new Set(this.zoneLines().map((l) => l.id));
    const id = this.highlightedId();
    return id ? new Set([id]) : null;
  });

  /**
   * Mientras se busca, solo las paradas que coinciden; si no, las de la línea
   * resaltada o, si no hay ninguna, todas.
   */
  protected readonly mapStops = computed(() => {
    if (this.searching()) return toMapStops(this.allStopResults());
    if (this.selectedZone()) return toMapStops(this.zoneStops());
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
    if (focus?.kind === 'zone') {
      return (this.selectedZone()?.polygons ?? []).flatMap((polygon) => polygon[0] ?? []);
    }
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
    void this.zonesStore.load();
    // Si las zonas no se pudieron cargar al abrir, se reintenta al buscar.
    effect(() => {
      if (this.searching()) void this.zonesStore.load();
    });
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
    if (lineId) {
      this.selectedZoneId.set(null);
      this.focus.set({ kind: 'line', id: lineId });
      // Una línea resaltada siempre es visible.
      this.setVisible(lineId, true);
    }
  }

  /** Marca una parada y centra el mapa en ella, sin salir del mapa. */
  protected selectStop(stopId: string | null): void {
    this.selectedStopId.set(stopId);
    if (stopId) {
      this.focus.set({ kind: 'stop', id: stopId });
      this.scrollPanelToTop();
    }
  }

  private scrollPanelToTop(): void {
    const panel = this.panel()?.nativeElement;
    if (panel) panel.scrollTop = 0;
  }

  /** Marca una zona: su contorno, sus paradas y las líneas que pasan por ellas. */
  protected chooseZone(zoneId: string): void {
    this.selectedZoneId.set(zoneId);
    this.highlightedId.set(null);
    this.focus.set({ kind: 'zone', id: zoneId });
    this.query.set('');
  }

  protected zoneKindKey(kind: Zone['kind']): string {
    return `map.zoneKind.${kind}`;
  }

  protected clearZone(): void {
    this.selectedZoneId.set(null);
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
