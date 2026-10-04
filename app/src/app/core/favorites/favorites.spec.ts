import { TestBed } from '@angular/core/testing';

import { Stop, Zone } from '../models/network.model';
import { favoriteKey, parseFavorites, placeParam, resolvePlace } from './favorites';
import { FavoritesService } from './favorites.service';

const STORAGE_KEY = 'emt-remake.favorites.v1';

const stop = { id: '152', name: 'Postas', lat: 0, lon: 0, services: [] } as unknown as Stop;
const zone: Zone = {
  id: 'b1',
  kind: 'neighbourhood',
  name: 'Teatinos',
  polygons: [],
  stopIds: ['152', '153'],
};

describe('Favoritos', () => {
  beforeEach(() => localStorage.clear());

  describe('parseFavorites', () => {
    it('descarta datos dañados, tipos desconocidos y repetidos', () => {
      const raw = JSON.stringify([
        { kind: 'stop', stopId: '152' },
        { kind: 'stop', stopId: '152' },
        { kind: 'line', lineId: 1 },
        { kind: 'banana' },
        null,
        {
          kind: 'trip',
          origin: { kind: 'stop', id: '152', name: 'Postas' },
          destination: { kind: 'neighbourhood', id: 'b1', name: 'Teatinos' },
        },
        { kind: 'trip', origin: { kind: 'planet', id: 'x', name: 'x' }, destination: {} },
      ]);
      expect(parseFavorites(raw).map(favoriteKey)).toEqual([
        'stop:152',
        'trip:stop:152>neighbourhood:b1',
      ]);
      expect(parseFavorites('{no es json')).toEqual([]);
      expect(parseFavorites(null)).toEqual([]);
    });
  });

  describe('resolvePlace', () => {
    const getStop = (id: string) => (id === '152' ? stop : undefined);

    it('convierte la referencia de la URL en un lugar con sus paradas', () => {
      expect(resolvePlace('stop:152', getStop, [zone])).toEqual({
        kind: 'stop',
        id: '152',
        name: 'Postas',
        stopIds: ['152'],
      });
      expect(resolvePlace(placeParam(zone), getStop, [zone])?.stopIds).toEqual(['152', '153']);
    });

    it('devuelve null si el texto no vale o el lugar ya no existe', () => {
      expect(resolvePlace(undefined, getStop, [zone])).toBeNull();
      expect(resolvePlace('152', getStop, [zone])).toBeNull();
      expect(resolvePlace('stop:999', getStop, [zone])).toBeNull();
      expect(resolvePlace('district:b1', getStop, [zone])).toBeNull();
    });
  });

  describe('FavoritesService', () => {
    it('guarda y quita con toggle, y lo recuerda en el dispositivo', () => {
      const service = TestBed.inject(FavoritesService);
      expect(service.toggle({ kind: 'stop', stopId: '152' })).toBe(true);
      expect(service.toggle({ kind: 'line', lineId: '1' })).toBe(true);
      expect(service.has({ kind: 'stop', stopId: '152' })).toBe(true);
      expect(service.stops()).toEqual(['152']);
      expect(parseFavorites(localStorage.getItem(STORAGE_KEY))).toHaveLength(2);

      expect(service.toggle({ kind: 'stop', stopId: '152' })).toBe(false);
      expect(service.has({ kind: 'stop', stopId: '152' })).toBe(false);
      expect(parseFavorites(localStorage.getItem(STORAGE_KEY)).map(favoriteKey)).toEqual([
        'line:1',
      ]);
    });

    it('al arrancar lee lo guardado', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([{ kind: 'line', lineId: 'C1' }]));
      expect(TestBed.inject(FavoritesService).lines()).toEqual(['C1']);
    });
  });
});
