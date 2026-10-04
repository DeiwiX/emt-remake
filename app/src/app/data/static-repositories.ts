import { Injectable, computed, inject } from '@angular/core';

import {
  NetworkRepository,
  ScheduleRepository,
  ShapeRepository,
  StreetRepository,
  ZoneRepository,
} from '../core/data/repositories';
import { Timetables } from '../core/schedule/schedule';
import {
  LatLon,
  Line,
  ShapeDetail,
  Stop,
  StopService,
  Street,
  Zone,
} from '../core/models/network.model';
import { DatasetSyncService } from './dataset-sync.service';
import { NetworkFile } from './published-format';
import { decodePolyline } from './polyline';

interface NetworkIndex {
  lines: readonly Line[];
  stops: readonly Stop[];
  linesById: ReadonlyMap<string, Line>;
  stopsById: ReadonlyMap<string, Stop>;
}

const EMPTY_INDEX: NetworkIndex = {
  lines: [],
  stops: [],
  linesById: new Map(),
  stopsById: new Map(),
};

/** Repositorio de líneas y paradas sobre los ficheros estáticos publicados. */
@Injectable()
export class StaticNetworkRepository extends NetworkRepository {
  private readonly sync = inject(DatasetSyncService);
  private readonly index = computed(() => {
    const network = this.sync.network();
    return network ? buildIndex(network) : EMPTY_INDEX;
  });

  readonly lines = computed(() => this.index().lines);
  readonly stops = computed(() => this.index().stops);

  getLine(id: string): Line | undefined {
    return this.index().linesById.get(id);
  }

  getStop(id: string): Stop | undefined {
    return this.index().stopsById.get(id);
  }
}

/** Repositorio de trazados: descarga bajo demanda y decodifica las polilíneas. */
@Injectable()
export class StaticShapeRepository extends ShapeRepository {
  private readonly sync = inject(DatasetSyncService);

  async getShapes(detail: ShapeDetail): Promise<ReadonlyMap<string, readonly LatLon[]>> {
    const file = await this.sync.getShapesFile(detail);
    return new Map(
      Object.entries(file.shapes).map(([id, encoded]) => [id, decodePolyline(encoded)]),
    );
  }
}

/** Repositorio de barrios y distritos: descarga bajo demanda y decodifica los contornos. */
@Injectable()
export class StaticZoneRepository extends ZoneRepository {
  private readonly sync = inject(DatasetSyncService);

  async getZones(): Promise<readonly Zone[]> {
    const file = await this.sync.getZonesFile();
    return file.zones.map((zone) => ({
      ...zone,
      polygons: zone.polygons.map((polygon) => polygon.map(decodePolyline)),
    }));
  }
}

/** Repositorio de calles: descarga bajo demanda y decodifica los portales. */
@Injectable()
export class StaticStreetRepository extends StreetRepository {
  private readonly sync = inject(DatasetSyncService);

  async getStreets(): Promise<readonly Street[]> {
    const file = await this.sync.getStreetsFile();
    return file.streets.map((street) => ({
      id: street.id,
      name: street.name,
      points: decodePolyline(street.points),
      numbers: street.numbers,
    }));
  }
}

/** Repositorio del horario programado: descarga bajo demanda y lo indexa. */
@Injectable()
export class StaticScheduleRepository extends ScheduleRepository {
  private readonly sync = inject(DatasetSyncService);

  async getTimetables(): Promise<Timetables> {
    const file = await this.sync.getTimetablesFile();
    return {
      services: new Map(Object.entries(file.services).map(([s, dates]) => [s, new Set(dates)])),
      departures: new Map(
        Object.entries(file.departures).map(([key, byService]) => [
          key,
          new Map(Object.entries(byService)),
        ]),
      ),
      ...(file.profiles && file.departureProfiles
        ? {
            profiles: new Map(Object.entries(file.profiles)),
            departureProfiles: new Map(
              Object.entries(file.departureProfiles).map(([key, byService]) => [
                key,
                new Map(Object.entries(byService)),
              ]),
            ),
          }
        : {}),
    };
  }
}

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

export function buildIndex(network: NetworkFile): NetworkIndex {
  const lines: Line[] = network.lines
    .map((line) => ({
      id: line.id,
      name: line.name,
      notes: line.notes,
      directions: line.directions.map((d) => ({ ...d, stopIds: [...d.stopIds] })),
    }))
    .sort((a, b) => collator.compare(a.id, b.id));

  const services = new Map<string, StopService[]>();
  for (const line of lines) {
    for (const direction of line.directions) {
      // Una parada puede repetirse en un sentido (p. ej. circulares); se cuenta una vez.
      for (const stopId of new Set(direction.stopIds)) {
        const list = services.get(stopId) ?? [];
        list.push({ lineId: line.id, directionId: direction.id });
        services.set(stopId, list);
      }
    }
  }

  const stops: Stop[] = network.stops
    .map((stop) => ({ ...stop, services: services.get(stop.id) ?? [] }))
    .sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.id, b.id));

  return {
    lines,
    stops,
    linesById: new Map(lines.map((l) => [l.id, l])),
    stopsById: new Map(stops.map((s) => [s.id, s])),
  };
}
