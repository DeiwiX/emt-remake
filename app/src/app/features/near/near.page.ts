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
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { NetworkRepository } from '../../core/data/repositories';
import { stopsNear } from '../../core/location/geo';
import { LocationService } from '../../core/location/location.service';
import { toMapStops } from '../../core/map/map-features';
import { LatLon, Stop } from '../../core/models/network.model';
import { SimpleModeService } from '../../core/settings/simple-mode.service';
import { DataDateComponent } from '../../shared/data-date/data-date.component';
import { DataStatusBannerComponent } from '../../shared/data-status-banner/data-status-banner.component';
import { MapViewComponent } from '../../shared/map-view/map-view.component';
import { StopCardComponent } from '../../shared/stop-card/stop-card.component';

/** Por encima de esta precisión se avisa de que la posición es aproximada. */
const ROUGH_ACCURACY_M = 100;

/**
 * "Cerca de mí" (Fase 2): paradas a menos de 500 m (o 1 km si no hay), de la más
 * cercana a la más lejana, con el tiempo andando. La ubicación se pide al abrir
 * la pantalla y con el botón "Actualizar"; nunca sale del dispositivo.
 */
@Component({
  selector: 'app-near',
  imports: [
    DataDateComponent,
    TranslocoPipe,
    DataStatusBannerComponent,
    MapViewComponent,
    StopCardComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './near.page.scss',
  templateUrl: './near.page.html',
})
export class NearPage {
  private readonly network = inject(NetworkRepository);
  private readonly location = inject(LocationService);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly simpleMode = inject(SimpleModeService).active;
  protected readonly state = this.location.state;
  protected readonly selectedId = signal<string | null>(null);

  protected readonly point = computed<LatLon | null>(() => {
    const state = this.state();
    return state.status === 'ready' ? state.point : null;
  });
  protected readonly accuracy = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.accuracy : 0;
  });
  protected readonly rough = computed(() => {
    const state = this.state();
    return state.status === 'ready' && state.accuracy > ROUGH_ACCURACY_M
      ? Math.round(state.accuracy)
      : null;
  });
  protected readonly near = computed(() => {
    const point = this.point();
    return point ? stopsNear(this.network.stops(), point) : null;
  });

  protected readonly selectedStop = computed(() => {
    this.network.stops();
    const id = this.selectedId();
    return id ? this.network.getStop(id) : undefined;
  });
  protected readonly selectedMarker = computed(() => toMapStops([this.selectedStop()])[0] ?? null);
  /** En el mapa, cada parada con las líneas que pasan por ella encima ("1 · 36"). */
  protected readonly mapStops = computed(() =>
    (this.near()?.stops ?? []).map(({ stop }) => ({
      ...toMapStops([stop])[0]!,
      label: this.lineIds(stop).join(' · '),
    })),
  );
  /** Encuadre: la parada elegida o tu posición con las paradas cercanas. */
  protected readonly fitPoints = computed<LatLon[]>(() => {
    const selected = this.selectedStop();
    if (selected) return [[selected.lat, selected.lon]];
    const point = this.point();
    if (!point) return [];
    return [point, ...(this.near()?.stops ?? []).map((s): LatLon => [s.stop.lat, s.stop.lon])];
  });

  constructor() {
    void this.location.locate();
  }

  protected refresh(): void {
    this.selectedId.set(null);
    void this.location.locate();
  }

  protected selectStop(stopId: string | null): void {
    this.selectedId.set(stopId);
    const panel = this.panel()?.nativeElement;
    if (stopId && panel) panel.scrollTop = 0;
  }

  /** Distancias redondeadas a 10 m: la posición nunca es más precisa. */
  protected roundMetres(metres: number): number {
    return Math.max(10, Math.round(metres / 10) * 10);
  }

  protected lineCodes(stop: Stop): string {
    return this.lineIds(stop).join(', ');
  }

  private lineIds(stop: Stop): string[] {
    return [...new Set(stop.services.map((s) => s.lineId))];
  }
}
