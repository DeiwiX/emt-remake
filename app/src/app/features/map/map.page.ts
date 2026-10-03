import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
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
import { MapProvider, MapRoute, MapStop, MapView } from '../../core/map/map-provider';
import { LatLon, ShapeDetail } from '../../core/models/network.model';
import { ColorSchemeService } from '../../core/theme/color-scheme.service';
import { DataStatusBannerComponent } from '../../shared/data-status-banner/data-status-banner.component';
import { LineBadgeComponent } from '../../shared/line-badge/line-badge.component';

/** Centro de Málaga. */
const MALAGA_CENTER: LatLon = [36.7213, -4.4214];
const INITIAL_ZOOM = 12;
/** A partir de este zoom se cargan los trazados detallados (RNF-02: geometrías según zoom). */
const DETAIL_ZOOM = 14;

type MapState = 'loading' | 'ready' | 'unsupported' | 'error';

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
  private readonly mapProvider = inject(MapProvider);
  private readonly colors = inject(LineColorsService);
  private readonly scheme = inject(ColorSchemeService).scheme;
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);

  /** Línea a resaltar al abrir (/map?line=C1). */
  readonly line = input<string>();

  protected readonly lines = this.network.lines;
  protected readonly state = signal<MapState>('loading');
  protected readonly hiddenLines = signal<ReadonlySet<string>>(new Set());
  protected readonly highlightedId = linkedSignal(() => this.line() ?? null);
  protected readonly highlightedLine = computed(() => {
    this.lines();
    const id = this.highlightedId();
    return id ? this.network.getLine(id) : undefined;
  });

  private readonly mapContainer = viewChild.required<ElementRef<HTMLElement>>('map');
  private readonly view = signal<MapView | null>(null);
  private readonly geometries = signal<ReadonlyMap<string, readonly LatLon[]> | null>(null);
  private detailLoaded = false;
  private readonly loadingShapes = new Set<ShapeDetail>();

  /** Recorridos listos para el mapa: un recorrido por sentido de cada línea. */
  private readonly routes = computed<MapRoute[]>(() => {
    const geometries = this.geometries();
    if (!geometries) return [];
    return this.lines().flatMap((line) => {
      const color = this.colors.colorFor(line.id);
      return line.directions.flatMap((direction) => {
        const points = geometries.get(direction.shapeId);
        return points
          ? [
              {
                id: `${line.id}-${direction.id}`,
                lineId: line.id,
                color: color.line,
                textColor: color.text,
                approximate: direction.shapeQuality === 'approximate',
                points,
              },
            ]
          : [];
      });
    });
  });

  /** Paradas de la línea resaltada o, si no hay ninguna, todas. */
  private readonly mapStops = computed<MapStop[]>(() => {
    const line = this.highlightedLine();
    if (!line)
      return this.network.stops().map(({ id, name, lat, lon }) => ({ id, name, lat, lon }));
    const ids = new Set(line.directions.flatMap((d) => d.stopIds));
    return [...ids].flatMap((id) => {
      const stop = this.network.getStop(id);
      return stop ? [{ id, name: stop.name, lat: stop.lat, lon: stop.lon }] : [];
    });
  });

  constructor() {
    afterNextRender(() => void this.initMap());
    inject(DestroyRef).onDestroy(() => this.view()?.destroy());

    effect(() => this.view()?.setRoutes(this.routes()));
    effect(() => this.view()?.setStops(this.mapStops()));
    effect(() => this.view()?.setScheme(this.scheme()));
    effect(() => {
      const hidden = this.hiddenLines();
      this.view()?.setVisibleLines(hidden.size === 0 ? null : this.visibleSet(hidden));
    });
    effect(() => {
      const view = this.view();
      const line = this.highlightedLine();
      view?.setHighlightedLine(line?.id ?? null);
      const geometries = this.geometries();
      if (view && line && geometries) {
        view.fitTo(line.directions.flatMap((d) => geometries.get(d.shapeId) ?? []));
      }
    });
  }

  protected async retry(): Promise<void> {
    this.view()?.destroy();
    this.view.set(null);
    await this.initMap();
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

  private visibleSet(hidden: ReadonlySet<string>): ReadonlySet<string> {
    return new Set(
      this.lines()
        .map((l) => l.id)
        .filter((id) => !hidden.has(id)),
    );
  }

  private async initMap(): Promise<void> {
    if (!this.mapProvider.isSupported()) {
      this.state.set('unsupported');
      return;
    }
    this.state.set('loading');
    try {
      const [view] = await Promise.all([
        this.mapProvider.create(
          this.mapContainer().nativeElement,
          {
            center: MALAGA_CENTER,
            zoom: INITIAL_ZOOM,
            scheme: this.scheme(),
            reduceMotion:
              typeof matchMedia === 'function' &&
              matchMedia('(prefers-reduced-motion: reduce)').matches,
            label: await firstValueFrom(this.transloco.selectTranslate('map.mapLabel')),
          },
          {
            lineSelected: (lineId) => this.highlight(lineId),
            stopSelected: (stopId) => void this.router.navigate(['/stops', stopId]),
            zoomChanged: (zoom) => {
              if (zoom >= DETAIL_ZOOM) void this.loadShapes('detail');
            },
          },
        ),
        this.loadShapes('overview'),
      ]);
      this.view.set(view);
      this.state.set('ready');
    } catch (error) {
      console.error('No se pudo cargar el mapa', error);
      this.state.set('error');
    }
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
    } finally {
      this.loadingShapes.delete(detail);
    }
  }
}
