import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  untracked,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { NetworkRepository, ShapeRepository } from '../../core/data/repositories';
import { ZonesStore } from '../../core/data/zones-store.service';
import { StreetsStore } from '../../core/data/streets-store.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { VehicleTrackerService } from '../../core/realtime/vehicle-tracker.service';
import { TrafficRepository } from '../../core/data/repositories';
import { TrafficItem } from '../../core/models/network.model';
import { ScheduleClockService } from '../../core/schedule/schedule-clock.service';
import { addDays } from '../../core/schedule/schedule';
import { ageMinutes } from '../../core/realtime/realtime';
import { placeForStreet, portalPoint } from '../../core/location/street-place';
import { SimpleModeService } from '../../core/settings/simple-mode.service';
import { LineColorsService } from '../../core/map/line-colors.service';
import { toMapRoutes, toMapStops } from '../../core/map/map-features';
import { LatLon, Polygon, ShapeDetail, Zone } from '../../core/models/network.model';
import { searchLines, searchStops, searchStreets, searchZones } from '../../core/search/search';
import { DataStatusBannerComponent } from '../../shared/data-status-banner/data-status-banner.component';
import { LineBadgeComponent } from '../../shared/line-badge/line-badge.component';
import { MapViewComponent } from '../../shared/map-view/map-view.component';
import { StopCardComponent } from '../../shared/stop-card/stop-card.component';

/** Paradas que se pintan como resultado de búsqueda; la lista completa está en Paradas. */
const MAX_STOP_RESULTS = 30;

/** Lo último que ha elegido el usuario: es lo que el mapa encuadra. */
type MapFocus =
  | { kind: 'line'; id: string }
  | { kind: 'stop'; id: string }
  | { kind: 'zone'; id: string }
  | { kind: 'street'; id: string };

/** Calle elegida: su código y, si se escribió, el número de portal. */
interface StreetChoice {
  readonly id: string;
  readonly number: number | null;
}

/**
 * Zona marcada en el mapa: un barrio o distrito (con su contorno) o una calle
 * (con las paradas cercanas a sus portales). Comparten la ficha del panel.
 */
interface Area {
  readonly name: string;
  readonly kindKey: string;
  readonly stopIds: readonly string[];
  readonly polygons: readonly Polygon[] | null;
  /** Puntos que encuadra el mapa. */
  readonly points: readonly LatLon[];
}

/** Cortes que se muestran: los activos y los que empiezan en estos días. */
const TRAFFIC_DAYS_AHEAD = 7;

/** "20261004" y minutos -> "2026-10-04T08:05". */
function localStamp(dateKey: string, minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(Math.floor(minutes % 60)).padStart(2, '0');
  return `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}T${h}:${m}`;
}

/** A partir de este zoom se cargan los trazados detallados (RNF-02: geometrías según zoom). */
const DETAIL_ZOOM = 14;

/**
 * Mapa de líneas (RF-01, RF-02). Todo lo que muestra el mapa está también en el
 * panel de texto: lista de líneas con su visibilidad y la línea resaltada (RNF-01).
 */
