import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';

import { routes } from './app.routes';
import { provideI18n } from './core/i18n/i18n.providers';
import { provideData } from './data/provide-data';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch()),
    // Sin precarga: las pantallas se descargan solo al visitarlas (RNF-02).
    provideRouter(routes, withComponentInputBinding()),
    provideIonicAngular(),
    provideI18n(),
    provideData(),
  ],
};
