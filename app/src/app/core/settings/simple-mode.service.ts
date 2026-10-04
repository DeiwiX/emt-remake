import { Injectable, computed, inject } from '@angular/core';

import { MapProvider } from '../map/map-provider';
import { SettingsService } from './settings.service';

/**
 * Modo sencillo (RF-07): solo listas y texto, sin mapa. Se activa desde
 * Ajustes o, si el dispositivo no puede pintar mapas (sin WebGL), siempre.
 * Con él activo no se crea ningún mapa, así que la librería del mapa no se
 * descarga (se importa al crear el primero).
 */
@Injectable({ providedIn: 'root' })
export class SimpleModeService {
  private readonly settings = inject(SettingsService).settings;

  /** true si el dispositivo no puede mostrar el mapa: el modo sencillo no se puede quitar. */
  readonly forced = !inject(MapProvider).isSupported();

  readonly active = computed(() => this.forced || this.settings().simpleMode);
}
