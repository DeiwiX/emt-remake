import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';

import { routes } from './app.routes';
import { provideI18n } from './core/i18n/i18n.providers';
import { provideData } from './data/provide-data';
import { provideSettings } from './core/settings/provide-settings';
import { prefersReducedMotion } from './core/theme/color-scheme.service';
import { MapProvider } from './core/map/map-provider';
import { MapLibreMapProvider } from './map/maplibre-map.provider';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch()),
    // Sin precarga: las pantallas se descargan solo al visitarlas (RNF-02).
    provideRouter(routes, withComponentInputBinding()),
    // Sin animaciones de transición si el sistema pide reducir el movimiento (RNF-05).
    provideIonicAngular({ animated: !prefersReducedMotion() }),
    provideI18n(),
    provideSettings(),
    provideData(),
    // Proveedor de mapas intercambiable (ADR 0003).
    { provide: MapProvider, useClass: MapLibreMapProvider },
  ],
};
