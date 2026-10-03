import { ApplicationInitStatus, DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';

import { provideSettings } from './provide-settings';
import { SettingsService, loadSettings } from './settings.service';

const STORAGE_KEY = 'emt-remake.settings.v1';

describe('Ajustes', () => {
  beforeEach(() => localStorage.clear());

  describe('loadSettings', () => {
    it('sin nada guardado usa valores por defecto', () => {
      expect(loadSettings()).toMatchObject({
        theme: 'system',
        highContrast: false,
        simpleMode: false,
        mapStyle: 'auto',
      });
    });

    it('recupera lo guardado y descarta valores desconocidos', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          language: 'fr',
          theme: 'dark',
          highContrast: 'sí',
          simpleMode: true,
          mapStyle: 'satellite',
        }),
      );
      const settings = loadSettings();
      expect(settings.theme).toBe('dark');
      expect(settings.simpleMode).toBe(true);
      expect(settings.mapStyle).toBe('satellite');
      expect(settings.highContrast).toBe(false);
      expect(['es', 'en']).toContain(settings.language);
    });

    it('ignora datos dañados', () => {
      localStorage.setItem(STORAGE_KEY, '{no es json');
      expect(loadSettings().theme).toBe('system');
    });
  });

  describe('aplicación de los ajustes', () => {
    let settings: SettingsService;
    let document: Document;

    beforeEach(async () => {
      TestBed.configureTestingModule({
        imports: [
          TranslocoTestingModule.forRoot({
            langs: { es: {}, en: {} },
            translocoConfig: { availableLangs: ['es', 'en'], defaultLang: 'es' },
          }),
        ],
        providers: [provideSettings()],
      });
      await TestBed.inject(ApplicationInitStatus).donePromise;
      settings = TestBed.inject(SettingsService);
      document = TestBed.inject(DOCUMENT);
    });

    it('cambia el idioma de los textos y el atributo lang del documento', () => {
      settings.update({ language: 'en' });
      TestBed.tick();
      expect(TestBed.inject(TranslocoService).getActiveLang()).toBe('en');
      expect(document.documentElement.lang).toBe('en');
    });

    it('activa las paletas oscura y de alto contraste y guarda la elección', () => {
      settings.update({ theme: 'dark', highContrast: true });
      TestBed.tick();
      expect(document.documentElement.classList).toContain('ion-palette-dark');
      expect(document.documentElement.classList).toContain('ion-palette-high-contrast');
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({
        theme: 'dark',
        highContrast: true,
      });

      settings.update({ theme: 'light', highContrast: false });
      TestBed.tick();
      expect(document.documentElement.classList).not.toContain('ion-palette-dark');
      expect(document.documentElement.classList).not.toContain('ion-palette-high-contrast');
    });
  });
});
