import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSearchbar,
} from '@ionic/angular';

import { NetworkRepository } from '../../core/data/repositories';
import { ZonesStore } from '../../core/data/zones-store.service';
import { Zone } from '../../core/models/network.model';
import { prefersReducedMotion } from '../../core/theme/color-scheme.service';
import { searchLines, searchStops, searchZones } from '../../core/search/search';
import { SimpleModeService } from '../../core/settings/simple-mode.service';
import { DataStatusBannerComponent } from '../../shared/data-status-banner/data-status-banner.component';
import { LineListComponent } from '../../shared/line-list/line-list.component';
import { StopListComponent } from '../../shared/stop-list/stop-list.component';

const MAX_STOP_RESULTS = 30;

@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    TranslocoPipe,
    DataStatusBannerComponent,
    LineListComponent,
    StopListComponent,
    IonContent,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonSearchbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './home.page.scss',
  templateUrl: './home.page.html',
})
export class HomePage {
  private readonly network = inject(NetworkRepository);

  /** En modo sencillo el inicio son solo listas: sin acceso al mapa. */
  protected readonly simpleMode = inject(SimpleModeService).active;
  protected readonly query = signal('');
  protected readonly searching = computed(() => this.query().trim().length > 0);
  protected readonly lineResults = computed(() =>
    searchLines(this.network.lines(), this.query(), Infinity),
  );
  private readonly allStopResults = computed(() =>
    searchStops(this.network.stops(), this.query(), Infinity),
  );
  /** Se pintan pocas paradas para que la búsqueda sea fluida; la lista completa está en Paradas. */
  protected readonly stopResults = computed(() => this.allStopResults().slice(0, MAX_STOP_RESULTS));
  protected readonly totalStopResults = computed(() => this.allStopResults().length);
  /** Barrios y distritos: elegir uno abre el mapa con la zona marcada. */
  private readonly zonesStore = inject(ZonesStore);
  protected readonly zoneResults = computed(() =>
    searchZones(this.zonesStore.zones(), this.query()),
  );

  protected readonly lineCount = computed(() => this.network.lines().length);
  protected readonly stopCount = computed(() => this.network.stops().length);

  private readonly content = viewChild(IonContent);

  constructor() {
    // Las zonas se descargan al empezar a buscar, no al abrir la app.
    effect(() => {
      if (this.searching()) void this.zonesStore.load();
    });
  }

  /** Vuelve al menú de inicio desde la búsqueda. */
  protected resetHome(): void {
    this.setQuery('');
    void this.content()?.scrollToTop(prefersReducedMotion() ? 0 : 300);
  }

  protected setQuery(value: string): void {
    this.query.set(value);
  }

  protected zoneKindKey(kind: Zone['kind']): string {
    return `map.zoneKind.${kind}`;
  }
}
