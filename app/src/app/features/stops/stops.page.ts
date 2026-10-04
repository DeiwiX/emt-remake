import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonList,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { NetworkRepository, ShapeRepository } from '../../core/data/repositories';
import { LineColorsService } from '../../core/map/line-colors.service';
import { toMapRoutes, toMapStops } from '../../core/map/map-features';
import { LatLon, Line, Stop } from '../../core/models/network.model';
import { searchStops } from '../../core/search/search';
import { SimpleModeService } from '../../core/settings/simple-mode.service';
import { DataStatusBannerComponent } from '../../shared/data-status-banner/data-status-banner.component';
import { MapViewComponent } from '../../shared/map-view/map-view.component';
import { StopCardComponent } from '../../shared/stop-card/stop-card.component';
import { FavoriteButtonComponent } from '../../shared/favorite-button/favorite-button.component';

/**
 * Hay más de 1.000 paradas: se pintan por bloques para que la lista sea fluida
 * en móviles modestos (RNF-02) y no abrume a los lectores de pantalla.
 */
const PAGE_SIZE = 100;

/** Con más resultados que estos, el mapa no se reencuadra al filtrar (sería casi toda la ciudad). */
const MAX_FIT_RESULTS = 200;

/**
 * Todas las paradas (RF-06) con el mismo esquema que el Mapa: mapa ancho y panel
 * con el filtro y la lista. Elegir una parada, en la lista o en el mapa, la
 * marca, dibuja sus líneas y muestra su ficha con el próximo bus.
 */
@Component({
  selector: 'app-stops',
  imports: [
    TranslocoPipe,
    DataStatusBannerComponent,
    MapViewComponent,
    StopCardComponent,
    FavoriteButtonComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonItem,
    IonList,
    IonSearchbar,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './stops.page.scss',
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/" [text]="'common.back' | transloco" />
        </ion-buttons>
        <ion-title>{{ 'stops.title' | transloco }}</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar
          [placeholder]="'stops.filterPlaceholder' | transloco"
          [attr.aria-label]="'stops.filterPlaceholder' | transloco"
          [debounce]="200"
          (ionInput)="setQuery($event.detail.value ?? '')"
        />
      </ion-toolbar>
    </ion-header>
    <ion-content [scrollY]="false">
      <div class="split-layout" [class.text-only]="simpleMode()">
        @if (!simpleMode()) {
          <div class="split-map">
            <app-map-view
              class="split-map-fill"
              [label]="'stops.mapLabel' | transloco"
              [routes]="mapRoutes()"
              [stops]="mapStops()"
              [highlightedStop]="selectedMarker()"
              [fitPoints]="fitPoints()"
              (stopSelected)="selectStop($event)"
            />
          </div>
        }

        <section #panel class="split-panel" [attr.aria-label]="'stops.title' | transloco">
          <app-data-status-banner />
          @if (selectedStop(); as stop) {
            <app-stop-card [stop]="stop" (closed)="selectStop(null)" />
          }
          @if (allStops().length > 0) {
            <p class="ion-padding-horizontal" role="status">
              {{
                'stops.showing' | transloco: { shown: visible().length, total: filtered().length }
              }}
            </p>
            <ion-list [attr.aria-label]="'stops.title' | transloco">
              @for (stop of visible(); track stop.id) {
                <!-- Dos botones por fila (elegir la parada y guardarla): el ion-item no es
                     pulsable entero para no anidar un botón dentro de otro. -->
                <ion-item [class.is-selected]="stop.id === selectedId()">
                  <button
                    type="button"
                    class="select-stop"
                    [attr.aria-current]="stop.id === selectedId() ? 'true' : null"
                    (click)="selectStop(stop.id)"
                  >
                    <span class="stop-name">{{ stop.name }}</span>
                    <span class="stop-meta">
                      {{ 'stops.code' | transloco: { id: stop.id } }} ·
                      {{ 'stops.servedBy' | transloco: { lines: lineCodes(stop) } }}
                    </span>
                  </button>
                  <app-favorite-button
                    slot="end"
                    [favorite]="{ kind: 'stop', stopId: stop.id }"
                    [label]="'favorites.stopLabel' | transloco: { name: stop.name }"
                  />
                </ion-item>
              }
            </ion-list>
            @if (visible().length < filtered().length) {
              <div class="ion-padding">
                <ion-button expand="block" fill="outline" (click)="showMore()">
                  {{ 'stops.showMore' | transloco }}
                </ion-button>
              </div>
            }
          }
        </section>
      </div>
    </ion-content>
  `,
})
export class StopsPage {
  private readonly network = inject(NetworkRepository);
  private readonly shapes = inject(ShapeRepository);
  private readonly colors = inject(LineColorsService);
  protected readonly simpleMode = inject(SimpleModeService).active;
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly allStops = this.network.stops;
  private readonly query = signal('');
  private readonly limit = signal(PAGE_SIZE);
  protected readonly selectedId = signal<string | null>(null);
  private readonly geometries = signal<ReadonlyMap<string, readonly LatLon[]>>(new Map());
  private shapesRequested = false;

  protected readonly filtered = computed(() => {
    const query = this.query();
    const stops = this.allStops();
    return query.trim() ? searchStops(stops, query, stops.length) : stops;
  });
  protected readonly visible = computed(() => this.filtered().slice(0, this.limit()));

  protected readonly selectedStop = computed(() => {
    this.allStops();
    const id = this.selectedId();
    return id ? this.network.getStop(id) : undefined;
  });
  protected readonly selectedMarker = computed(() => toMapStops([this.selectedStop()])[0] ?? null);

  /** En el mapa, las paradas filtradas; todas si no hay filtro. */
  protected readonly mapStops = computed(() => toMapStops(this.filtered()));

  /** Recorridos de las líneas que pasan por la parada elegida, en su sentido. */
  protected readonly mapRoutes = computed(() => {
    const services = this.selectedStop()?.services ?? [];
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

  /** Encuadre: la parada elegida o, al filtrar, las paradas encontradas. */
  protected readonly fitPoints = computed<LatLon[]>(() => {
    const stop = this.selectedStop();
    if (stop) return [[stop.lat, stop.lon]];
    const results = this.filtered();
    if (!this.query().trim() || results.length > MAX_FIT_RESULTS) return [];
    return results.map((s) => [s.lat, s.lon]);
  });

  protected setQuery(value: string): void {
    this.query.set(value);
    this.limit.set(PAGE_SIZE);
  }

  protected showMore(): void {
    this.limit.update((n) => n + PAGE_SIZE);
  }

  protected selectStop(stopId: string | null): void {
    this.selectedId.set(stopId);
    if (!stopId) return;
    void this.loadShapes();
    const panel = this.panel()?.nativeElement;
    if (panel) panel.scrollTop = 0;
  }

  protected lineCodes(stop: Stop): string {
    return [...new Set(stop.services.map((s) => s.lineId))].join(', ');
  }

  /** Los trazados solo hacen falta al elegir una parada. */
  private async loadShapes(): Promise<void> {
    if (this.shapesRequested) return;
    this.shapesRequested = true;
    try {
      this.geometries.set(await this.shapes.getShapes('detail'));
    } catch (error) {
      this.shapesRequested = false;
      console.warn('No se pudieron cargar los trazados', error);
    }
  }
}
