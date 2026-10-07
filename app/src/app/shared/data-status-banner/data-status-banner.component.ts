import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IonButton, IonNote } from '@ionic/angular';

import { DataStatusService } from '../../core/data/repositories';
import { shortDate } from '../data-date/short-date';

/**
 * Estado de los datos visible en pantalla (RF-08, RF-09): carga, ausencia de
 * datos o aviso de que pueden estar desactualizados, con opción de reintentar.
 */
@Component({
  selector: 'app-data-status-banner',
  imports: [TranslocoPipe, IonButton, IonNote],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin: 8px 16px;
      padding: 8px 12px;
      border-radius: 8px;
    }
    .warning {
      background: var(--ion-color-warning-tint);
      color: var(--ion-color-warning-contrast);
    }
    .warning p,
    .unavailable p {
      flex: 1 1 16rem;
      margin: 0;
    }
  `,
  template: `
    <div role="status">
      @switch (view().kind) {
        @case ('loading') {
          <p class="ion-padding-horizontal">
            <ion-note>{{ 'data.loading' | transloco }}</ion-note>
          </p>
        }
        @case ('unavailable') {
          <div class="banner warning unavailable">
            <p>{{ 'data.unavailable' | transloco }}</p>
            <ion-button size="default" (click)="retry()">{{
              'common.retry' | transloco
            }}</ion-button>
          </div>
        }
        @case ('outdated') {
          <div class="banner warning">
            <p>{{ 'data.outdated' | transloco: { date: view().date } }}</p>
            <ion-button size="default" [disabled]="view().checking" (click)="retry()">
              {{ 'common.retry' | transloco }}
            </ion-button>
          </div>
        }
        <!-- Con los datos al día no se dice nada: la fecha va en la cabecera. -->
      }
    </div>
  `,
})
export class DataStatusBannerComponent {
  private readonly dataStatus = inject(DataStatusService);

  protected readonly view = computed(() => {
    const status = this.dataStatus.status();
    if (status.state === 'loading') return { kind: 'loading' as const, date: '', checking: true };
    if (status.state === 'unavailable')
      return { kind: 'unavailable' as const, date: '', checking: false };
    const date = shortDate(status.generatedAt);
    return {
      kind: status.updateFailed ? ('outdated' as const) : ('current' as const),
      date,
      checking: status.checking,
    };
  });

  protected retry(): void {
    void this.dataStatus.refresh();
  }
}
