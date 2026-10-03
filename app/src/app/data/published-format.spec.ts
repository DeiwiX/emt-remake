import { DataFormatError, parseManifest, parseNetwork, parseShapes } from './published-format';
import { networkFixture, publishedFixture, shapesFixture } from './testing/data-fixtures';

describe('Validación de los ficheros publicados', () => {
  it('acepta ficheros correctos', async () => {
    const fixture = await publishedFixture('v1');
    expect(parseManifest(JSON.parse(fixture.manifest)).dataVersion).toBe('v1');
    expect(parseNetwork(networkFixture()).lines).toHaveLength(2);
    expect(Object.keys(parseShapes(shapesFixture()).shapes)).toEqual(['g21']);
  });

  it('rechaza una versión de formato desconocida', () => {
    expect(() => parseNetwork({ ...networkFixture(), schemaVersion: 2 })).toThrow(DataFormatError);
  });

  it('rechaza líneas que citan paradas inexistentes', () => {
    const network = networkFixture();
    network.lines[0]!.directions[0]!.stopIds.push('999');
    expect(() => parseNetwork(network)).toThrow(/parada 999/);
  });

  it('rechaza tipos incorrectos y valores vacíos', () => {
    const network = networkFixture();
    (network.stops[0] as unknown as Record<string, unknown>)['lat'] = '36.7';
    expect(() => parseNetwork(network)).toThrow(DataFormatError);
    expect(() => parseNetwork({ schemaVersion: 1, lines: [], stops: [] })).toThrow(DataFormatError);
    expect(() => parseManifest(null)).toThrow(DataFormatError);
    expect(() => parseShapes({ schemaVersion: 1, toleranceM: 4, shapes: { x: 3 } })).toThrow(
      DataFormatError,
    );
  });

  it('rechaza una calidad de trazado desconocida', () => {
    const network = networkFixture() as unknown as {
      lines: { directions: Record<string, unknown>[] }[];
    };
    network.lines[0]!.directions[0]!['shapeQuality'] = 'guess';
    expect(() => parseNetwork(network)).toThrow(/shapeQuality/);
  });
});
