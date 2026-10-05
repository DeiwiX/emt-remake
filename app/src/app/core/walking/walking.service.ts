import { Injectable, inject, signal } from '@angular/core';

import { LatLon } from '../models/network.model';
import { NetworkRepository, WalkGraphRepository } from '../data/repositories';
import { Place } from '../planner/planner';
import { withStreetWalks } from './walk-access';
import { WalkGraph, WalkPath } from './walk-graph';

/**
 * Rutas andando por las calles (opción 2B). La red peatonal se descarga la
 * primera vez que se pide; hasta entonces (o si no se publica) las pantallas
 * siguen con la estimación en línea recta.
 */
@Injectable({ providedIn: 'root' })
export class WalkingService {
  private readonly repository = inject(WalkGraphRepository);
  private readonly network = inject(NetworkRepository);
  private readonly graphSignal = signal<WalkGraph | null>(null);
  private loading: Promise<void> | null = null;

  /** La red, cuando ya está cargada. */
  readonly graph = this.graphSignal.asReadonly();

  load(): Promise<void> {
    if (this.graphSignal()) return Promise.resolve();
    this.loading ??= this.repository
      .getWalkGraph()
      .then((graph) => this.graphSignal.set(graph))
      .catch((error: unknown) => console.warn('No se pudo cargar la red peatonal', error))
      .finally(() => (this.loading = null));
    return this.loading;
  }

  /** El lugar con los minutos andando del camino real a cada parada (si ya hay red). */
  refine(place: Place | null): Place | null {
    const graph = this.graphSignal();
    return place && graph ? withStreetWalks(place, graph, (id) => this.network.getStop(id)) : place;
  }

  /** Camino por las calles entre dos puntos (null sin red o sin camino). */
  path(from: LatLon, to: LatLon): WalkPath | null {
    return this.graphSignal()?.route(from, to) ?? null;
  }
}
