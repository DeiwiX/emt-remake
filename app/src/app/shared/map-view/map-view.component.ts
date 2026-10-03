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
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IonButton } from '@ionic/angular';

import { MapProvider, MapRoute, MapStop, MapView } from '../../core/map/map-provider';
import { LatLon, Polygon } from '../../core/models/network.model';
import { MapStylePreference, SettingsService } from '../../core/settings/settings.service';
import { ColorSchemeService, prefersReducedMotion } from '../../core/theme/color-scheme.service';

/** Centro de Málaga. */
const MALAGA_CENTER: LatLon = [36.7213, -4.4214];
const INITIAL_ZOOM = 12;

type MapState = 'loading' | 'ready' | 'unsupported' | 'error';

/** Capas que se pueden elegir. La foto aérea es la del PNOA (IGN), ADR 0004. */
const LAYER_CHOICES: readonly Exclude<MapStylePreference, 'auto'>[] = ['light', 'dark', 'satellite'];

/**
 * Mapa reutilizable sobre MapProvider: crea y destruye el mapa, le pasa los
 * datos y muestra los estados de carga, error y "sin soporte" (RF-09).
 * No conoce MapLibre: solo la abstracción de core/map.
 */
@Component({
  selector: 'app-map-view',
  imports: [RouterLink, TranslocoPipe, IonButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      position: relative;
      display: block;
    }
    .map {
      position: absolute;
      inset: 0;
    }
    .map.hidden {
      display: none;
    }
    /* Selector de capa, arriba a la izquierda (los botones de zoom van a la derecha). */
    .layer-switch {
      position: absolute;
      top: 8px;
      left: 8px;
      z-index: 1;
      display: flex;
      gap: 2px;
      padding: 3px;
      border-radius: 12px;
      background: var(--ion-background-color, #fff);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
    }
    .layer-switch button {
      min-height: 44px;
      min-width: 44px;
      padding: 0 10px;
      border: 0;
      border-radius: 9px;
      background: transparent;
      color: var(--ion-text-color);
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
    }
    .layer-switch button[aria-pressed='true'] {
      background: var(--ion-color-primary);
      color: var(--ion-color-primary-contrast);
      font-weight: 600;
    }
    .layer-switch button:focus-visible {
      outline: 3px solid var(--ion-color-primary);
      outline-offset: 2px;
    }
    .message {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin: 0;
      padding: 16px;
      text-align: center;
    }
  `,
  template: `
    <div #map class="map" [class.hidden]="state() === 'unsupported' || state() === 'error'"></div>
    @if (state() === 'ready' && layerSwitch()) {
      <div class="layer-switch" role="group" [attr.aria-label]="'map.layer' | transloco">
        @for (choice of layerChoices; track choice) {
          <button
            type="button"
            [attr.aria-pressed]="activeLayer() === choice"
            (click)="setLayer(choice)"
          >
            {{ layerKey(choice) | transloco }}
          </button>
        }
      </div>
    }
    @switch (state()) {
      @case ('loading') {
        <p class="message" role="status">{{ 'map.loading' | transloco }}</p>
      }
      @case ('unsupported') {
        <div class="message" role="status">
          <p>{{ 'map.unsupported' | transloco }}</p>
          <ion-button routerLink="/lines">{{ 'lines.title' | transloco }}</ion-button>
        </div>
      }
      @case ('error') {
        <div class="message" role="alert">
          <p>{{ 'map.error' | transloco }}</p>
          <ion-button (click)="retry()">{{ 'common.retry' | transloco }}</ion-button>
        </div>
      }
    }
  `,
})
export class MapViewComponent {
  private readonly provider = inject(MapProvider);
  private readonly scheme = inject(ColorSchemeService).scheme;
  private readonly transloco = inject(TranslocoService);
  private readonly settings = inject(SettingsService);

  readonly routes = input<readonly MapRoute[]>([]);
  readonly stops = input<readonly MapStop[]>([]);
  /** Líneas visibles; null = todas. */
  readonly visibleLines = input<ReadonlySet<string> | null>(null);
  /** Líneas resaltadas (el resto se atenúa); null = ninguna. */
  readonly highlightedLines = input<ReadonlySet<string> | null>(null);
  readonly highlightedStop = input<MapStop | null>(null);
  /** Zona marcada (contorno de barrio o distrito); null = ninguna. */
  readonly highlightedArea = input<readonly Polygon[] | null>(null);
  /** Muestra el selector Claro / Oscuro / Satélite (la elección se recuerda en Ajustes). */
  readonly layerSwitch = input(true);
  /** Puntos que el mapa debe encuadrar cuando cambian. */
  readonly fitPoints = input<readonly LatLon[]>([]);
  readonly lineSelected = output<string | null>();
  readonly stopSelected = output<string>();
  readonly zoomChanged = output<number>();

  protected readonly state = signal<MapState>('loading');
  protected readonly layerChoices = LAYER_CHOICES;
  /** Capa efectiva: con 'auto' el callejero sigue el tema de la app. */
  protected readonly activeLayer = computed(() => {
    const style = this.settings.settings().mapStyle;
    return style === 'auto' ? this.scheme() : style;
  });
  /** Esquema del callejero; sobre la foto aérea se mantiene el de la app. */
  private readonly mapScheme = computed(() => {
    const layer = this.activeLayer();
    return layer === 'satellite' ? this.scheme() : layer;
  });
  private readonly container = viewChild.required<ElementRef<HTMLElement>>('map');
  private readonly view = signal<MapView | null>(null);

  constructor() {
    afterNextRender(() => void this.init());
    inject(DestroyRef).onDestroy(() => this.view()?.destroy());

    effect(() => this.view()?.setRoutes(this.routes()));
    effect(() => this.view()?.setStops(this.stops()));
    effect(() => this.view()?.setVisibleLines(this.visibleLines()));
    effect(() => this.view()?.setHighlightedLines(this.highlightedLines()));
    effect(() => this.view()?.setHighlightedStop(this.highlightedStop()));
    effect(() => this.view()?.setHighlightedArea(this.highlightedArea()));
    effect(() => this.view()?.setScheme(this.mapScheme()));
    effect(() =>
      this.view()?.setBaseLayer(this.activeLayer() === 'satellite' ? 'satellite' : 'streets'),
    );
    effect(() => {
      // Se lee view() antes de salir: así el efecto se repite cuando el mapa termina de crearse.
      const view = this.view();
      const points = this.fitPoints();
      if (view && points.length > 0) view.fitTo(points);
    });
  }

  protected setLayer(choice: Exclude<MapStylePreference, 'auto'>): void {
    this.settings.update({ mapStyle: choice });
  }

  protected layerKey(choice: string): string {
    return `map.layers.${choice}`;
  }

  protected async retry(): Promise<void> {
    this.view()?.destroy();
    this.view.set(null);
    await this.init();
  }

  private async init(): Promise<void> {
    if (!this.provider.isSupported()) {
      this.state.set('unsupported');
      return;
    }
    this.state.set('loading');
    try {
      const view = await this.provider.create(
        this.container().nativeElement,
        {
          center: MALAGA_CENTER,
          zoom: INITIAL_ZOOM,
          scheme: this.mapScheme(),
          reduceMotion: prefersReducedMotion(),
          label: await firstValueFrom(this.transloco.selectTranslate('map.mapLabel')),
        },
        {
          lineSelected: (lineId) => this.lineSelected.emit(lineId),
          stopSelected: (stopId) => this.stopSelected.emit(stopId),
          zoomChanged: (zoom) => this.zoomChanged.emit(zoom),
        },
      );
      this.view.set(view);
      this.state.set('ready');
    } catch (error) {
      console.error('No se pudo cargar el mapa', error);
      this.state.set('error');
    }
  }
}
