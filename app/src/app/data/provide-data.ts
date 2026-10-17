import { Provider, EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';

/**
 * Al volver a la app se comprueba si hay datos nuevos, como mucho una vez cada
 * 30 min: Android puede tenerla abierta en segundo plano durante días y, si no,
 * solo se comprobaba al arrancar (optimización 1, 16/10/2026).
 */
const RESUME_CHECK_MS = 30 * 60_000;

import {
  DataStatusService,
  NetworkRepository,
  ScheduleRepository,
  ShapeRepository,
  StreetRepository,
  TrafficRepository,
  DelayRepository,
  WalkGraphRepository,
  ZoneRepository,
} from '../core/data/repositories';
import { DatasetSyncService } from './dataset-sync.service';
import { KeyValueStore, createKeyValueStore } from './key-value-store';
import {
  StaticNetworkRepository,
  StaticScheduleRepository,
  StaticShapeRepository,
  StaticStreetRepository,
  StaticTrafficRepository,
  StaticDelayRepository,
  StaticWalkGraphRepository,
  StaticZoneRepository,
} from './static-repositories';

/**
 * Conecta las interfaces de core/data con la implementación de la Fase 1
 * (ficheros estáticos publicados). Cambiar de fuente es cambiar este fichero.
 */
export function provideData(): (Provider | EnvironmentProviders)[] {
  return [
    { provide: KeyValueStore, useFactory: createKeyValueStore },
    { provide: DataStatusService, useExisting: DatasetSyncService },
    { provide: NetworkRepository, useClass: StaticNetworkRepository },
    { provide: ShapeRepository, useClass: StaticShapeRepository },
    { provide: ZoneRepository, useClass: StaticZoneRepository },
    { provide: StreetRepository, useClass: StaticStreetRepository },
    { provide: TrafficRepository, useClass: StaticTrafficRepository },
    { provide: DelayRepository, useClass: StaticDelayRepository },
    { provide: WalkGraphRepository, useClass: StaticWalkGraphRepository },
    { provide: ScheduleRepository, useClass: StaticScheduleRepository },
    // No se espera al resultado: la app se pinta mientras se cargan los datos.
    provideAppInitializer(() => {
      const data = inject(DataStatusService);
      let lastCheck = Date.now();
      void data.refresh();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || Date.now() - lastCheck < RESUME_CHECK_MS) {
          return;
        }
        lastCheck = Date.now();
        void data.refresh();
      });
    }),
  ];
}
