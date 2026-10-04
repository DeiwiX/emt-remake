import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IonItem, IonList } from '@ionic/angular';

import { Stop } from '../../core/models/network.model';
import { FavoriteButtonComponent } from '../favorite-button/favorite-button.component';

/**
 * Lista de paradas enlazadas a su detalle, con la estrella para guardarlas sin
 * entrar (enlace y botón separados: no se anidan elementos pulsables).
 */
@Component({
  selector: 'app-stop-list',
  imports: [RouterLink, TranslocoPipe, IonItem, IonList, FavoriteButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .stop-link {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 2px;
      min-height: 44px;
      padding: 10px 0;
      color: var(--ion-text-color);
      text-decoration: none;
    }
    .stop-link:focus-visible {
      outline: 3px solid var(--ion-color-primary);
      outline-offset: 2px;
    }
    .stop-meta {
      font-size: 0.875rem;
      color: var(--ion-color-step-600, var(--ion-text-color-step-400, #666));
    }
  `,
  template: `
    <ion-list [attr.aria-label]="label()">
      @for (stop of stops(); track stop.id) {
        <ion-item>
          <a class="stop-link" [routerLink]="['/stops', stop.id]">
            <span>{{ stop.name }}</span>
            <span class="stop-meta">
              {{ 'stops.code' | transloco: { id: stop.id } }} ·
              {{ 'stops.servedBy' | transloco: { lines: lineCodes(stop) } }}
            </span>
          </a>
          <app-favorite-button
            slot="end"
            [favorite]="{ kind: 'stop', stopId: stop.id }"
            [label]="'favorites.stopLabel' | transloco: { name: stop.name }"
          />
        </ion-item>
      }
    </ion-list>
  `,
})
export class StopListComponent {
  readonly stops = input.required<readonly Stop[]>();
  readonly label = input<string>();

  protected lineCodes(stop: Stop): string {
    return [...new Set(stop.services.map((s) => s.lineId))].join(', ');
  }
}
