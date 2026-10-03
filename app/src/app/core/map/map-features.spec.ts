import { buildIndex } from '../../data/static-repositories';
import { networkFixture } from '../../data/testing/data-fixtures';
import { LatLon } from '../models/network.model';
import { toMapRoutes, toMapStops } from './map-features';

describe('toMapRoutes', () => {
  const { lines } = buildIndex(networkFixture());
  const geometries = new Map<string, LatLon[]>([
    [
      'g21',
      [
        [36.7, -4.4],
        [36.71, -4.41],
      ],
    ],
    [
      'a10-1',
      [
        [36.72, -4.42],
        [36.73, -4.43],
      ],
    ],
  ]);
  const colorFor = () => ({ line: '#123456', text: '#FFFFFF' });

  it('crea un recorrido por sentido con geometría y marca los aproximados', () => {
    const routes = toMapRoutes(lines, geometries, colorFor);
    // El sentido 2 de la línea 2 (g22) no tiene geometría y se omite.
    expect(routes.map((r) => [r.id, r.approximate, r.color])).toEqual([
      ['2-1', false, '#123456'],
      ['10-1', true, '#123456'],
    ]);
  });

  it('permite quedarse solo con algunos sentidos', () => {
    const routes = toMapRoutes(lines, geometries, colorFor, (line) => line.id === '10');
    expect(routes.map((r) => r.id)).toEqual(['10-1']);
  });
});

describe('toMapStops', () => {
  it('descarta paradas inexistentes', () => {
    const { stops } = buildIndex(networkFixture());
    expect(toMapStops([stops[0], undefined]).map((s) => s.id)).toEqual([stops[0]!.id]);
  });
});
