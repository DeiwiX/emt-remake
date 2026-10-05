import { Provider, EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';

import {
  DataStatusService,
  NetworkRepository,
  ScheduleRepository,
  ShapeRepository,
  StreetRepository,
  TrafficRepository,
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
    { provide: WalkGraphRepository, useClass: StaticWalkGraphRepository },
    { provide: ScheduleRepository, useClass: StaticScheduleRepository },
    // No se espera al resultado: la app se pinta mientras se cargan los datos.
    provideAppInitializer(() => {
      void inject(DataStatusService).refresh();
    }),
  ];
}
