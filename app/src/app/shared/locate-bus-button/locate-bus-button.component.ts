import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IonButton, IonIcon } from '@ionic/angular';

import { Stop } from '../../core/models/network.model';
import { approachingBus } from '../../core/realtime/realtime';
import { RealtimeService } from '../../core/realtime/realtime.service';

/**
 * "Ubicar bus más cercano": abre el Mapa siguiendo el autobús que antes llega a
 * la parada (de cualquiera de sus líneas, en el sentido que pasa por ella),
 * según el tiempo real de la EMT. Solo autobuses que van hacia la parada: nunca
 * uno que ya ha pasado o va en sentido contrario. Solo en la app del móvil.
 */
@Component({
  selector: 'app-locate-bus-button',
  imports: [RouterLink, TranslocoPipe, IonButton, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: contents;
    }
  `,
  template: `
    <!-- El metro no tiene tiempo real: no hay bus que ubicar. -->
    @if (available && stop().mode !== 'metro') {
      @if (nearestBus(); as bus) {
        <ion-button [size]="size()" [routerLink]="['/map']" [queryParams]="{ bus: bus.vehicleId }">
          <ion-icon slot="start" name="bus-outline" aria-hidden="true" />
          @if (bus.minutes !== null) {
            {{ 'near.locateBus' | transloco: { line: bus.lineId, minutes: bus.minutes } }}
          } @else {
            {{ 'near.locateBusStops' | transloco: { line: bus.lineId, stops: bus.stopsAway } }}
          }
        </ion-button>
      } @else if (loaded()) {
        <ion-button [size]="size()" disabled>{{ 'near.noBus' | transloco }}</ion-button>
      }
    }
  `,
})
export class LocateBusButtonComponent {
  private readonly realtime = inject(RealtimeService);

  readonly stop = input.required<Stop>();
  readonly size = input<'small' | 'default'>('default');

  protected readonly available = this.realtime.available;
  protected readonly loaded = this.realtime.hasData;

  constructor() {
    this.realtime.watch();
  }

  protected readonly nearestBus = computed(() =>
    approachingBus(
      this.realtime.trips(),
      this.stop().services,
      this.stop().id,
      this.realtime.now(),
    ),
  );
}
