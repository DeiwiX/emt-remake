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
  ZoneRepository,
  ScheduleRepository,
} from '../core/data/repositories';
import { MapProvider } from '../core/map/map-provider';
import { buildIndex } from '../data/static-repositories';
import { networkFixture } from '../data/testing/data-fixtures';
import { HomePage } from './home/home.page';
import { PlanPage } from './plan/plan.page';

/** Pantallas con datos de prueba: búsqueda, listas y detalles (RF-03 a RF-06). */
describe('Pantallas con datos', () => {
  beforeEach(() => {
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
        { provide: ZoneRepository, useValue: { getZones: () => Promise.resolve([]) } },
        { provide: MapProvider, useValue: { isSupported: () => false } },
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

    expect(text).toContain('Encontradas: 1 líneas y 1 paradas');
    expect(text).toContain('Alameda - Universidad');
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
    const items = [...element.querySelectorAll('ion-item ion-label')].map((l) =>
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

  it('los ajustes muestran idiomas y temas y guardan la elección', async () => {
    const element = await open('/settings');
    const radios = [...element.querySelectorAll('ion-radio')];
    expect(radios.map((r) => r.getAttribute('aria-label') ?? r.textContent?.trim())).toEqual([
      'Español',
      'English',
      'Según el sistema',
      'Claro',
      'Oscuro',
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
