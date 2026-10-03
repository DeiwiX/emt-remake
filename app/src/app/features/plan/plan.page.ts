import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { NetworkRepository, ZoneRepository } from '../../core/data/repositories';
import { Zone } from '../../core/models/network.model';
import { JourneyOption, Place, buildNearbyStops, planJourneys } from '../../core/planner/planner';
import { DataStatusBannerComponent } from '../../shared/data-status-banner/data-status-banner.component';
import { LineBadgeComponent } from '../../shared/line-badge/line-badge.component';
import { PlacePickerComponent } from '../../shared/place-picker/place-picker.component';

const MINUTE_MS = 60_000;

/**
 * Las líneas nocturnas de la EMT se nombran N1, N2... Solo circulan de noche:
 * se muestran al final y con aviso. (Cuando tengamos horarios por franja se
 * podrá saber qué líneas circulan a cada hora.)
 */
function isNightLine(lineId: string): boolean {
  return /^N\d+$/.test(lineId);
}

/**
 * "Cómo llegar": opciones directas y con un transbordo entre dos paradas o
 * zonas, con tiempo aproximado según el horario programado. La ubicación del
 * usuario y los tiempos de espera reales llegarán en fases posteriores.
 */
@Component({
  selector: 'app-plan',
  imports: [
    RouterLink,
    TranslocoPipe,
    DataStatusBannerComponent,
    LineBadgeComponent,
    PlacePickerComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonNote,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './plan.page.scss',
  templateUrl: './plan.page.html',
})
export class PlanPage {
  private readonly network = inject(NetworkRepository);
  private readonly transloco = inject(TranslocoService);
  private readonly lang = toSignal(this.transloco.langChanges$, { requireSync: true });

  protected readonly origin = signal<Place | null>(null);
  protected readonly destination = signal<Place | null>(null);
  protected readonly zones = signal<readonly Zone[]>([]);
  /** Hora actual, refrescada cada minuto para la hora de llegada aproximada. */
  private readonly now = signal(Date.now());

  /** Paradas cercanas entre sí, para transbordos a pie; se recalcula solo si cambia la red. */
  private readonly nearbyStops = computed(() => buildNearbyStops(this.network.stops()));

  protected readonly options = computed<readonly JourneyOption[]>(() => {
    const origin = this.origin();
    const destination = this.destination();
    return origin && destination
      ? planJourneys(this.network.lines(), origin, destination, {
          isSecondary: isNightLine,
          nearbyStops: this.nearbyStops(),
        })
      : [];
  });
  protected readonly samePlace = computed(() => {
    const origin = this.origin();
    const destination = this.destination();
    return (
      !!origin && !!destination && origin.kind === destination.kind && origin.id === destination.id
    );
  });

  constructor() {
    inject(ZoneRepository)
      .getZones()
      .then((zones) => this.zones.set(zones))
      // Sin zonas se puede planificar igualmente entre paradas.
      .catch((error: unknown) => console.warn('No se pudieron cargar las zonas', error));
    const timer = setInterval(() => this.now.set(Date.now()), MINUTE_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected swap(): void {
    const origin = this.origin();
    this.origin.set(this.destination());
    this.destination.set(origin);
  }

  protected stopName(stopId: string): string {
    return this.network.getStop(stopId)?.name ?? stopId;
  }

  /** "HH:MM" de llegada si se sale ahora (sin contar la espera en la parada). */
  protected arrivalTime(option: JourneyOption): string {
    return new Intl.DateTimeFormat(this.lang(), { hour: '2-digit', minute: '2-digit' }).format(
      this.now() + option.totalMinutes * MINUTE_MS,
    );
  }

  /** "Transbordo: baja en X y camina ~N min hasta Y". */
  protected transferWalkText(option: JourneyOption): string {
    return this.transloco.translate('plan.transferWalk', {
      from: this.stopName(option.legs[0]!.toStopId),
      to: this.stopName(option.legs[1]!.fromStopId),
      minutes: option.walkMinutes,
    });
  }

  protected hasNightLine(option: JourneyOption): boolean {
    return option.legs.some((leg) => isNightLine(leg.lineId));
  }

  protected isEstimated(option: JourneyOption): boolean {
    return option.legs.some((leg) => leg.estimated);
  }
}
