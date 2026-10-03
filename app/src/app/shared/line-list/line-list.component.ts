import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IonItem, IonLabel, IonList } from '@ionic/angular';

import { Line } from '../../core/models/network.model';
import { LineBadgeComponent } from '../line-badge/line-badge.component';

/** Lista de líneas enlazadas a su detalle. Se usa en la lista completa y en la búsqueda. */
@Component({
  selector: 'app-line-list',
  imports: [RouterLink, TranslocoPipe, IonItem, IonLabel, IonList, LineBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-list [attr.aria-label]="label()">
      @for (line of lines(); track line.id) {
        <ion-item [routerLink]="['/lines', line.id]" detail>
          <app-line-badge slot="start" [code]="line.id" />
          <ion-label class="ion-text-wrap">
            <span class="visually-hidden">{{ 'lines.line' | transloco: { id: line.id } }}.</span>
            {{ line.name }}
          </ion-label>
        </ion-item>
      }
    </ion-list>
  `,
})
export class LineListComponent {
  readonly lines = input.required<readonly Line[]>();
  readonly label = input<string>();
}
