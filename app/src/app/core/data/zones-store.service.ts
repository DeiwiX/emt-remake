import { Injectable, effect, inject, signal } from '@angular/core';

import { Zone } from '../models/network.model';
import { DataStatusService, ZoneRepository } from './repositories';

/**
 * Barrios y distritos compartidos por las pantallas que buscan por zona
 * (inicio, mapa y "Cómo llegar"). Se descargan la primera vez que se piden y
 * se reintenta si fallaron (sin conexión, o datos guardados anteriores a las
 * zonas) cuando se vuelven a pedir o llegan datos nuevos.
 */
@Injectable({ providedIn: 'root' })
export class ZonesStore {
  private readonly repository = inject(ZoneRepository);
  private readonly dataStatus = inject(DataStatusService);
  private readonly zonesSignal = signal<readonly Zone[]>([]);
  private loading: Promise<void> | null = null;
  private requested = false;

  readonly zones = this.zonesSignal.asReadonly();

  constructor() {
    effect(() => {
      this.dataStatus.status();
      if (this.requested) void this.load();
    });
  }

  /** Pide las zonas; sin ellas la búsqueda sigue funcionando con líneas y paradas. */
  load(): Promise<void> {
    this.requested = true;
    if (this.zonesSignal().length > 0) return Promise.resolve();
    this.loading ??= this.repository
      .getZones()
      .then((zones) => this.zonesSignal.set(zones))
      .catch((error: unknown) => console.warn('No se pudieron cargar las zonas', error))
      .finally(() => (this.loading = null));
    return this.loading;
  }
}
