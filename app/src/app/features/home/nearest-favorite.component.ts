import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IonIcon } from '@ionic/angular';

import { NetworkRepository } from '../../core/data/repositories';
import { FavoritesService } from '../../core/favorites/favorites.service';
import { metresBetween } from '../../core/location/geo';
import { LocationService } from '../../core/location/location.service';
import { Stop } from '../../core/models/network.model';
import { FavoriteStopTileComponent } from './favorite-stop-tile.component';

/**
 * Tu parada (05/10/2026): la favorita más cercana a ti, desplegada con sus
 * próximos buses y los botones de ubicar bus y avisar. La ubicación solo se
 * pide si el usuario toca "¿Cuál tengo más cerca?" (o ya se pidió en esta
 * sesión); si no, es la primera favorita.
 */
@Component({
  selector: 'app-nearest-favorite',
  imports: [TranslocoPipe, IonIcon, FavoriteStopTileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .label {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 10px;
      margin: 0;
      color: var(--muted);
      font-size: 0.9rem;
    }
    .label ion-icon {
      color: var(--app-accent);
    }
    button {
      min-height: 44px;
      padding: 0 4px;
      border: 0;
      background: transparent;
      color: var(--ion-color-primary);
      font: inherit;
      font-weight: 600;
      text-decoration: underline;
      cursor: pointer;
    }
  `,
  template: `
    @if (featured(); as featured) {
      <p class="label">
        <ion-icon name="star" aria-hidden="true" />
        @if (featured.metres !== null) {
          {{ 'home.nearestFavorite' | transloco: { metres: featured.metres } }}
        } @else {
          {{ 'home.yourStop' | transloco }}
          @if (stopCount() > 1 && location) {
            <button type="button" (click)="locate()">
              {{ 'home.whichIsNearest' | transloco }}
            </button>
          }
        }
      </p>
      <app-favorite-stop-tile [stop]="featured.stop" [expanded]="true" />
    }
  `,
})
export class NearestFavoriteComponent {
  private readonly favorites = inject(FavoritesService).favorites;
  private readonly network = inject(NetworkRepository);
  protected readonly location = inject(LocationService, { optional: true });

  private readonly stops = computed(() =>
    this.favorites()
      .flatMap((f) => (f.kind === 'stop' ? [this.network.getStop(f.stopId)] : []))
      .filter((s): s is Stop => !!s),
  );
  protected readonly stopCount = computed(() => this.stops().length);

  protected readonly featured = computed(() => {
    const stops = this.stops();
    if (stops.length === 0) return null;
    const state = this.location?.state();
    if (state?.status !== 'ready') return { stop: stops[0]!, metres: null };
    let best = { stop: stops[0]!, metres: Infinity };
    for (const stop of stops) {
      const metres = metresBetween(state.point, [stop.lat, stop.lon]);
      if (metres < best.metres) best = { stop, metres };
    }
    return { stop: best.stop, metres: Math.round(best.metres / 10) * 10 };
  });

  protected locate(): void {
    void this.location?.locate();
  }
}
