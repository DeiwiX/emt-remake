import { Injectable, computed, signal } from '@angular/core';

import { Favorite, favoriteKey, parseFavorites } from './favorites';

const STORAGE_KEY = 'emt-remake.favorites.v1';

/**
 * Favoritos guardados solo en este dispositivo, sin cuentas ni nube
 * (decisión del desarrollador, 04/10/2026). Son pocos datos, así que basta
 * localStorage, como los ajustes; sin él, valen para la sesión.
 */
@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly favoritesSignal = signal<readonly Favorite[]>(load());
  /** En el orden en que se guardaron. */
  readonly favorites = this.favoritesSignal.asReadonly();
  private readonly keys = computed(() => new Set(this.favorites().map(favoriteKey)));

  readonly stops = computed(() =>
    this.favorites().flatMap((f) => (f.kind === 'stop' ? [f.stopId] : [])),
  );
  readonly lines = computed(() =>
    this.favorites().flatMap((f) => (f.kind === 'line' ? [f.lineId] : [])),
  );
  readonly trips = computed(() => this.favorites().flatMap((f) => (f.kind === 'trip' ? [f] : [])));

  has(favorite: Favorite): boolean {
    return this.keys().has(favoriteKey(favorite));
  }

  /** Lo guarda si no estaba y lo quita si estaba. Devuelve si queda guardado. */
  toggle(favorite: Favorite): boolean {
    const key = favoriteKey(favorite);
    const saved = this.has(favorite);
    this.favoritesSignal.update((list) =>
      saved ? list.filter((f) => favoriteKey(f) !== key) : [...list, favorite],
    );
    save(this.favoritesSignal());
    return !saved;
  }
}

function load(): Favorite[] {
  try {
    return parseFavorites(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

function save(favorites: readonly Favorite[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  } catch {
    // Sin almacenamiento: los favoritos valen para esta sesión.
  }
}
