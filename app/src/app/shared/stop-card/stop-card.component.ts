import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IonButton } from '@ionic/angular';

import { NetworkRepository } from '../../core/data/repositories';
import { Stop } from '../../core/models/network.model';
import { LineBadgeComponent } from '../line-badge/line-badge.component';
import { NextBusComponent } from '../next-bus/next-bus.component';

/**
 * Ficha de una parada elegida en un mapa (Mapa y Paradas): sus líneas con el
 * destino de cada sentido y el próximo bus según horario, y el acceso al detalle.
 */
@Component({
  selector: 'app-stop-card',
  imports: [RouterLink, TranslocoPipe, IonButton, LineBadgeComponent, NextBusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      padding: 8px 16px;
      border-bottom: 1px solid var(--ion-border-color, #ccc);
    }
    h2 {
      margin: 8px 0 4px;
      font-size: 1.2rem;
    }
    p {
      margin: 0;
    }
    ul {
      list-style: none;
      margin: 8px 0;
      padding: 0;
    }
    li {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 0;
    }
    .service-text {
      display: flex;
      flex-direction: column;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
  `,
  template: `
    <div aria-live="polite">
      <h2>{{ stop().name }}</h2>
      <p>{{ 'stops.code' | transloco: { id: stop().id } }}</p>
      <ul>
        @for (service of services(); track service.lineId + '-' + service.directionId) {
          <li>
            <app-line-badge [code]="service.lineId" />
            <span class="service-text">
              <span class="visually-hidden"
                >{{ 'lines.line' | transloco: { id: service.lineId } }}.</span
              >
              {{ 'lineDetail.towards' | transloco: { headsign: service.headsign } }}
              <app-next-bus
                [lineId]="service.lineId"
                [directionId]="service.directionId"
                [stopId]="stop().id"
              />
            </span>
          </li>
        }
      </ul>
      <div class="actions">
        <ion-button [routerLink]="['/stops', stop().id]">{{
          'map.openStopDetail' | transloco
        }}</ion-button>
        <ion-button fill="outline" (click)="closed.emit()">{{
          'map.clearStop' | transloco
        }}</ion-button>
      </div>
    </div>
  `,
})
export class StopCardComponent {
  private readonly network = inject(NetworkRepository);

  readonly stop = input.required<Stop>();
  readonly closed = output();

  /** Líneas que pasan por la parada, con el destino de cada sentido. */
  protected readonly services = computed(() =>
    this.stop().services.map((service) => ({
      ...service,
      headsign:
        this.network.getLine(service.lineId)?.directions.find((d) => d.id === service.directionId)
          ?.headsign ?? '',
    })),
  );
}
