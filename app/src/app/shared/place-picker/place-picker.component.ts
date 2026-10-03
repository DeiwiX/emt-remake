import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IonButton, IonItem, IonLabel, IonList, IonSearchbar } from '@ionic/angular';

import { NetworkRepository } from '../../core/data/repositories';
import { Zone } from '../../core/models/network.model';
import { Place } from '../../core/planner/planner';
import { searchStops, searchZones } from '../../core/search/search';

const MAX_RESULTS = 6;

/**
 * Selector de origen o destino para "Cómo llegar": busca paradas (por nombre o
 * código) y barrios o distritos. Más adelante podrá añadir "Mi ubicación".
 */
@Component({
  selector: 'app-place-picker',
  imports: [TranslocoPipe, IonButton, IonItem, IonLabel, IonList, IonSearchbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .chosen {
      display: flex;
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

  /** Texto del tipo de lugar: parada, barrio o distrito. */
  protected kindKey(place: Place): string {
    return place.kind === 'stop' ? 'plan.kind.stop' : `map.zoneKind.${place.kind}`;
  }
}
