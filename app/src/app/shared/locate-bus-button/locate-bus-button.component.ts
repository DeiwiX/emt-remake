import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IonButton, IonIcon } from '@ionic/angular';

import { NetworkRepository } from '../../core/data/repositories';
import { metresBetween } from '../../core/location/geo';
import { Stop } from '../../core/models/network.model';
import { LiveContextService } from '../../core/realtime/live-context.service';
import { MAX_AGE_MINUTES, ageMinutes, estimateArrivals } from '../../core/realtime/realtime';
import { RealtimeService } from '../../core/realtime/realtime.service';

/**
 * "Ubicar bus más cercano": abre el Mapa siguiendo el autobús que antes llega a
 * la parada (de cualquiera de sus líneas), según el tiempo real. Si ninguno
 * viene de camino (p. ej. en una parada de cabecera o cuando acaban de pasar),
 * el de sus líneas que está más cerca. Solo en la app del móvil.
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
    @if (available) {
      @if (nearestBus(); as bus) {
        <ion-button [size]="size()" [routerLink]="['/map']" [queryParams]="{ bus: bus.vehicleId }">
          <ion-icon slot="start" name="bus-outline" aria-hidden="true" />
          @if (bus.minutes !== null) {
            {{ 'near.locateBus' | transloco: { line: bus.lineId, minutes: bus.minutes } }}
          } @else {
            {{ 'near.locateBusNear' | transloco: { line: bus.lineId, metres: bus.metres } }}
          }
        </ion-button>
      } @else if (loaded()) {
        <ion-button [size]="size()" disabled>{{ 'near.noBus' | transloco }}</ion-button>
      }
    }
  `,
})
export class LocateBusButtonComponent {
  private readonly network = inject(NetworkRepository);
  private readonly realtime = inject(RealtimeService);
  private readonly live = inject(LiveContextService);

  readonly stop = input.required<Stop>();
  readonly size = input<'small' | 'default'>('default');

  protected readonly available = this.realtime.available;
  protected readonly loaded = this.realtime.hasData;

  constructor() {
    this.realtime.watch();
  }

  protected readonly nearestBus = computed(() => {
    const stop = this.stop();
    let best: { vehicleId: string; lineId: string; minutes: number | null; metres: number } | null =
      null;
    for (const service of stop.services) {
      const direction = this.network
        .getLine(service.lineId)
        ?.directions.find((d) => d.id === service.directionId);
      if (!direction) continue;
      const [first] = estimateArrivals(
        this.realtime.vehicles(),
        service.lineId,
        direction,
        direction.stopIds.indexOf(stop.id),
        this.realtime.now(),
        this.live.context(),
      );
      if (first && (best?.minutes == null || first.minutes < best.minutes)) {
        best = {
          vehicleId: first.vehicleId,
          lineId: service.lineId,
          minutes: first.minutes,
          metres: 0,
        };
      }
    }
    if (best) return best;
    const lines = new Set(stop.services.map((s) => s.lineId));
    const now = this.realtime.now();
    for (const vehicle of this.realtime.vehicles()) {
      if (!lines.has(vehicle.lineId)) continue;
      const age = ageMinutes(vehicle, now);
      if (age === null || age > MAX_AGE_MINUTES) continue;
      const metres = Math.round(metresBetween([stop.lat, stop.lon], [vehicle.lat, vehicle.lon]));
      if (!best || metres < best.metres) {
        best = { vehicleId: vehicle.id, lineId: vehicle.lineId, minutes: null, metres };
      }
    }
    return best;
  });
}
