import { Injectable, computed, signal } from '@angular/core';

import { Favorite, cleanAlias, favoriteKey, parseFavorites } from './favorites';

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

  /** Nombre propio de una parada guardada ("Casa"), o undefined. */
  aliasOf(stopId: string): string | undefined {
    const favorite = this.favorites().find((f) => f.kind === 'stop' && f.stopId === stopId);
    return favorite?.kind === 'stop' ? favorite.alias : undefined;
  }

  /** Pone (o quita, con un texto vacío) el nombre propio de una parada guardada. */
  rename(stopId: string, alias: string): void {
    const clean = cleanAlias(alias);
    this.favoritesSignal.update((list) =>
      list.map((f) =>
        f.kind === 'stop' && f.stopId === stopId
          ? clean
            ? { kind: 'stop', stopId, alias: clean }
            : { kind: 'stop', stopId }
          : f,
      ),
    );
    save(this.favoritesSignal());
  }

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