@Component({
  selector: 'app-map',
  imports: [
    RouterLink,
    TranslocoPipe,
    DataStatusBannerComponent,
    LineBadgeComponent,
    MapViewComponent,
    StopCardComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonCheckbox,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonSearchbar,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './map.page.scss',
  templateUrl: './map.page.html',
})
export class MapPage {
  private readonly network = inject(NetworkRepository);
  private readonly shapes = inject(ShapeRepository);
  private readonly colors = inject(LineColorsService);
  protected readonly simpleMode = inject(SimpleModeService).active;

  /** Línea a resaltar al abrir (/map?line=C1). */
  readonly line = input<string>();
  /** Barrio o distrito a marcar al abrir (/map?zone=...). */
  readonly zone = input<string>();
  /** Calle a marcar al abrir (/map?street=...&n=5), p. ej. desde la búsqueda del inicio. */
  readonly street = input<string>();
  readonly n = input<string>();
  /** Autobús que seguir al abrir (/map?bus=640), p. ej. desde "Ubicar bus más cercano". */
  readonly bus = input<string>();

  protected readonly lines = this.network.lines;
  /**
   * Líneas ocultas. El mapa empieza sin ninguna para no saturarlo (petición del
   * desarrollador, 05/10/2026): se eligen tocando sus números en el panel.
   */
  protected readonly hiddenLines = linkedSignal<ReadonlySet<string>>(
    () => new Set(this.lines().map((l) => l.id)),
  );
  protected readonly highlightedId = linkedSignal(() => this.line() ?? null);
  protected readonly highlightedLine = computed(() => {
    this.lines();
    const id = this.highlightedId();
    return id ? this.network.getLine(id) : undefined;
  });

  /** Búsqueda de líneas y paradas dentro del mapa (RF-05). */
  protected readonly query = signal('');
  protected readonly searching = computed(() => this.query().trim().length > 0);
  protected readonly lineResults = computed(() =>
    searchLines(this.lines(), this.query(), Infinity),
  );
  private readonly allStopResults = computed(() =>
    searchStops(this.network.stops(), this.query(), Infinity),
  );
  protected readonly stopResults = computed(() => this.allStopResults().slice(0, MAX_STOP_RESULTS));
  protected readonly totalStopResults = computed(() => this.allStopResults().length);

  /** Barrios y distritos: se descargan al abrir el mapa y solo se usan al buscar. */
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly zonesStore = inject(ZonesStore);
  private readonly zones = this.zonesStore.zones;
  protected readonly zoneResults = computed(() => searchZones(this.zones(), this.query()));
  private readonly streetsStore = inject(StreetsStore);
  protected readonly streetResults = computed(() =>
    searchStreets(this.streetsStore.streets(), this.query()),
  );
  protected readonly selectedStreet = linkedSignal<StreetChoice | null>(() => {
    const id = this.street();
    if (!id) return null;
    const number = Number.parseInt(this.n() ?? '', 10);
    return { id, number: Number.isFinite(number) ? number : null };
  });
  protected readonly selectedZoneId = linkedSignal(() => this.zone() ?? null);
  protected readonly selectedZone = computed(() =>
    this.zones().find((zone) => zone.id === this.selectedZoneId()),
  );
  /** La zona o la calle marcada, con lo que se muestra de ella en el mapa y el panel. */
  protected readonly selectedArea = computed<Area | null>(() => {
    const zone = this.selectedZone();
    if (zone) {
      return {
        name: zone.name,
        kindKey: `map.zoneKind.${zone.kind}`,
        stopIds: zone.stopIds,
        polygons: zone.polygons,
        points: zone.polygons.flatMap((polygon) => polygon[0] ?? []),
      };
    }
    const choice = this.selectedStreet();
    const street = choice && this.streetsStore.streets().find((s) => s.id === choice.id);
    if (!choice || !street) return null;
    const place = placeForStreet(street, choice.number, this.network.stops());
    return {
      name: place.name,
      kindKey: choice.number === null ? 'plan.kind.street' : 'plan.kind.address',
      stopIds: place.stopIds,
      polygons: null,
      points: choice.number === null ? street.points : [portalPoint(street, choice.number).point],
    };
  });
  /** Paradas de la zona o calle elegida, en el orden de la lista de paradas (por nombre). */
  protected readonly zoneStops = computed(() => {
    const ids = new Set(this.selectedArea()?.stopIds ?? []);
    return this.network.stops().filter((stop) => ids.has(stop.id));
  });
  /** Líneas que pasan por alguna parada de la zona elegida. */
  protected readonly zoneLines = computed(() => {
    const lineIds = new Set(this.zoneStops().flatMap((stop) => stop.services.map((s) => s.lineId)));
    return this.lines().filter((line) => lineIds.has(line.id));
  });

  /** Parada marcada en el mapa (elegida en la búsqueda o tocada en el mapa). */
  protected readonly selectedStopId = signal<string | null>(null);
  protected readonly selectedStop = computed(() => {
    this.network.stops();
    const id = this.selectedStopId();
    return id ? this.network.getStop(id) : undefined;
  });
  protected readonly selectedStopMarker = computed(
    () => toMapStops([this.selectedStop()])[0] ?? null,
  );

  private readonly focus = linkedSignal<MapFocus | null>(() => {
    const zone = this.zone();
    if (zone) return { kind: 'zone', id: zone };
    const street = this.street();
    if (street) return { kind: 'street', id: street };
    const line = this.line();
    return line ? { kind: 'line', id: line } : null;
  });

  private readonly geometries = signal<ReadonlyMap<string, readonly LatLon[]>>(new Map());

  /** Autobuses en tiempo real (solo en la app del móvil): los de las líneas a la vista. */
  private readonly realtime = inject(RealtimeService);

  /** Cortes de tráfico (Ayuntamiento y DGT): los activos y los de los próximos 7 días. */
  private readonly trafficItems = signal<readonly TrafficItem[]>([]);
  // Ocultos al abrir para no saturar el mapa (05/10/2026); un botón los muestra.
  protected readonly showTraffic = signal(false);
  protected readonly selectedTrafficId = signal<string | null>(null);
  private readonly clock = inject(ScheduleClockService).clock;
  /** "AAAA-MM-DDTHH:mm" en hora de Madrid, como las fechas de los cortes. */
  private readonly nowLocal = computed(() =>
    localStamp(this.clock().dateKey, this.clock().minutes),
  );
  protected readonly traffic = computed(() => {
    const now = this.nowLocal();
    const horizon = localStamp(addDays(this.clock().dateKey, TRAFFIC_DAYS_AHEAD), 0);
    return this.trafficItems()
      .filter((item) => (!item.to || item.to >= now) && (!item.from || item.from <= horizon))
      .map((item) => ({ item, active: !item.from || item.from <= now }));
  });
  protected readonly activeTraffic = computed(() => this.traffic().filter((t) => t.active).length);
  protected readonly mapTraffic = computed(() =>
    this.showTraffic()
      ? this.traffic().flatMap(({ item, active }) =>
          item.points[0] ? [{ id: item.id, point: item.points[0], active }] : [],
        )
      : [],
  );
  protected readonly selectedTraffic = computed(() =>
    this.traffic().find((t) => t.item.id === this.selectedTrafficId()),
  );
  /** Autobuses con su posición estimada (se mueven cada segundo). */
  private readonly tracker = inject(VehicleTrackerService);
  protected readonly selectedVehicleId = signal<string | null>(null);
  protected readonly following = signal(false);
  protected readonly vehicles = computed(() => {
    const visible = this.visibleLines();
    const highlighted = this.highlightedLines();
    const selected = this.selectedVehicleId();
    return this.tracker
      .vehicles()
      .filter(
        (v) =>
          v.id === selected ||
          ((visible === null || visible.has(v.lineId)) &&
            (!highlighted || highlighted.has(v.lineId))),
      )
      .map((v) => {
        const color = this.colors.colorFor(v.lineId);
        return {
          id: v.id,
          lineId: v.lineId,
          lat: v.point[0],
          lon: v.point[1],
          bearing: v.bearing,
          color: color.line,
          textColor: color.text,
          selected: v.id === selected,
        };
      });
  });
  /** Autobús tocado: su línea, sentido, próxima parada y antigüedad del dato. */
  protected readonly selectedVehicle = computed(() => {
    const vehicle = this.tracker.vehicles().find((v) => v.id === this.selectedVehicleId());
    if (!vehicle) return null;
    const direction = this.network
      .getLine(vehicle.lineId)
      ?.directions.find((d) => d.id === vehicle.directionId);
    return {
      ...vehicle,
      headsign: direction?.headsign ?? '',
      nextStop: vehicle.nextStopId ? this.network.getStop(vehicle.nextStopId) : undefined,
      stoppedAt: vehicle.stoppedAtId ? this.network.getStop(vehicle.stoppedAtId) : undefined,
      age: Math.round(vehicle.ageMinutes),
    };
  });
  /** Siguiendo un autobús: el mapa lo mantiene en el centro. */
  protected readonly followPoint = computed(() =>
    this.following() ? (this.selectedVehicle()?.point ?? null) : null,
  );
  /** Antigüedad del dato más reciente, para el aviso del panel. */
  protected readonly vehiclesAge = computed(() => {
    const now = this.realtime.now();
    const ages = this.realtime
      .vehicles()
      .map((v) => ageMinutes(v, now))
      .filter((a): a is number => a !== null);
    return ages.length > 0 ? Math.round(Math.min(...ages)) : null;
  });
  private detailLoaded = false;
  private readonly loadingShapes = new Set<ShapeDetail>();

  protected readonly routes = computed(() =>
    toMapRoutes(this.lines(), this.geometries(), (id) => this.colors.colorFor(id)),
  );

  /**
   * Mientras se busca, se resaltan las líneas que coinciden y el resto se atenúa
   * (si no coincide ninguna, todas quedan atenuadas). Si no, la línea elegida.
   */
  protected readonly highlightedLines = computed<ReadonlySet<string> | null>(() => {
    if (this.searching()) return new Set(this.lineResults().map((l) => l.id));
    const stop = this.selectedStop();
    if (stop && this.focus()?.kind === 'stop') {
      return new Set(stop.services.map((s) => s.lineId));
    }
    if (this.selectedArea()) return new Set(this.zoneLines().map((l) => l.id));
    const id = this.highlightedId();
    return id ? new Set([id]) : null;
  });

  /**
   * Mientras se busca, solo las paradas que coinciden; si no, las de la línea
   * resaltada o, si no hay ninguna, todas.
   */
  protected readonly mapStops = computed(() => {
    if (this.searching()) return toMapStops(this.allStopResults());
    if (this.selectedArea()) return toMapStops(this.zoneStops());
    const line = this.highlightedLine();
    if (!line) {
      const visible = this.visibleLines();
      if (visible === null) return toMapStops(this.network.stops());
      const ids = new Set(
        this.lines()
          .filter((l) => visible.has(l.id))
          .flatMap((l) => l.directions.flatMap((d) => d.stopIds)),
      );
      return toMapStops([...ids].map((id) => this.network.getStop(id)));
    }
    const ids = new Set(line.directions.flatMap((d) => d.stopIds));
    return toMapStops([...ids].map((id) => this.network.getStop(id)));
  });

  protected readonly visibleLines = computed(() => {
    const hidden = this.hiddenLines();
    if (hidden.size === 0) return null;
    return new Set(
      this.lines()
        .map((l) => l.id)
        .filter((id) => !hidden.has(id)),
    );
  });

  /** El mapa encuadra la última línea resaltada o la última parada elegida. */
  protected readonly fitPoints = computed<LatLon[]>(() => {
    const cut = this.selectedTraffic();
    if (cut) return [...cut.item.points];
    const focus = this.focus();
    if (focus?.kind === 'zone' || focus?.kind === 'street') {
      // La calle encuadra también sus paradas cercanas (una dirección es un solo punto).
      const area = this.selectedArea();
      const stops =
        focus.kind === 'street' ? this.zoneStops().map((s): LatLon => [s.lat, s.lon]) : [];
      return area ? [...area.points, ...stops] : [];
    }
    if (focus?.kind === 'stop') {
      const stop = this.selectedStop();
      return stop ? [[stop.lat, stop.lon]] : [];
    }
    const line = focus ? this.network.getLine(focus.id) : undefined;
    const geometries = this.geometries();
    return line ? line.directions.flatMap((d) => geometries.get(d.shapeId) ?? []) : [];
  });

  constructor() {
    this.tracker.watch();
    inject(TrafficRepository)
      .getTraffic()
      .then((items) => this.trafficItems.set(items))
      // Sin cortes el mapa funciona igual.
      .catch((error: unknown) =>
        console.warn('No se pudieron cargar los cortes de tráfico', error),
      );
    void this.loadShapes('overview');
    void this.zonesStore.load();
    // Si las zonas no se pudieron cargar al abrir, se reintenta al buscar. Las calles
    // solo se descargan al buscar o si se abre el mapa con una calle.
    effect(() => {
      if (this.searching()) {
        void this.zonesStore.load();
        void this.streetsStore.load();
      }
    });
    if (this.street()) void this.streetsStore.load();
    // Abrir siguiendo un autobús: se selecciona, se ve aunque su línea esté oculta y se sigue.
    effect(() => {
      const bus = this.bus();
      if (!bus) return;
      untracked(() => {
        this.selectedVehicleId.set(bus);
        this.following.set(true);
      });
    });
    // …y, en cuanto aparece, se muestra su línea (una sola vez: luego manda el usuario).
    let shownLineFor: string | null = null;
    effect(() => {
      const bus = this.bus();
      const vehicle = bus ? this.tracker.vehicles().find((v) => v.id === bus) : undefined;
      if (!vehicle || shownLineFor === vehicle.id) return;
      shownLineFor = vehicle.id;
      untracked(() => this.setVisible(vehicle.lineId, true));
    });
  }

  protected readonly realtimeAvailable = this.realtime.available;
  protected readonly refreshingVehicles = this.realtime.refreshing;

  /** Botón "Actualizar": pide ya las posiciones de todos los autobuses. */
  protected refreshVehicles(): void {
    void this.realtime.refreshNow();
  }

  /** "Va 3 min tarde", "Va en hora" o "Va 2 min adelantado". */
  protected delayKey(delay: number): string {
    if (delay >= 2) return 'realtime.late';
    return delay <= -2 ? 'realtime.early' : 'realtime.onTime';
  }

  protected abs(value: number): number {
    return Math.abs(value);
  }

  /** Toca un autobús: su ficha arriba del panel (sin seguirlo todavía). */
  protected selectVehicle(id: string | null): void {
    this.selectedVehicleId.set(id);
    this.following.set(false);
    if (id) this.scrollPanelToTop();
  }

  /** Marca un corte de tráfico: ficha arriba del panel y mapa centrado en él. */
  protected selectTraffic(id: string | null): void {
    this.selectedTrafficId.set(id);
    if (id) this.scrollPanelToTop();
  }

  /** "2026-10-06T15:30" -> "6/10 15:30". */
  protected formatStamp(stamp: string | null): string {
    if (!stamp) return '';
    const [date, time] = stamp.split('T');
    const [, month, day] = (date ?? '').split('-');
    return `${Number(day)}/${Number(month)} ${time ?? ''}`.trim();
  }

  protected isVisible(lineId: string): boolean {
    return !this.hiddenLines().has(lineId);
  }

  /** Ficha de una línea: la muestra u oculta en el mapa. */
  protected toggleLine(lineId: string): void {
    this.setVisible(lineId, !this.isVisible(lineId));
  }

  protected setVisible(lineId: string, visible: boolean): void {
    this.hiddenLines.update((hidden) => {
      const next = new Set(hidden);
      if (visible) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }

  protected showAll(): void {
    this.hiddenLines.set(new Set());
  }

  protected hideAll(): void {
    this.hiddenLines.set(new Set(this.lines().map((l) => l.id)));
  }

  protected highlight(lineId: string | null): void {
    this.highlightedId.set(lineId);
    if (lineId) {
      this.selectedZoneId.set(null);
      this.selectedStreet.set(null);
      this.focus.set({ kind: 'line', id: lineId });
      // Una línea resaltada siempre es visible.
      this.setVisible(lineId, true);
    }
  }

  /** Marca una parada y centra el mapa en ella, sin salir del mapa. */
  protected selectStop(stopId: string | null): void {
    this.selectedStopId.set(stopId);
    if (stopId) {
      this.focus.set({ kind: 'stop', id: stopId });
      this.scrollPanelToTop();
    }
  }

  private scrollPanelToTop(): void {
    const panel = this.panel()?.nativeElement;
    if (panel) panel.scrollTop = 0;
  }

  /** Marca una zona: su contorno, sus paradas y las líneas que pasan por ellas. */
  protected chooseZone(zoneId: string): void {
    this.selectedStreet.set(null);
    this.selectedZoneId.set(zoneId);
    this.highlightedId.set(null);
    this.focus.set({ kind: 'zone', id: zoneId });
    this.query.set('');
  }

  protected zoneKindKey(kind: Zone['kind']): string {
    return `map.zoneKind.${kind}`;
  }

  /** Marca una calle (o un portal): sus paradas cercanas y las líneas que pasan por ellas. */
  protected chooseStreet(id: string, number: number | null): void {
    this.selectedZoneId.set(null);
    this.selectedStreet.set({ id, number });
    this.highlightedId.set(null);
    this.focus.set({ kind: 'street', id });
    this.query.set('');
  }

  protected clearZone(): void {
    this.selectedZoneId.set(null);
    this.selectedStreet.set(null);
  }

  protected chooseLine(lineId: string): void {
    this.highlight(lineId);
    this.query.set('');
  }

  protected chooseStop(stopId: string): void {
    this.selectStop(stopId);
    this.query.set('');
  }

  protected onZoom(zoom: number): void {
    if (zoom >= DETAIL_ZOOM) void this.loadShapes('detail');
  }

  private async loadShapes(detail: ShapeDetail): Promise<void> {
    if (this.detailLoaded || this.loadingShapes.has(detail)) return;
    this.loadingShapes.add(detail);
    try {
      const shapes = await this.shapes.getShapes(detail);
      // Si mientras tanto llegó el nivel detallado, no se sustituye por el general.
      if (detail === 'overview' && this.detailLoaded) return;
      this.detailLoaded ||= detail === 'detail';
      this.geometries.set(shapes);
    } catch (error) {
      console.error('No se pudieron cargar los trazados', error);
    } finally {
      this.loadingShapes.delete(detail);
    }
  }
}
