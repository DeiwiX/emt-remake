import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideIonicAngular } from '@ionic/angular';
import { TranslocoTestingModule } from '@jsverse/transloco';

import es from '../../../../public/i18n/es.json';
import { routes } from '../../app.routes';
import {
  DataStatusService,
  NetworkRepository,
  ShapeRepository,
  ZoneRepository,
  ScheduleRepository,
} from '../../core/data/repositories';
import {
  MapProvider,
  MapRoute,
  MapStop,
  MapView,
  MapViewEvents,
} from '../../core/map/map-provider';
import { LatLon, Zone } from '../../core/models/network.model';
import { SettingsService } from '../../core/settings/settings.service';
import { buildIndex } from '../../data/static-repositories';
import { networkFixture } from '../../data/testing/data-fixtures';
import { MapPage } from './map.page';

/** Mapa falso que registra lo que la pantalla le pide. */
class FakeMapView implements MapView {
  routes: readonly MapRoute[] = [];
  visible: ReadonlySet<string> | null = null;
  highlighted: string | null = null;
  setRoutes(routes: readonly MapRoute[]) {
    this.routes = routes;
  }
  setStops = vi.fn();
  setVisibleLines(ids: ReadonlySet<string> | null) {
    this.visible = ids;
  }
  setHighlightedLines(ids: ReadonlySet<string> | null) {
    this.highlighted = ids ? [...ids].join(',') : null;
  }
  highlightedStop: MapStop | null = null;
  setHighlightedStop(stop: MapStop | null) {
    this.highlightedStop = stop;
  }
  fitTo = vi.fn();
  setScheme = vi.fn();
  setBaseLayer = vi.fn();
  setLabel = vi.fn();
  area: readonly unknown[] | null = null;
  setHighlightedArea(polygons: readonly unknown[] | null) {
    this.area = polygons;
  }
  destroy = vi.fn();
}

/** Un barrio cuadrado que contiene la parada "1" (Zapateros). */
const zones: Zone[] = [
  {
    id: 'b1',
    kind: 'neighbourhood',
    name: 'Teatinos',
    polygons: [
      [
        [
          [36.71, -4.43],
          [36.71, -4.41],
          [36.73, -4.41],
          [36.73, -4.43],
          [36.71, -4.43],
        ],
      ],
    ],
    stopIds: ['1'],
  },
];

