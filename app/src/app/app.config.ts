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
import { LocationService } from './core/location/location.service';
import { CapacitorLocationService } from './location/capacitor-location.service';
import { RealtimeSource } from './core/realtime/realtime.service';
import { CapacitorRealtimeSource } from './realtime/capacitor-realtime.source';
import { ArrivalNotifier } from './core/realtime/arrival-notifier';
import { CapacitorArrivalNotifier } from './realtime/capacitor-arrival.notifier';

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
    { provide: LocationService, useClass: CapacitorLocationService },
    { provide: RealtimeSource, useClass: CapacitorRealtimeSource },
    { provide: ArrivalNotifier, useClass: CapacitorArrivalNotifier },
  ],
};
