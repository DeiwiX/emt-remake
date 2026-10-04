import { Stop } from '../models/network.model';
import { metresBetween, stopsNear, walkMinutes } from './geo';

const stopAt = (id: string, lat: number, lon: number) =>
  ({ id, name: id, lat, lon, services: [] }) as unknown as Stop;

describe('Distancias y "Cerca de mí"', () => {
  // ~0,0009° de latitud son unos 100 m.
  const here: [number, number] = [36.72, -4.42];
  const stops = [
    stopAt('lejos', 36.7281, -4.42), // ~900 m
    stopAt('cerca', 36.7209, -4.42), // ~100 m
    stopAt('medio', 36.7236, -4.42), // ~400 m
  ];

  it('mide en metros y calcula el tiempo andando con rodeo', () => {
    expect(metresBetween(here, [36.7209, -4.42])).toBeCloseTo(100, -1);
    expect(walkMinutes(0)).toBe(1);
    expect(walkMinutes(400)).toBe(7); // 400 × 1,3 / 80 = 6,5 → 7
  });

  it('devuelve las paradas a menos de 500 m, de la más cercana a la más lejana', () => {
    const result = stopsNear(stops, here);
    expect(result.radius).toBe(500);
    expect(result.stops.map((s) => s.stop.id)).toEqual(['cerca', 'medio']);
  });

  it('si no hay ninguna a 500 m, amplía hasta 1 km', () => {
    const result = stopsNear([stops[0]!], here);
    expect(result.radius).toBe(1000);
    expect(result.stops.map((s) => s.stop.id)).toEqual(['lejos']);
    expect(stopsNear([stopAt('x', 36.75, -4.42)], here).stops).toEqual([]);
  });
});
