import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IonButton, IonIcon, IonItem, IonLabel, IonList, IonSearchbar } from '@ionic/angular';

import { NetworkRepository } from '../../core/data/repositories';
import { stopsNear } from '../../core/location/geo';
import { LocationService } from '../../core/location/location.service';
import { Zone } from '../../core/models/network.model';
import { Place } from '../../core/planner/planner';
import { searchStops, searchZones } from '../../core/search/search';

const MAX_RESULTS = 6;

/**
 * Selector de origen o destino para "Cómo llegar": busca paradas (por nombre o
 * código) y barrios o distritos, y, como origen, "Mi ubicación" (las paradas
 * cercanas con lo que se tarda en llegar andando a cada una).
 */
@Component({
  selector: 'app-place-picker',
  imports: [TranslocoPipe, IonButton, IonIcon, IonItem, IonLabel, IonList, IonSearchbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .chosen {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 12px;
      background: var(--ion-color-step-50, var(--ion-background-color-step-50, #f4f5f8));
    }
    .chosen-text {
      display: flex;
      flex-direction: column;
    }
    .kind {
      font-size: 0.85rem;
      color: var(--ion-color-step-600, var(--ion-text-color-step-400, #666));
    }
    .location-error {
      margin: 4px 0 8px;
      font-size: 0.9rem;
    }
  `,
  template: `
    @if (place(); as chosen) {
      <div class="chosen">
        <span class="chosen-text">
          <span class="kind">{{ label() }} · {{ kindKey(chosen) | transloco }}</span>
          <strong>{{ chosen.name }}</strong>
        </span>
        <ion-button fill="clear" (click)="placeChange.emit(null)">
          {{ 'plan.change' | transloco }}
          <span class="visually-hidden">{{ label() }}</span>
        </ion-button>
      </div>
    } @else {
      @if (allowLocation()) {
        <ion-button fill="outline" size="small" [disabled]="locating()" (click)="useMyLocation()">
          <ion-icon slot="start" name="navigate-outline" aria-hidden="true" />
          {{ (locating() ? 'near.locating' : 'plan.useMyLocation') | transloco }}
        </ion-button>
        @if (locationError(); as error) {
          <p class="location-error" role="alert">{{ error | transloco }}</p>
        }
      }
      <ion-searchbar
        [placeholder]="label() + ': ' + ('plan.searchPlaceholder' | transloco)"
        [attr.aria-label]="label()"
        [debounce]="150"
        (ionInput)="query.set($event.detail.value ?? '')"
      />
      @if (results().length > 0) {
        <ion-list [attr.aria-label]="label()">
          @for (result of results(); track result.kind + result.id) {
            <ion-item button [detail]="false" (click)="choose(result)">
              <ion-label class="ion-text-wrap">
                {{ result.name }}
                <p>
                  {{ kindKey(result) | transloco }} ·
                  @if (result.kind === 'stop') {
                    {{ 'stops.code' | transloco: { id: result.id } }}
                  } @else {
                    {{ 'home.stopCount' | transloco: { count: result.stopIds.length } }}
                  }
                </p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      }
    }
  `,
})
export class PlacePickerComponent {
  private readonly network = inject(NetworkRepository);

  readonly label = input.required<string>();
  readonly place = input<Place | null>(null);
  readonly zones = input<readonly Zone[]>([]);
  readonly placeChange = output<Place | null>();
  /** Ofrece "Mi ubicación" (solo como origen). */
  readonly allowLocation = input(false);

  private readonly location = inject(LocationService);
  private readonly transloco = inject(TranslocoService);
  protected readonly locating = signal(false);
  protected readonly locationError = signal<string | null>(null);

  protected readonly query = signal('');
  /** Primero las zonas (lo más útil como destino) y después las paradas. */
  protected readonly results = computed<Place[]>(() => {
    const query = this.query();
    const zones = searchZones(this.zones(), query, MAX_RESULTS).map((zone): Place => ({
      kind: zone.kind,
      id: zone.id,
      name: zone.name,
      stopIds: zone.stopIds,
    }));
    const stops = searchStops(this.network.stops(), query, MAX_RESULTS).map((stop): Place => ({
      kind: 'stop',
      id: stop.id,
      name: stop.name,
      stopIds: [stop.id],
    }));
    return [...zones, ...stops];
  });

  protected choose(place: Place): void {
    this.query.set('');
    this.placeChange.emit(place);
  }

  /** Texto del tipo de lugar: parada, barrio, distrito o tu ubicación. */
  protected kindKey(place: Place): string {
    if (place.kind === 'location') return 'plan.kind.location';
    return place.kind === 'stop' ? 'plan.kind.stop' : `map.zoneKind.${place.kind}`;
  }

  /** Pide la ubicación y propone como origen las paradas cercanas (500 m, o 1 km). */
  protected async useMyLocation(): Promise<void> {
    this.locating.set(true);
    this.locationError.set(null);
    await this.location.locate();
    this.locating.set(false);
    const state = this.location.state();
    if (state.status !== 'ready') {
      this.locationError.set(state.status === 'denied' ? 'near.denied' : 'near.unavailable');
      return;
    }
    const near = stopsNear(this.network.stops(), state.point);
    if (near.stops.length === 0) {
      this.locationError.set('plan.noStopsNearYou');
      return;
    }
    this.choose({
      kind: 'location',
      id: 'me',
      name: this.transloco.translate('plan.myLocation'),
      stopIds: near.stops.map((s) => s.stop.id),
      accessMinutes: new Map(near.stops.map((s) => [s.stop.id, s.minutes])),
    });
  }
}
