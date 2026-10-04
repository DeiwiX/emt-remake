import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IonIcon } from '@ionic/angular';

import { NetworkRepository } from '../../core/data/repositories';
import { placeParam } from '../../core/favorites/favorites';
import { FavoritesService } from '../../core/favorites/favorites.service';
import { Stop } from '../../core/models/network.model';
import { LineBadgeComponent } from '../../shared/line-badge/line-badge.component';
import { NextBusComponent } from '../../shared/next-bus/next-bus.component';

/**
 * "Mis favoritos" en el inicio: cada parada con los próximos buses de sus
 * líneas, los trayectos de "Cómo llegar" y las líneas guardadas.
 */
@Component({
  selector: 'app-favorites-section',
  imports: [RouterLink, TranslocoPipe, IonIcon, LineBadgeComponent, NextBusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    h2 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 4px 0 0;
      font-size: 1.15rem;
      font-weight: 700;
    }
    h2 ion-icon {
      color: #b06a00;
    }
    h3 {
      margin: 4px 0 0;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--muted);
    }
    ul {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .card {
      display: block;
      padding: 12px 14px;
      border-radius: 16px;
      background: var(--card);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      color: var(--ion-text-color);
      text-decoration: none;
    }
    .card:focus-visible,
    .line:focus-visible {
      outline: 3px solid var(--ion-color-primary);
      outline-offset: 2px;
    }
    .stop-name {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      font-weight: 700;
      color: inherit;
      text-decoration: none;
    }
    .stop-name small {
      font-weight: 400;
      color: var(--muted);
    }
    .service {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-top: 10px;
    }
    .service-text {
      display: flex;
      flex-direction: column;
      font-size: 0.9rem;
    }
    .trip {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 600;
    }
    .trip ion-icon {
      margin-inline-start: auto;
      font-size: 1.2rem;
    }
    .lines {
      flex-direction: row;
      flex-wrap: wrap;
      gap: 8px;
    }
    .line {
      display: block;
      border-radius: 10px;
    }
    .line app-line-badge {
      min-width: 3.25rem;
      min-height: 2.75rem;
      font-size: 1.05rem;
    }
  `,
  template: `
    <h2><ion-icon name="star" aria-hidden="true" />{{ 'favorites.title' | transloco }}</h2>

    @if (stops().length > 0) {
      <h3>{{ 'favorites.stops' | transloco }}</h3>
      <ul>
        @for (stop of stops(); track stop.id) {
          <li class="card">
            <a class="stop-name" [routerLink]="['/stops', stop.id]">
              {{ stop.name }}
              <small>{{ 'stops.code' | transloco: { id: stop.id } }}</small>
            </a>
            @for (service of servicesOf(stop); track service.lineId + '-' + service.directionId) {
              <div class="service">
                <app-line-badge [code]="service.lineId" />
                <span class="service-text">
                  <span class="visually-hidden"
                    >{{ 'lines.line' | transloco: { id: service.lineId } }}.</span
                  >
                  {{ 'lineDetail.towards' | transloco: { headsign: service.headsign } }}
                  <app-next-bus
                    [lineId]="service.lineId"
                    [directionId]="service.directionId"
                    [stopId]="stop.id"
                  />
                </span>
              </div>
            }
          </li>
        }
      </ul>
    }

    @if (trips().length > 0) {
      <h3>{{ 'favorites.trips' | transloco }}</h3>
      <ul>
        @for (trip of trips(); track trip.key) {
          <li>
            <a class="card trip" routerLink="/plan" [queryParams]="trip.params">
              <span>{{ trip.origin }} → {{ trip.destination }}</span>
              <ion-icon name="arrow-forward" aria-hidden="true" />
            </a>
          </li>
        }
      </ul>
    }

    @if (lines().length > 0) {
      <h3>{{ 'favorites.lines' | transloco }}</h3>
      <ul class="lines">
        @for (line of lines(); track line.id) {
          <li>
            <a
              class="line"
              [routerLink]="['/lines', line.id]"
              [attr.aria-label]="('lines.line' | transloco: { id: line.id }) + ': ' + line.name"
            >
              <app-line-badge [code]="line.id" />
            </a>
          </li>
        }
      </ul>
    }
  `,
})
export class FavoritesSectionComponent {
  private readonly network = inject(NetworkRepository);
  private readonly favorites = inject(FavoritesService);

  /** Paradas guardadas que siguen existiendo en los datos actuales. */
  protected readonly stops = computed(() => {
    this.network.stops();
    return this.favorites
      .stops()
      .map((id) => this.network.getStop(id))
      .filter((stop): stop is Stop => !!stop);
  });

  protected readonly lines = computed(() => {
    this.network.lines();
    return this.favorites
      .lines()
      .map((id) => this.network.getLine(id))
      .filter((line) => !!line);
  });

  protected readonly trips = computed(() =>
    this.favorites.trips().map((trip) => ({
      key: `${placeParam(trip.origin)}>${placeParam(trip.destination)}`,
      origin: trip.origin.name,
      destination: trip.destination.name,
      params: { from: placeParam(trip.origin), to: placeParam(trip.destination) },
    })),
  );

  protected servicesOf(stop: Stop) {
    return stop.services.map((service) => ({
      ...service,
      headsign:
        this.network.getLine(service.lineId)?.directions.find((d) => d.id === service.directionId)
          ?.headsign ?? '',
    }));
  }
}
