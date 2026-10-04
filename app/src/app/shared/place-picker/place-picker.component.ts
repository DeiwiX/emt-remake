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
import { StreetsStore } from '../../core/data/streets-store.service';
import { placeForStreet } from '../../core/location/street-place';
import { stopsNear } from '../../core/location/geo';
import { LocationService } from '../../core/location/location.service';
import { Zone } from '../../core/models/network.model';
import { Place } from '../../core/planner/planner';
import { searchStops, searchStreets, searchZones } from '../../core/search/search';

const MAX_RESULTS = 6;

/** Una opción de la lista de resultados; el lugar se calcula solo al elegirla. */
interface Option {
  readonly key: string;
  readonly name: string;
  readonly kindKey: string;
  /** Segunda línea: código de parada o número de paradas de la zona. */
  readonly detail: { readonly key: string; readonly params: Record<string, unknown> } | null;
  readonly toPlace: () => Place;
}

/**
 * Selector de origen o destino para "Cómo llegar": busca barrios o distritos,
 * calles (también "calle + número") y paradas (por nombre o código), y, como
 * origen, "Mi ubicación" (las paradas cercanas con lo que se tarda andando).
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
        (ionInput)="setQuery($event.detail.value ?? '')"
      />
      @if (results().length > 0) {
        <ion-list [attr.aria-label]="label()">
          @for (result of results(); track result.key) {
            <ion-item button [detail]="false" (click)="choose(result.toPlace())">
              <ion-label class="ion-text-wrap">
                {{ result.name }}
                <p>
                  {{ result.kindKey | transloco }}
                  @if (result.detail; as detail) {
                    · {{ detail.key | transloco: detail.params }}
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
  private readonly streetsStore = inject(StreetsStore);

  /** Primero las zonas y las calles (lo más útil como destino) y después las paradas. */
  protected readonly results = computed<Option[]>(() => {
    const query = this.query();
    const zones = searchZones(this.zones(), query, MAX_RESULTS).map((zone): Option => ({
      key: `${zone.kind}:${zone.id}`,
      name: zone.name,
      kindKey: `map.zoneKind.${zone.kind}`,
      detail: { key: 'home.stopCount', params: { count: zone.stopIds.length } },
      toPlace: () => ({ kind: zone.kind, id: zone.id, name: zone.name, stopIds: zone.stopIds }),
    }));
    const streets = searchStreets(this.streetsStore.streets(), query, MAX_RESULTS).map(
      ({ street, number }): Option => ({
        key: `street:${street.id}#${number ?? ''}`,
        name: number === null ? street.name : `${street.name} ${number}`,
        kindKey: number === null ? 'plan.kind.street' : 'plan.kind.address',
        detail: null,
        toPlace: () => placeForStreet(street, number, this.network.stops()),
      }),
    );
    const stops = searchStops(this.network.stops(), query, MAX_RESULTS).map((stop): Option => ({
      key: `stop:${stop.id}`,
      name: stop.name,
      kindKey: 'plan.kind.stop',
      detail: { key: 'stops.code', params: { id: stop.id } },
      toPlace: () => ({ kind: 'stop', id: stop.id, name: stop.name, stopIds: [stop.id] }),
    }));
    return [...zones, ...streets, ...stops];
  });

  /** Las calles se descargan al empezar a escribir, no al abrir "Cómo llegar". */
  protected setQuery(value: string): void {
    this.query.set(value);
    if (value.trim()) void this.streetsStore.load();
  }

  protected choose(place: Place): void {
    this.query.set('');
    this.placeChange.emit(place);
  }

  /** Texto del tipo de lugar: parada, barrio, distrito, calle, dirección o tu ubicación. */
  protected kindKey(place: Place): string {
    switch (place.kind) {
      case 'neighbourhood':
      case 'district':
        return `map.zoneKind.${place.kind}`;
      default:
        return `plan.kind.${place.kind}`;
    }
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
      accessPoints: new Map(near.stops.map((s) => [s.stop.id, state.point])),
    });
  }
}
