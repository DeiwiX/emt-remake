import { Stop, Street } from '../models/network.model';
import { searchStreets } from '../search/search';
import { placeForStreet, portalPoint } from './street-place';

const stopAt = (id: string, lat: number, lon: number) =>
  ({ id, name: id, lat, lon, services: [] }) as unknown as Stop;

// Portales cada ~100 m hacia el norte.
const larios: Street = {
  id: 's1',
  name: 'Calle Marques de Larios',
  points: [
    [36.72, -4.42],
    [36.7209, -4.42],
    [36.7218, -4.42],
  ],
  numbers: [1, 9, 21],
};

describe('Calles', () => {
  it('busca por nombre sin tildes y entiende el número de portal al final', () => {
    expect(searchStreets([larios], 'larios').map((r) => r.number)).toEqual([null]);
    expect(searchStreets([larios], 'marqués de larios, 7')[0]).toEqual({
      street: larios,
      number: 7,
    });
    expect(searchStreets([larios], 'alameda')).toEqual([]);
  });

  it('sitúa un número en el portal publicado más cercano', () => {
    expect(portalPoint(larios, 7).number).toBe(9);
    expect(portalPoint(larios, 100).number).toBe(21);
  });

  it('con número: paradas cercanas al portal con los minutos andando', () => {
    const stops = [stopAt('cerca', 36.7209, -4.4205), stopAt('lejos', 36.74, -4.42)];
    const place = placeForStreet(larios, 9, stops);
    expect(place.kind).toBe('address');
    expect(place.name).toBe('Calle Marques de Larios 9');
    expect(place.stopIds).toEqual(['cerca']);
    expect(place.accessMinutes?.get('cerca')).toBeGreaterThan(0);
  });

  it('sin número: paradas a menos de 300 m de cualquier portal', () => {
    const stops = [
      stopAt('norte', 36.722, -4.4205),
      stopAt('sur', 36.7195, -4.42),
      stopAt('lejos', 36.73, -4.42),
    ];
    const place = placeForStreet(larios, null, stops);
    expect(place.kind).toBe('street');
    expect([...place.stopIds].sort()).toEqual(['norte', 'sur']);
    expect(place.accessPoints?.get('norte')).toEqual([36.7218, -4.42]);
  });
});
