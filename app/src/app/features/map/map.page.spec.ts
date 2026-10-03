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
} from '../../core/data/repositories';
import {
  MapProvider,
  MapRoute,
  MapStop,
  MapView,
  MapViewEvents,
} from '../../core/map/map-provider';
import { LatLon } from '../../core/models/network.model';
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
  setHighlightedLine(id: string | null) {
    this.highlighted = id;
  }
  highlightedStop: MapStop | null = null;
  setHighlightedStop(stop: MapStop | null) {
    this.highlightedStop = stop;
  }
  fitTo = vi.fn();
  setScheme = vi.fn();
  destroy = vi.fn();
}

describe('MapPage', () => {
  let view: FakeMapView;
  let events: MapViewEvents;
  let supported: boolean;

  beforeEach(() => {
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
          provide: MapProvider,
          useValue: {
            isSupported: () => supported,
            create: (_: HTMLElement, __: unknown, e: MapViewEvents) => {
              events = e;
              return Promise.resolve(view);
            },
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

  it('al tocar una parada en el mapa la marca sin salir del mapa', async () => {
    await open('/map');
    events.stopSelected('1');
    TestBed.tick();
    expect(view.highlightedStop?.id).toBe('1');
  });

  it('avisa y ofrece las listas si el dispositivo no puede mostrar el mapa', async () => {
    supported = false;
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/map', MapPage);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect((harness.routeNativeElement as HTMLElement).textContent).toContain(
      'Este dispositivo no puede mostrar el mapa',
    );
  });
});
