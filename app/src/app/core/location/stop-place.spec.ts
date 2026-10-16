import { Stop } from '../models/network.model';
import { placeForStop } from './stop-place';

function stop(id: string, lat: number, lon: number): Stop {
  return { id, name: `Parada ${id}`, lat, lon, services: [] } as unknown as Stop;
}

describe('placeForStop', () => {
  // ~0,0009° de latitud ≈ 100 m.
  const chosen = stop('1', 36.72, -4.42);
  const across = stop('2', 36.7209, -4.42);
  const far = stop('3', 36.725, -4.42);

  it('incluye la parada (sin andar) y las de menos de 300 m, con sus minutos andando', () => {
    const place = placeForStop(chosen, [chosen, across, far]);
    expect(place).toMatchObject({ kind: 'stop', id: '1', name: 'Parada 1' });
    expect(place.stopIds).toEqual(['1', '2']);
    expect(place.accessMinutes?.get('1')).toBe(0);
    expect(place.accessMinutes?.get('2')).toBeGreaterThanOrEqual(1);
    // Andar se dibuja solo hacia las otras paradas, desde la elegida.
    expect(place.accessPoints?.has('1')).toBe(false);
    expect(place.accessPoints?.get('2')).toEqual([36.72, -4.42]);
  });
});
