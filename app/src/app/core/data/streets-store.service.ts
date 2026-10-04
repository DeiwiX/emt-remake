import { Injectable, effect, inject, signal } from '@angular/core';

import { Street } from '../models/network.model';
import { DataStatusService, StreetRepository } from './repositories';

/**
 * Calles del callejero compartidas por los buscadores (inicio, mapa y "Cómo
 * llegar"). Se descargan la primera vez que se busca y se reintenta si
 * fallaron (sin conexión, o datos guardados anteriores a las calles) cuando
 * se vuelven a pedir o llegan datos nuevos.
 */
@Injectable({ providedIn: 'root' })
export class StreetsStore {
  private readonly repository = inject(StreetRepository);
  private readonly dataStatus = inject(DataStatusService);
  private readonly streetsSignal = signal<readonly Street[]>([]);
  private loading: Promise<void> | null = null;
  private requested = false;

  readonly streets = this.streetsSignal.asReadonly();

  constructor() {
    effect(() => {
      this.dataStatus.status();
      if (this.requested) void this.load();
    });
  }

  /** Pide las calles; sin ellas la búsqueda sigue funcionando con líneas y paradas. */
  load(): Promise<void> {
    this.requested = true;
    if (this.streetsSignal().length > 0) return Promise.resolve();
    this.loading ??= this.repository
      .getStreets()
      .then((streets) => this.streetsSignal.set(streets))
      .catch((error: unknown) => console.warn('No se pudieron cargar las calles', error))
      .finally(() => (this.loading = null));
    return this.loading;
  }
}
