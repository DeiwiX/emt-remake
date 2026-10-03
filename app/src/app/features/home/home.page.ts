import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IonContent, IonIcon, IonNote, IonSearchbar } from '@ionic/angular';

import { NetworkRepository } from '../../core/data/repositories';
import { ScheduleClockService } from '../../core/schedule/schedule-clock.service';
import { searchLines, searchStops } from '../../core/search/search';
import { DataStatusBannerComponent } from '../../shared/data-status-banner/data-status-banner.component';
import { LineBadgeComponent } from '../../shared/line-badge/line-badge.component';
import { LineListComponent } from '../../shared/line-list/line-list.component';
import { StopListComponent } from '../../shared/stop-list/stop-list.component';

const MAX_STOP_RESULTS = 30;

@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    TranslocoPipe,
    DataStatusBannerComponent,
    LineBadgeComponent,
    LineListComponent,
    StopListComponent,
    IonContent,
    IonIcon,
    IonNote,
    IonSearchbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './home.page.scss',
  templateUrl: './home.page.html',
})
export class HomePage {
  private readonly network = inject(NetworkRepository);
  private readonly clock = inject(ScheduleClockService).clock;

  protected readonly lines = this.network.lines;
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

  /** Saludo según la hora de Málaga: mañana (6–13), tarde (13–21) o noche. */
  protected readonly greetingKey = computed(() => {
    const hour = Math.floor(this.clock().minutes / 60);
    if (hour >= 6 && hour < 13) return 'home.greeting.morning';
    if (hour >= 13 && hour < 21) return 'home.greeting.afternoon';
    return 'home.greeting.night';
  });
}
