import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonNote,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { NetworkRepository } from '../../core/data/repositories';
import { searchLines, searchStops } from '../../core/search/search';
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
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonNote,
    IonSearchbar,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './home.page.scss',
  templateUrl: './home.page.html',
})
export class HomePage {
  private readonly network = inject(NetworkRepository);
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
  protected readonly lineCount = computed(() => this.network.lines().length);
  protected readonly stopCount = computed(() => this.network.stops().length);
}
