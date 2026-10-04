import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
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

import { NetworkRepository, ShapeRepository } from '../../core/data/repositories';
import { ZonesStore } from '../../core/data/zones-store.service';
import { resolvePlace, toPlaceRef } from '../../core/favorites/favorites';
import { LocationService } from '../../core/location/location.service';
import { LineColorsService } from '../../core/map/line-colors.service';
import { sliceBetween, toMapStops } from '../../core/map/map-features';
import { MapRoute } from '../../core/map/map-provider';
import { LatLon } from '../../core/models/network.model';
import {
  JourneyOption,
  Leg,
  Place,
  buildNearbyStops,
  planJourneys,
} from '../../core/planner/planner';
import {
  TimeMode,
  TimedJourney,
  compareTimed,
  scheduleJourney,
} from '../../core/planner/scheduled-journey';
import { ServiceClock, dayOffsetOf, formatClock } from '../../core/schedule/schedule';
import { ScheduleClockService } from '../../core/schedule/schedule-clock.service';
import { SimpleModeService } from '../../core/settings/simple-mode.service';
import { DataStatusBannerComponent } from '../../shared/data-status-banner/data-status-banner.component';
import { LineBadgeComponent } from '../../shared/line-badge/line-badge.component';
import { MapViewComponent } from '../../shared/map-view/map-view.component';
import { PlacePickerComponent } from '../../shared/place-picker/place-picker.component';
import { FavoriteButtonComponent } from '../../shared/favorite-button/favorite-button.component';

/** "Salir ahora", "Salir a las…" o "Llegar a las…". */
type TimeChoice = 'now' | TimeMode;

/**
 * Las líneas nocturnas de la EMT se nombran N1, N2... Solo circulan de noche:
 * sin horario se muestran al final y con aviso; con horario, su hora de paso ya
 * las coloca donde corresponde.
 */
function isNightLine(lineId: string): boolean {
  return /^N\d+$/.test(lineId);
}

