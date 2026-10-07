import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';

import { TranslocoTestingModule } from '@jsverse/transloco';

import es from '../../public/i18n/es.json';
import { App } from './app';
import { MapProvider } from './core/map/map-provider';

describe('App', () => {
  it('se crea con el contenedor de Ionic', async () => {
    await TestBed.configureTestingModule({
      imports: [
        App,
        TranslocoTestingModule.forRoot({
          langs: { es },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        provideIonicAngular(),
        { provide: MapProvider, useValue: { isSupported: () => false } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    const element = fixture.nativeElement as HTMLElement;

    expect(fixture.componentInstance).toBeTruthy();
    expect(element.querySelector('ion-app')).not.toBeNull();
    // Barra inferior con las cuatro secciones.
    fixture.detectChanges();
    expect(element.querySelectorAll('app-bottom-nav a').length).toBe(4);
  });
});
