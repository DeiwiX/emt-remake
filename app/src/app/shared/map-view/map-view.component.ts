import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
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

import { MapBaseLayer, MapProvider, MapRoute, MapStop, MapView } from '../../core/map/map-provider';
import { ColorScheme } from '../../core/theme/color-scheme.service';
import { LatLon } from '../../core/models/network.model';
import { ColorSchemeService, prefersReducedMotion } from '../../core/theme/color-scheme.service';

/** Centro de Málaga. */
const MALAGA_CENTER: LatLon = [36.7213, -4.4214];
const INITIAL_ZOOM = 12;

type MapState = 'loading' | 'ready' | 'unsupported' | 'error';

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

  readonly routes = input<readonly MapRoute[]>([]);
  readonly stops = input<readonly MapStop[]>([]);
  /** Líneas visibles; null = todas. */
  readonly visibleLines = input<ReadonlySet<string> | null>(null);
  /** Líneas resaltadas (el resto se atenúa); null = ninguna. */
  readonly highlightedLines = input<ReadonlySet<string> | null>(null);
  readonly highlightedStop = input<MapStop | null>(null);
  readonly baseLayer = input<MapBaseLayer>('streets');
  /** Esquema del mapa; null = el de la app. */
  readonly mapScheme = input<ColorScheme | null>(null);
  /** Puntos que el mapa debe encuadrar cuando cambian. */
  readonly fitPoints = input<readonly LatLon[]>([]);
  readonly lineSelected = output<string | null>();
  readonly stopSelected = output<string>();
  readonly zoomChanged = output<number>();

  protected readonly state = signal<MapState>('loading');
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
    effect(() => this.view()?.setScheme(this.mapScheme() ?? this.scheme()));
    effect(() => this.view()?.setBaseLayer(this.baseLayer()));
    effect(() => {
      // Se lee view() antes de salir: así el efecto se repite cuando el mapa termina de crearse.
      const view = this.view();
      const points = this.fitPoints();
      if (view && points.length > 0) view.fitTo(points);
    });
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
          scheme: this.mapScheme() ?? this.scheme(),
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
