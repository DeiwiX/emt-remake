import { Injectable, computed, inject } from '@angular/core';

import { NetworkRepository, ShapeRepository } from '../core/data/repositories';
import { LatLon, Line, ShapeDetail, Stop, StopService } from '../core/models/network.model';
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