describe('MapPage', () => {
  let view: FakeMapView;
  let events: MapViewEvents;
  let supported: boolean;
  let create: ReturnType<
    typeof vi.fn<(el: HTMLElement, options: unknown, e: MapViewEvents) => Promise<MapView>>
  >;

  let zonesResult: () => Promise<Zone[]>;

  beforeEach(() => {
    // Los ajustes se guardan en localStorage: cada prueba empieza sin modo sencillo.
    localStorage.clear();
    create = vi.fn((_el: HTMLElement, _options: unknown, e: MapViewEvents) => {
      events = e;
      return Promise.resolve(view);
    });
    zonesResult = () => Promise.resolve(zones);
    view = new FakeMapView();
    supported = true;
    const index = buildIndex(networkFixture());
    const shapes = new Map<string, LatLon[]>([
      [
        'g21',
        [
          [36.7, -4.4],
          [36.71, -4.41],
        ],
      ],
      [
        'g22',
        [
          [36.71, -4.41],
          [36.7, -4.4],
        ],
      ],
      [
        'a10-1',
        [
          [36.72, -4.42],
          [36.73, -4.43],
        ],
      ],
    ]);
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: { es },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideIonicAngular(),
        {
          provide: DataStatusService,
          useValue: { status: signal({ state: 'loading' }), refresh: () => Promise.resolve() },
        },
        {
          provide: NetworkRepository,
          useValue: {
            lines: signal(index.lines),
            stops: signal(index.stops),
            getLine: (id: string) => index.linesById.get(id),
            getStop: (id: string) => index.stopsById.get(id),
          },
        },
        { provide: ShapeRepository, useValue: { getShapes: () => Promise.resolve(shapes) } },
        {
          provide: ScheduleRepository,
          useValue: {
            getTimetables: () => Promise.resolve({ services: new Map(), departures: new Map() }),
          },
        },
        { provide: ZoneRepository, useValue: { getZones: () => zonesResult() } },
        {
          provide: MapProvider,
          useValue: {
            isSupported: () => supported,
            create: (...args: [HTMLElement, unknown, MapViewEvents]) => create(...args),
          },
        },
      ],
    });
  });

  async function open(url: string) {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(url, MapPage);
    await vi.waitFor(() => expect(view.routes.length).toBeGreaterThan(0));
    harness.detectChanges();
    return { harness, page };
  }

  it('dibuja un recorrido por sentido, con su color y su tipo', async () => {
    await open('/map');
    expect(view.routes.map((r) => [r.id, r.approximate])).toEqual([
      ['2-1', false],
      ['2-2', false],
      ['10-1', true],
    ]);
    expect(view.routes[0]?.color).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('resalta la línea indicada en la dirección y la que se toca en el mapa', async () => {
    await open('/map?line=10');
    expect(view.highlighted).toBe('10');

    events.lineSelected('2');
    TestBed.tick();
    expect(view.highlighted).toBe('2');

    events.lineSelected(null);
    TestBed.tick();
    expect(view.highlighted).toBeNull();
  });

  it('oculta y muestra líneas desde el panel', async () => {
    const { page } = await open('/map');
    const actions = page as unknown as {
      setVisible(id: string, visible: boolean): void;
      showAll(): void;
      hideAll(): void;
    };

    actions.setVisible('10', false);
    TestBed.tick();
    expect([...(view.visible ?? [])]).toEqual(['2']);

    actions.hideAll();
    TestBed.tick();
    expect([...(view.visible ?? [])]).toEqual([]);

    actions.showAll();
    TestBed.tick();
    expect(view.visible).toBeNull();
  });

  it('busca líneas y paradas y, al elegir una parada, la marca y la encuadra', async () => {
    const { harness, page } = await open('/map');
    const actions = page as unknown as {
      query: { set(v: string): void };
      chooseStop(id: string): void;
    };

    actions.query.set('alameda');
    harness.detectChanges();
    const text = (harness.routeNativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Encontradas: 1 líneas y 1 paradas');
    // Mientras se busca, solo se resaltan las líneas que coinciden.
    TestBed.tick();
    expect(view.highlighted).toBe('2');

    actions.chooseStop('2');
    TestBed.tick();
    harness.detectChanges();
    expect(view.highlightedStop?.id).toBe('2');
    expect(view.fitTo).toHaveBeenLastCalledWith([[36.71, -4.43]]);
    // Al elegir, la búsqueda se limpia y se muestra la ficha de la parada.
    expect((harness.routeNativeElement as HTMLElement).textContent).toContain(
      'Ver detalle de la parada',
    );
  });

  it('busca barrios y al elegir uno marca la zona, sus paradas y sus líneas', async () => {
    const { harness, page } = await open('/map');
    const actions = page as unknown as {
      query: { set(v: string): void };
      chooseZone(id: string): void;
    };
    await vi.waitFor(() => {
      actions.query.set('teatinos');
      harness.detectChanges();
      expect((harness.routeNativeElement as HTMLElement).textContent).toContain('Zonas');
    });

    actions.chooseZone('b1');
    TestBed.tick();
    harness.detectChanges();
    expect(view.area).toHaveLength(1);
    // La parada 1 la usa solo la línea 2 (en sus dos sentidos).
    expect(view.highlighted).toBe('2');
    expect(view.fitTo).toHaveBeenCalled();
    const text = (harness.routeNativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('1 paradas y 1 líneas');
    expect(text).toContain('Zapateros');
  });

  it('si las zonas no se pudieron cargar al abrir, las reintenta al buscar', async () => {
    zonesResult = () => Promise.reject(new Error('sin zonas'));
    const { harness, page } = await open('/map');
    zonesResult = () => Promise.resolve(zones);
    const query = (page as unknown as { query: { set(v: string): void } }).query;

    query.set('teatinos');
    await vi.waitFor(() => {
      harness.detectChanges();
      expect((harness.routeNativeElement as HTMLElement).textContent).toContain('Zonas');
    });
  });

  it('al elegir una parada de una zona, la parada pasa a primer plano', async () => {
    const { harness, page } = await open('/map');
    const actions = page as unknown as {
      chooseZone(id: string): void;
      selectStop(id: string): void;
    };
    await vi.waitFor(() => {
      actions.chooseZone('b1');
      TestBed.tick();
      expect(view.area).toHaveLength(1);
    });

    actions.selectStop('2');
    TestBed.tick();
    harness.detectChanges();

    // Se encuadra la parada, se resaltan sus líneas y su ficha va antes que la de la zona.
    expect(view.fitTo).toHaveBeenLastCalledWith([[36.71, -4.43]]);
    expect(view.highlighted).toBe('2,10');
    const cards = [
      ...(harness.routeNativeElement as HTMLElement).querySelectorAll(
        'app-stop-card h2, .selected h2',
      ),
    ];
    expect(cards.map((h) => h.textContent?.trim())).toEqual(['Alameda', 'Teatinos']);
    // Cada línea de la ficha muestra su próximo bus según horario (aquí, sin horario).
    expect((harness.routeNativeElement as HTMLElement).textContent).toMatch(/horario/);
  });

  it('al tocar una parada en el mapa la marca sin salir del mapa', async () => {
    await open('/map');
    events.stopSelected('1');
    TestBed.tick();
    expect(view.highlightedStop?.id).toBe('1');
  });

  it('sin WebGL pasa solo al modo sencillo: solo el panel de texto, sin mapa', async () => {
    supported = false;
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/map', MapPage);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const element = harness.routeNativeElement as HTMLElement;
    expect(element.querySelector('app-map-view')).toBeNull();
    expect(element.textContent).toContain('Barrios, líneas y paradas');
    expect(element.textContent).toContain('Estás en modo sencillo');
    expect(element.querySelector('ion-checkbox')).toBeNull();
  });

  it('con el modo sencillo activado en Ajustes no crea el mapa', async () => {
    TestBed.inject(SettingsService).update({ simpleMode: true });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/map', MapPage);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect((harness.routeNativeElement as HTMLElement).querySelector('app-map-view')).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});
