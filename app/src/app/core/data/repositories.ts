import { Injectable, Signal } from '@angular/core';

import {
  LatLon,
  Line,
  ShapeDetail,
  Stop,
  Street,
  TrafficItem,
  Zone,
} from '../models/network.model';
import { Timetables } from '../schedule/schedule';
import { DataStatus } from './data-status';

/**
 * Contratos de acceso a datos. Las pantallas dependen de estas clases abstractas
 * (que sirven también de token de inyección) y no de una fuente concreta: una
 * API propia u oficial futura sería otra implementación (RNF-07).
 */

export abstract class NetworkRepository {
  /** Líneas ordenadas por código; vacío mientras no hay datos. */
  abstract readonly lines: Signal<readonly Line[]>;
  /** Paradas ordenadas por nombre; vacío mientras no hay datos. */
  abstract readonly stops: Signal<readonly Stop[]>;
  abstract getLine(id: string): Line | undefined;
  abstract getStop(id: string): Stop | undefined;
}

export abstract class ShapeRepository {
  /** Trazados por shapeId. Se descargan solo cuando se piden (al abrir el mapa). */
  abstract getShapes(detail: ShapeDetail): Promise<ReadonlyMap<string, readonly LatLon[]>>;
}

export abstract class ZoneRepository {
  /** Barrios y distritos. Se descargan solo cuando se piden (búsqueda en el mapa). */
  abstract getZones(): Promise<readonly Zone[]>;
}

export abstract class StreetRepository {
  /** Calles del callejero. Se descargan solo cuando se piden (buscar por calle). */
  abstract getStreets(): Promise<readonly Street[]>;
}

/**
 * Cortes de tráfico e incidencias. Se descargan al abrir el mapa. Sin
 * configurar (pruebas), no hay ninguno.
 */
@Injectable({ providedIn: 'root', useFactory: () => ({ getTraffic: () => Promise.resolve([]) }) })
export abstract class TrafficRepository {
  abstract getTraffic(): Promise<readonly TrafficItem[]>;
}

export abstract class ScheduleRepository {
  /** Horario programado de todas las líneas. Se descarga solo cuando se pide. */
  abstract getTimetables(): Promise<Timetables>;
}

export abstract class DataStatusService {
  abstract readonly status: Signal<DataStatus>;
  /** Carga los datos guardados y comprueba si hay una versión nueva. */
  abstract refresh(): Promise<void>;
}
