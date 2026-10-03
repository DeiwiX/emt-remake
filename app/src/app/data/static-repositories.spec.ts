import { decodePolyline } from './polyline';
import { buildIndex } from './static-repositories';
import { networkFixture } from './testing/data-fixtures';

describe('buildIndex', () => {
  const index = buildIndex(networkFixture());

  it('ordena las líneas por código de forma natural (2 antes que 10)', () => {
    expect(index.lines.map((l) => l.id)).toEqual(['2', '10']);
  });

  it('ordena las paradas por nombre', () => {
    expect(index.stops.map((s) => s.name)).toEqual(['Alameda', 'Zapateros']);
  });

  it('calcula las líneas y sentidos que pasan por cada parada', () => {
    expect(index.stopsById.get('2')?.services).toEqual([
      { lineId: '2', directionId: 1 },
      { lineId: '2', directionId: 2 },
      { lineId: '10', directionId: 1 },
    ]);
  });

  it('permite buscar por identificador', () => {
    expect(index.linesById.get('10')?.name).toBe('Décima');
    expect(index.stopsById.get('nope')).toBeUndefined();
  });
});

describe('decodePolyline', () => {
  it('decodifica el ejemplo oficial de Google', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
  });

  it('falla con una polilínea truncada', () => {
    expect(() => decodePolyline('_p~iF~ps|U_')).toThrow();
  });
});
