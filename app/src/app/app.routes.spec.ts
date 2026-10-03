import { TestBed } from '@angular/core/testing';
import { Type } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideIonicAngular } from '@ionic/angular';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { routes } from './app.routes';
import { signal } from '@angular/core';
import { DataStatusService, NetworkRepository } from './core/data/repositories';
import es from '../../public/i18n/es.json';
import { HomePage } from './features/home/home.page';
import { LinesPage } from './features/lines/lines.page';
import { LineDetailPage } from './features/line-detail/line-detail.page';
import { StopsPage } from './features/stops/stops.page';
import { StopDetailPage } from './features/stop-detail/stop-detail.page';
import { MapPage } from './features/map/map.page';
import { SettingsPage } from './features/settings/settings.page';
import { AboutPage } from './features/about/about.page';

describe('Rutas de la app', () => {
  beforeEach(() => {
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
            lines: signal([]),
            stops: signal([]),
            getLine: () => undefined,
            getStop: () => undefined,
          },
        },
      ],
    });
  });

  const cases: [string, Type<unknown>][] = [
    ['/', HomePage],
    ['/lines', LinesPage],
    ['/lines/C1', LineDetailPage],
    ['/stops', StopsPage],
    ['/stops/152', StopDetailPage],
    ['/map', MapPage],
    ['/settings', SettingsPage],
    ['/about', AboutPage],
  ];

  it.each(cases)('%s carga su pantalla', async (url, page) => {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(url);
    expect(component).toBeInstanceOf(page);
  });

  it('pasa el identificador de la ruta al detalle de línea', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/lines/C1', LineDetailPage);
    expect(page.lineId()).toBe('C1');
  });

  it('redirige las rutas desconocidas al inicio', async () => {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/no-existe');
    expect(component).toBeInstanceOf(HomePage);
  });
});
