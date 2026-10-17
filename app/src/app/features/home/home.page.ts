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
import { EmtNoticesComponent } from '../../shared/emt-notices/emt-notices.component';
import { DataDateComponent } from '../../shared/data-date/data-date.component';

import { NetworkRepository } from '../../core/data/repositories';
import { ZonesStore } from '../../core/data/zones-store.service';
import { StreetsStore } from '../../core/data/streets-store.service';
import { FavoritesService } from '../../core/favorites/favorites.service';
import { Zone } from '../../core/models/network.model';
import { prefersReducedMotion } from '../../core/theme/color-scheme.service';
import { searchLines, searchStops, searchStreets, searchZones } from '../../core/search/search';
import { SimpleModeService } from '../../core/settings/simple-mode.service';
import { DataStatusBannerComponent } from '../../shared/data-status-banner/data-status-banner.component';
import { LineListComponent } from '../../shared/line-list/line-list.component';
import { StopListComponent } from '../../shared/stop-list/stop-list.component';
import { ActiveAlertStripComponent } from './active-alert-strip.component';
import { FavoritesSectionComponent } from './favorites-section.component';
import { SearchbarLabelDirective } from '../../shared/searchbar-label/searchbar-label.directive';
import { NoticesService } from '../../core/notices/notices.service';
import { closedNoticesFabVisible } from '../../core/notices/notices';
import { NoticesFabComponent } from './notices-fab.component';

const MAX_STOP_RESULTS = 30;

@Component({
  selector: 'app-home',
  imports: [
    NoticesFabComponent,
    SearchbarLabelDirective,
    DataDateComponent,
    EmtNoticesComponent,
    RouterLink,
    TranslocoPipe,
    DataStatusBannerComponent,
    LineListComponent,
    StopListComponent,
    ActiveAlertStripComponent,
    FavoritesSectionComponent,
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

  private readonly favorites = inject(FavoritesService).favorites;
  protected readonly hasFavorites = computed(() => this.favorites().length > 0);
  private readonly noticesService = inject(NoticesService);
  /** Avisos de la EMT cerrados que siguen vigentes (triángulo rojo en el lateral). */
  protected readonly closedNotices = computed(() =>
    this.noticesService.dismissedFor(this.favoriteLineIds()).map((n) => n.id),
  );
  protected readonly showNoticesFab = computed(() =>
    closedNoticesFabVisible(this.closedNotices(), this.noticesService.fabRemovedFor()),
  );

  /**
   * El inicio se ve: Ionic guarda la página al ir a otra, y el triángulo (que va
   * al final del documento) solo debe estar sobre el inicio.
   */
  protected readonly onScreen = signal(true);
  ionViewWillEnter(): void {
    this.onScreen.set(true);
  }
  ionViewWillLeave(): void {
    this.onScreen.set(false);
  }

  /** Tirado a la papelera: no vuelve hasta que se cierre otro aviso. */
  protected removeNoticesFab(): void {
    this.noticesService.removeFab(this.closedNotices());
  }

  /** Lleva a los avisos cerrados, abajo del todo. */
  protected goToClosedNotices(): void {
    const target = document.getElementById('closed-notices');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target?.querySelector<HTMLElement>('a')?.focus({ preventScroll: true });
  }

  /** Líneas guardadas y las de las paradas guardadas: sus avisos de la EMT salen en el inicio. */
  protected readonly favoriteLineIds = computed(() => {
    const stops = new Map(this.network.stops().map((s) => [s.id, s]));
    return [
      ...new Set(
        this.favorites().flatMap((f) =>
          f.kind === 'line'
            ? [f.lineId]
            : f.kind === 'stop'
              ? (stops.get(f.stopId)?.services ?? []).map((s) => s.lineId)
              : [],
        ),
      ),
    ];
  });
  /** Calles (también "calle + número"): elegir una abre el mapa con sus paradas cercanas. */
  private readonly streetsStore = inject(StreetsStore);
  protected readonly streetResults = computed(() =>
    searchStreets(this.streetsStore.streets(), this.query(), 6),
  );

  protected readonly lineCount = computed(
    () => this.network.lines().filter((l) => l.mode !== 'metro').length,
  );
  /** Fase 11: hay metro en los datos publicados (tarjeta "Metro"). */
  protected readonly hasMetro = computed(() =>
    this.network.lines().some((l) => l.mode === 'metro'),
  );
  protected readonly stopCount = computed(() => this.network.stops().length);

  private readonly content = viewChild(IonContent);

  constructor() {
    // Las zonas se descargan al empezar a buscar, no al abrir la app.
    effect(() => {
      if (this.searching()) {
        void this.zonesStore.load();
        void this.streetsStore.load();
      }
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
