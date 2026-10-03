import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { DataStatusService, NetworkRepository } from '../../core/data/repositories';
import { DataStatusBannerComponent } from '../../shared/data-status-banner/data-status-banner.component';
import { LineBadgeComponent } from '../../shared/line-badge/line-badge.component';

/** Detalle de línea en texto (RF-03): sentidos y paradas en orden. El mapa llega en el incremento 5. */
@Component({
  selector: 'app-line-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    DataStatusBannerComponent,
    LineBadgeComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .heading {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .heading h1 {
      margin: 0;
      font-size: 1.25rem;
    }
    .directions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .directions ion-button {
      flex: 1 1 10rem;
      min-height: 44px;
      text-transform: none;
      white-space: normal;
    }
  `,
  templateUrl: './line-detail.page.html',
})
export class LineDetailPage {
  private readonly network = inject(NetworkRepository);
  private readonly dataStatus = inject(DataStatusService);

  /** Parámetros de la ruta (/lines/:lineId?direction=2), enlazados por withComponentInputBinding. */
  readonly lineId = input.required<string>();
  readonly direction = input<string>();

  protected readonly line = computed(() => {
    // Se lee lines() para recalcular cuando llegan los datos.
    this.network.lines();
    return this.network.getLine(this.lineId());
  });
  protected readonly notFound = computed(
    () => this.dataStatus.status().state === 'ready' && !this.line(),
  );

  protected readonly selectedDirectionId = linkedSignal(() => {
    const directions = this.line()?.directions ?? [];
    const requested = Number(this.direction());
    return directions.some((d) => d.id === requested) ? requested : (directions[0]?.id ?? 1);
  });

  protected readonly selectedDirection = computed(() =>
    this.line()?.directions.find((d) => d.id === this.selectedDirectionId()),
  );

  protected readonly stops = computed(() =>
    (this.selectedDirection()?.stopIds ?? []).map((id) => ({
      id,
      name: this.network.getStop(id)?.name ?? id,
    })),
  );
}
