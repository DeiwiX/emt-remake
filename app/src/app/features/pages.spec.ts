import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideIonicAngular } from '@ionic/angular';
import { TranslocoTestingModule } from '@jsverse/transloco';

import es from '../../../public/i18n/es.json';
import { routes } from '../app.routes';
import {
  DataStatusService,
  NetworkRepository,
  ShapeRepository,
  StreetRepository,
  ZoneRepository,
  ScheduleRepository,
} from '../core/data/repositories';
import { MapProvider } from '../core/map/map-provider';
import { buildIndex } from '../data/static-repositories';
import { networkFixture } from '../data/testing/data-fixtures';
import { HomePage } from './home/home.page';
import { FavoritesService } from '../core/favorites/favorites.service';
import { LocationService, LocationState } from '../core/location/location.service';
import { PlanPage } from './plan/plan.page';
import { StopsPage } from './stops/stops.page';

/** Pantallas con datos de prueba: búsqueda, listas y detalles (RF-03 a RF-06). */
describe('Pantallas con datos', () => {
  beforeEach(() => {
    localStorage.clear();
    const index = buildIndex(networkFixture());
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
          useValue: {
            status: signal({
              state: 'ready',
              origin: 'network',
              generatedAt: new Date('2026-10-03'),
              updateFailed: false,
              checking: false,
            }),
            refresh: () => Promise.resolve(),
          },
        },
        { provide: ShapeRepository, useValue: { getShapes: () => Promise.resolve(new Map()) } },
        {
          provide: ScheduleRepository,
          useValue: {
            getTimetables: () => Promise.resolve({ services: new Map(), departures: new Map() }),
          },
        },
        {
          provide: ZoneRepository,
          useValue: {
            getZones: () =>
              Promise.resolve([
                {
                  id: 'b-miraflores',
                  name: 'Miraflores de los Ángeles',
                  kind: 'neighbourhood',
                  polygons: [],
                  stopIds: index.stops.map((stop) => stop.id),
                },
              ]),
          },
        },
        { provide: MapProvider, useValue: { isSupported: () => false } },
        { provide: StreetRepository, useValue: { getStreets: () => Promise.resolve([]) } },
        {
          provide: LocationService,
          useValue: { state: signal({ status: 'idle' }), locate: () => Promise.resolve() },
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
      ],
    });
  });

  async function open(url: string): Promise<HTMLElement> {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    harness.detectChanges();
    await harness.fixture.whenStable();
    return harness.routeNativeElement as HTMLElement;
  }

  it('la búsqueda del inicio muestra líneas y paradas', async () => {
    const harness = await RouterTestingHarness.create();
    const home = await harness.navigateByUrl('/', HomePage);
    (home as unknown as { query: { set(v: string): void } }).query.set('alameda');
    harness.detectChanges();
    const text = (harness.routeNativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Encontradas: 0 zonas, 0 calles, 1 líneas y 1 paradas');
    expect(text).toContain('Alameda - Universidad');
  });

  it('la búsqueda del inicio encuentra barrios y los abre en el mapa', async () => {
    const harness = await RouterTestingHarness.create();
    const home = await harness.navigateByUrl('/', HomePage);
    (home as unknown as { setQuery(v: string): void }).setQuery('miraflores');
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const element = harness.routeNativeElement as HTMLElement;
    expect(element.textContent).toContain('Miraflores de los Ángeles');

    const zoneItem = [...element.querySelectorAll('ion-item')].find((item) =>
      item.textContent?.includes('Miraflores de los Ángeles'),
    );
    expect(
      zoneItem?.getAttribute('href') ?? zoneItem?.querySelector('a')?.getAttribute('href'),
    ).toBe('/map?zone=b-miraflores');
  });

  it('en Paradas, elegir una parada muestra su ficha con sus líneas', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/stops', StopsPage);
    const element = harness.routeNativeElement as HTMLElement;
    expect(element.querySelectorAll('ion-list ion-item').length).toBe(
      networkFixture().stops.length,
    );

    (page as unknown as { selectStop(id: string): void }).selectStop('2');
    harness.detectChanges();
    const card = element.querySelector('app-stop-card');
    expect(card?.textContent).toContain('Alameda');
    expect(card?.querySelectorAll('app-line-badge').length).toBeGreaterThan(0);
  });

  it('en modo sencillo (aquí, sin WebGL) el inicio no ofrece el mapa', async () => {
    const home = await open('/');
    const links = [...home.querySelectorAll('nav a')].map((a) => a.getAttribute('href'));
    expect(links).toContain('/lines');
    expect(links).not.toContain('/map');
  });

  it('en modo sencillo el detalle de parada no pinta el mapa', async () => {
    const stop = await open('/stops/2');
    expect(stop.textContent).toContain('Alameda');
    expect(stop.querySelector('app-map-view, .detail-map')).toBeNull();
  });

  it('el inicio muestra todas las favoritas, con la primera desplegada y plegable', async () => {
    localStorage.setItem(
      'emt-remake.favorites.v1',
      JSON.stringify([
        { kind: 'stop', stopId: '2' },
        {
          kind: 'trip',
          origin: { kind: 'stop', id: '1', name: 'Zapateros' },
          destination: { kind: 'stop', id: '2', name: 'Alameda' },
        },
      ]),
    );
    TestBed.inject(FavoritesService);
    // Inicio: todas las favoritas; la primera desplegada, y se puede cerrar.
    const home = await open('/');
    const section = home.querySelector('app-favorites-section');
    const tile = section?.querySelector('app-favorite-stop-tile');
    expect(tile?.textContent).toContain('Alameda');
    expect(tile?.querySelectorAll('app-next-bus').length).toBeGreaterThan(0);
    const toggle = tile?.querySelector<HTMLButtonElement>('button.toggle');
    toggle?.click();
    TestBed.tick();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(tile?.querySelector('app-next-bus')).toBeNull();
    expect(section?.querySelector('a[href^="/plan"]')).not.toBeNull();
  });

  it('Favoritos lista las paradas (plegadas) y los trayectos guardados', async () => {
    localStorage.setItem(
      'emt-remake.favorites.v1',
      JSON.stringify([
        { kind: 'stop', stopId: '2' },
        {
          kind: 'trip',
          origin: { kind: 'stop', id: '1', name: 'Zapateros' },
          destination: { kind: 'stop', id: '2', name: 'Alameda' },
        },
      ]),
    );
    TestBed.inject(FavoritesService);
    // Plegada con nombre y líneas; al pulsarla se despliega.
    const page = await open('/favorites');
    const section = page.querySelector('app-favorites-section');
    expect(section?.textContent).toContain('Mis favoritos');
    const tile = section?.querySelector('app-favorite-stop-tile');
    expect(tile?.textContent).toContain('Alameda');
    expect(tile?.querySelectorAll('app-line-badge').length).toBeGreaterThan(0);
    expect(tile?.querySelector('app-next-bus')).toBeNull();
    const toggle = tile?.querySelector<HTMLButtonElement>('button.toggle');
    toggle?.click();
    TestBed.tick();
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(tile?.querySelectorAll('app-next-bus').length).toBeGreaterThan(0);
    expect(section?.querySelector('a[href^="/plan"]')?.getAttribute('href')).toBe(
      '/plan?from=stop:1&to=stop:2',
    );
  });

  it('"Cómo llegar" abre con origen y destino desde la URL', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/plan?from=stop:1&to=stop:2');
    harness.detectChanges();
    const text =
      (harness.routeNativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
    expect(text).toContain('Sube en Zapateros (1)');
  });

  it('"Cerca de mí" lista las paradas cercanas con su distancia', async () => {
    const stop = networkFixture().stops[0]!;
    const state = signal<LocationState>({ status: 'idle' });
    TestBed.overrideProvider(LocationService, {
      useValue: {
        state,
        locate: async () =>
          state.set({ status: 'ready', point: [stop.lat, stop.lon], accuracy: 10, at: new Date() }),
      },
    });
    const element = await open('/near');
    await Promise.resolve();
    TestBed.tick();
    const text = element.textContent ?? '';
    expect(text).toContain(stop.name);
    expect(text).toMatch(/\d+ m · \d+ min andando/);
  });

  it('"Cerca de mí" explica qué hacer si no hay permiso', async () => {
    TestBed.overrideProvider(LocationService, {
      useValue: { state: signal({ status: 'denied' }), locate: async () => undefined },
    });
    const element = await open('/near');
    expect(element.textContent).toContain('Sin permiso para usar tu ubicación');
  });

  it('la lista de líneas muestra todas las líneas ordenadas', async () => {
    const element = await open('/lines');
    const labels = [...element.querySelectorAll('app-line-badge')].map((b) =>
      b.textContent?.trim(),
    );
    expect(labels).toEqual(['2', '10']);
  });

  it('el detalle de línea muestra las paradas del sentido pedido en orden', async () => {
    const element = await open('/lines/2?direction=2');
    const items = [...element.querySelectorAll('ion-item .stop-link')].map((l) =>
      l.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(element.textContent).toContain('Hacia Alameda · 2 paradas');
    expect(items[0]).toContain('1. Alameda');
    expect(items[1]).toContain('2. Zapateros');
  });

  it('el detalle de línea cambia de sentido con los botones', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/lines/2');
    harness.detectChanges();
    await harness.fixture.whenStable();
    const element = harness.routeNativeElement as HTMLElement;
    // Ionic traslada aria-pressed al botón interno, así que aquí se comprueba "fill".
    const buttons = element.querySelectorAll<HTMLElement & { fill?: string }>(
      '.directions ion-button',
    );
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.fill).toBe('solid');

    buttons[1]?.click();
    harness.detectChanges();
    await harness.fixture.whenStable();

    expect(element.querySelector('h2')?.textContent).toContain('Hacia Alameda');
    expect(buttons[1]?.fill).toBe('solid');
    expect(buttons[0]?.fill).toBe('outline');
  });

  it('el detalle de línea avisa si la línea no existe', async () => {
    const element = await open('/lines/999');
    expect(element.textContent).toContain('No existe la línea 999.');
  });

  it('el detalle de parada muestra las líneas que pasan y su sentido', async () => {
    const element = await open('/stops/2');
    const text = element.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(text).toContain('Alameda');
    expect(text).toContain('Hacia Universidad');
    expect(text).toContain('Hacia Centro');
  });

  it('los ajustes muestran idiomas, temas y tamaño de los autobuses', async () => {
    const element = await open('/settings');
    const radios = [...element.querySelectorAll('ion-radio')];
    expect(radios.map((r) => r.getAttribute('aria-label') ?? r.textContent?.trim())).toEqual([
      'Español',
      'English',
      'Según el sistema',
      'Claro',
      'Oscuro',
      'Pequeño',
      'Normal',
      'Grande',
    ]);
  });

  it('"Acerca de" avisa de que la app no es oficial e indica licencias', async () => {
    const element = await open('/about');
    const text = element.textContent ?? '';
    expect(text).toContain('Aplicación no oficial');
    expect(text).toContain('CC BY-SA 4.0');
    expect(text).toContain('OpenStreetMap');
  });

  it('"Cómo llegar" propone la línea directa con su tiempo aproximado', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/plan', PlanPage);
    const signals = page as unknown as {
      origin: { set(p: unknown): void };
      destination: { set(p: unknown): void };
    };
    signals.origin.set({ kind: 'stop', id: '1', name: 'Zapateros', stopIds: ['1'] });
    signals.destination.set({ kind: 'stop', id: '2', name: 'Alameda', stopIds: ['2'] });
    harness.detectChanges();
    const text =
      (harness.routeNativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';

    expect(text).toContain('Recomendada');
    expect(text).toContain('Sube en Zapateros (1)');
    expect(text).toContain('Baja en Alameda (2)');
    // Las líneas de prueba no traen horario: se muestra el tiempo estimado sin horas.
    expect(text).toContain('sin horario publicado');
  });
});
