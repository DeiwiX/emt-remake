import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IonItem, IonLabel, IonList } from '@ionic/angular';

import { Stop } from '../../core/models/network.model';

/** Lista de paradas enlazadas a su detalle. Se usa en la lista completa y en la búsqueda. */
@Component({
  selector: 'app-stop-list',
  imports: [RouterLink, TranslocoPipe, IonItem, IonLabel, IonList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-list [attr.aria-label]="label()">
      @for (stop of stops(); track stop.id) {
        <ion-item [routerLink]="['/stops', stop.id]" detail>
          <ion-label class="ion-text-wrap">
            {{ stop.name }}
            <p>
              {{ 'stops.code' | transloco: { id: stop.id } }} ·
              {{ 'stops.servedBy' | transloco: { lines: lineCodes(stop) } }}
            </p>
          </ion-label>
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