/** "20261005" -> "2026-10-05" (formato de los campos de fecha HTML). */
function toInputDate(dateKey: string): string {
  return `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
}

/** Una opción con su encaje en el horario (null si alguna línea no publica horario). */
interface Row {
  readonly option: JourneyOption;
  readonly timed: TimedJourney | null;
}

/**
 * "Cómo llegar": opciones directas y con un transbordo entre dos paradas o
 * zonas, encajadas en el horario programado de la EMT para salir ahora, salir a
 * una hora o llegar antes de una hora. El mapa muestra la opción elegida (al
 * principio, la recomendada). La ubicación del usuario y el tiempo real
 * llegarán en fases posteriores.
 */
@Component({
  selector: 'app-plan',
  imports: [
    RouterLink,
    TranslocoPipe,
    DataStatusBannerComponent,
    LineBadgeComponent,
    MapViewComponent,
    PlacePickerComponent,
    FavoriteButtonComponent,
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
  private readonly schedule = inject(ScheduleClockService);
  private readonly colors = inject(LineColorsService);

  private readonly zonesStore = inject(ZonesStore);
  protected readonly zones = this.zonesStore.zones;

  /** Origen y destino al abrir (/plan?from=stop:152&to=neighbourhood:b12), p. ej. desde un favorito. */
  readonly from = input<string>();
  readonly to = input<string>();
  protected readonly origin = linkedSignal<Place | null>(() => this.placeFromParam(this.from()));
  protected readonly destination = linkedSignal<Place | null>(() => this.placeFromParam(this.to()));
  /** El trayecto elegido, para guardarlo en favoritos. */
  protected readonly tripFavorite = computed(() => {
    const origin = this.origin();
    const destination = this.destination();
    if (!origin || !destination || this.samePlace()) return null;
    const from = toPlaceRef(origin);
    const to = toPlaceRef(destination);
    return from && to ? { kind: 'trip' as const, origin: from, destination: to } : null;
  });
  private readonly geometries = signal<ReadonlyMap<string, readonly LatLon[]>>(new Map());

  protected readonly timeChoice = signal<TimeChoice>('now');
  /** Hora elegida para "salir a las" / "llegar a las", "HH:MM" (por defecto, la actual). */
  protected readonly chosenTime = linkedSignal(() => formatClock(this.schedule.clock().minutes));

  /** Día elegido para "salir a las" / "llegar a las", "AAAA-MM-DD" (por defecto, hoy). */
  protected readonly chosenDate = linkedSignal(() => toInputDate(this.schedule.clock().dateKey));
  /** Límites del selector de día: hoy y el último día del horario publicado. */
  protected readonly minDate = computed(() => toInputDate(this.schedule.clock().dateKey));
  protected readonly maxDate = computed(() => {
    const last = this.schedule.lastServiceDate();
    return last ? toInputDate(last) : null;
  });

  /** "30 de noviembre de 2026", en el idioma activo. */
  protected readonly maxDateLabel = computed(() => {
    const max = this.maxDate();
    if (!max) return null;
    const [year, month, day] = max.split('-').map(Number);
    return new Intl.DateTimeFormat(this.transloco.getActiveLang(), {
      dateStyle: 'long',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year!, month! - 1, day!)));
  });

  /** Instante de referencia del cálculo, en hora de Málaga. */
  private readonly reference = computed<ServiceClock>(() => {
    const clock = this.schedule.clock();
    if (this.timeChoice() === 'now') return clock;
    const [hours, minutes] = this.chosenTime().split(':').map(Number);
    return {
      dateKey: this.chosenDate().replaceAll('-', ''),
      minutes: (hours ?? 0) * 60 + (minutes ?? 0),
    };
  });
  /** true si el cálculo es para otro día distinto de hoy. */
  protected readonly isOtherDay = computed(
    () => this.reference().dateKey !== this.schedule.clock().dateKey,
  );
  private readonly mode = computed<TimeMode>(() =>
    this.timeChoice() === 'arrive' ? 'arrive' : 'depart',
  );

  /** Paradas cercanas entre sí, para transbordos a pie; se recalcula solo si cambia la red. */
  private readonly nearbyStops = computed(() => buildNearbyStops(this.network.stops()));

  private readonly options = computed<readonly JourneyOption[]>(() => {
    const origin = this.origin();
    const destination = this.destination();
    return origin && destination
      ? planJourneys(this.network.lines(), origin, destination, {
          isSecondary: isNightLine,
          nearbyStops: this.nearbyStops(),
          maxResults: 8,
        })
      : [];
  });

  /**
   * Opciones encajadas en el horario y ordenadas: primero las que tienen horario
   * (la que llega antes o, en "llegar a las", la que sale más tarde) y después
   * las que no se pueden encajar. La primera es la recomendada.
   */
  protected readonly rows = computed<readonly Row[]>(() => {
    const timetables = this.schedule.timetables();
    const reference = this.reference();
    const mode = this.mode();
    const lines = this.network.lines();
    const rows = this.options().map((option) => ({
      option,
      timed: timetables ? scheduleJourney(option, lines, timetables, reference, mode) : null,
    }));
    const timed = rows
      .filter((r) => r.timed)
      .sort((a, b) => compareTimed(mode)(a.timed!, b.timed!));
    return [...timed, ...rows.filter((r) => !r.timed)].slice(0, 6);
  });

  protected readonly selectedIndex = linkedSignal(() => {
    this.rows();
    return 0;
  });
  protected readonly selected = computed(() => this.rows()[this.selectedIndex()]);

  /** Hay opciones que mostrar (y, por tanto, mapa). */
  protected readonly hasOptions = computed(
    () => !!this.origin() && !!this.destination() && !this.samePlace() && this.rows().length > 0,
  );
  private readonly simpleMode = inject(SimpleModeService).active;
  /** El mapa de la opción elegida, salvo en modo sencillo. */
  protected readonly showMap = computed(() => this.hasOptions() && !this.simpleMode());
  protected readonly samePlace = computed(() => {
    const origin = this.origin();
    const destination = this.destination();
    return (
      !!origin && !!destination && origin.kind === destination.kind && origin.id === destination.id
    );
  });

  /** Tramos de la opción elegida, recortados entre la parada de subida y la de bajada. */
  protected readonly mapRoutes = computed<MapRoute[]>(() => {
    const row = this.selected();
    if (!row) return [];
    return row.option.legs.flatMap((leg, i) => {
      const line = this.network.getLine(leg.lineId);
      const direction = line?.directions.find((d) => d.id === leg.directionId);
      const points = direction ? this.geometries().get(direction.shapeId) : undefined;
      const from = this.network.getStop(leg.fromStopId);
      const to = this.network.getStop(leg.toStopId);
      if (!direction || !points || !from || !to) return [];
      const color = this.colors.colorFor(leg.lineId);
      return [
        {
          id: `${i}-${leg.lineId}`,
          lineId: leg.lineId,
          color: color.line,
          textColor: color.text,
          approximate: direction.shapeQuality === 'approximate',
          points: sliceBetween(points, from, to),
        },
      ];
    });
  });
  protected readonly mapStops = computed(() =>
    toMapStops(
      (this.selected()?.option.legs ?? []).flatMap((leg) => [
        this.network.getStop(leg.fromStopId),
        this.network.getStop(leg.toStopId),
      ]),
    ),
  );
  /** Tu posición en el mapa cuando el origen es "Mi ubicación". */
  private readonly locationState = inject(LocationService).state;
  protected readonly userPoint = computed<LatLon | null>(() => {
    const state = this.locationState();
    return this.origin()?.kind === 'location' && state.status === 'ready' ? state.point : null;
  });
  protected readonly fitPoints = computed(() => {
    const points = this.mapRoutes().flatMap((r) => r.points);
    const user = this.userPoint();
    return user ? [user, ...points] : points;
  });

  private readonly mapSection = viewChild<ElementRef<HTMLElement>>('mapSection');

  constructor() {
    void this.schedule.load();
    // Sin zonas se puede planificar igualmente entre paradas.
    void this.zonesStore.load();
    inject(ShapeRepository)
      .getShapes('detail')
      .then((shapes) => this.geometries.set(shapes))
      .catch((error: unknown) => console.warn('No se pudieron cargar los trazados', error));
  }

  /** Se resuelve de nuevo cuando llegan las paradas o las zonas (se leen para depender de ellas). */
  private placeFromParam(param: string | undefined): Place | null {
    this.network.stops();
    return resolvePlace(param, (id) => this.network.getStop(id), this.zones());
  }

  protected swap(): void {
    const origin = this.origin();
    this.origin.set(this.destination());
    this.destination.set(origin);
  }

  protected chooseTime(choice: TimeChoice): void {
    this.timeChoice.set(choice);
  }

  protected timeChoiceKey(choice: string): string {
    return `plan.timeChoice.${choice}`;
  }

  protected setDate(value: string): void {
    const min = this.minDate();
    const max = this.maxDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    // El campo de fecha respeta min/max, pero se acota por si el navegador no lo hace.
    this.chosenDate.set(value < min ? min : max && value > max ? max : value);
  }

  protected setTime(value: string): void {
    if (/^\d{2}:\d{2}$/.test(value)) this.chosenTime.set(value);
  }

  /** Muestra la opción en el mapa y lo lleva a la vista. */
  protected select(index: number): void {
    this.selectedIndex.set(index);
    this.mapSection()?.nativeElement.scrollIntoView?.({ block: 'nearest' });
  }

  protected stopName(stopId: string): string {
    return this.network.getStop(stopId)?.name ?? stopId;
  }

  protected time(minutes: number): string {
    const label = formatClock(minutes);
    if (dayOffsetOf(minutes) <= 0) return label;
    // "mañana" solo tiene sentido si se calcula para hoy; si no, "día siguiente".
    const key = this.isOtherDay() ? 'plan.nextDayAt' : 'plan.tomorrowAt';
    return this.transloco.translate(key, { time: label });
  }

  /** Minutos que faltan para el primer bus (solo en "salir ahora"). */
  protected waitMinutes(row: Row): number | null {
    if (!row.timed || this.timeChoice() !== 'now') return null;
    return Math.max(0, Math.round(row.timed.leaveAt - this.schedule.clock().minutes));
  }

  protected duration(row: Row): number {
    return row.timed ? Math.round(row.timed.arrival - row.timed.leaveAt) : row.option.totalMinutes;
  }

  protected timedLeg(row: Row, index: number) {
    return row.timed?.legs[index];
  }

  /** "Nombre (código)" de una parada, como se muestra en los transbordos. */
  protected stopLabel(stopId: string): string {
    return `${this.stopName(stopId)} (${stopId})`;
  }

  /** Sin horas: o alguna línea no publica horario, o no hay buses ese día ni el siguiente. */
  protected untimedKey(option: JourneyOption): string {
    return this.isEstimated(option)
      ? 'plan.noSchedule'
      : this.mode() === 'arrive'
        ? 'plan.noServiceArrive'
        : 'plan.noService';
  }

  protected hasNightLine(option: JourneyOption): boolean {
    return option.legs.some((leg: Leg) => isNightLine(leg.lineId));
  }

  protected isEstimated(option: JourneyOption): boolean {
    return option.legs.some((leg) => leg.estimated);
  }
}
