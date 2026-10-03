import { NetworkFile, ShapesFile } from '../published-format';

export function networkFixture(lineName = 'Alameda - Universidad'): NetworkFile {
  return {
    schemaVersion: 1,
    lines: [
      {
        id: '10',
        name: 'Décima',
        notes: '',
        directions: [
          {
            id: 1,
            headsign: 'Centro',
            stopIds: ['2'],
            shapeId: 'a10-1',
            shapeQuality: 'approximate',
          },
        ],
      },
      {
        id: '2',
        name: lineName,
        notes: 'Nueva parada',
        directions: [
          {
            id: 1,
            headsign: 'Universidad',
            stopIds: ['1', '2'],
            shapeId: 'g21',
            shapeQuality: 'official',
          },
          {
            id: 2,
            headsign: 'Alameda',
            stopIds: ['2', '1'],
            shapeId: 'g22',
            shapeQuality: 'official',
          },
        ],
      },
    ],
    stops: [
      { id: '1', name: 'Zapateros', address: 'CL A', lat: 36.72, lon: -4.42 },
      { id: '2', name: 'Alameda', address: 'CL B', lat: 36.71, lon: -4.43 },
    ],
  };
}

export function shapesFixture(): ShapesFile {
  // "_p~iF~ps|U_ulLnnqC" = [38.5, -120.2], [40.7, -120.95] (ejemplo de Google).
  return { schemaVersion: 1, toleranceM: 25, shapes: { g21: '_p~iF~ps|U_ulLnnqC' } };
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface PublishedFixture {
  manifest: string;
  network: string;
  shapesOverview: string;
}

/** Genera manifest + ficheros coherentes (huellas incluidas), como los publica pipeline/. */
export async function publishedFixture(
  dataVersion: string,
  network = networkFixture(),
): Promise<PublishedFixture> {
  const networkText = JSON.stringify(network);
  const shapesText = JSON.stringify(shapesFixture());
  const entry = async (path: string, text: string) => ({
    path,
    bytes: text.length,
    sha256: await sha256Hex(text),
  });
  const manifest = {
    schemaVersion: 1,
    dataVersion,
    generatedAt: '2026-10-03T05:30:00.000Z',
    counts: { lines: 2, stops: 2, shapes: 1, approximateShapes: 1 },
    files: {
      network: await entry('network.json', networkText),
      shapesOverview: await entry('shapes-overview.json', shapesText),
      shapesDetail: await entry('shapes-detail.json', shapesText),
    },
    sources: [],
    license: {
      id: 'CC-BY-SA-4.0',
      url: 'https://creativecommons.org/licenses/by-sa/4.0/',
      attribution: 'Datos',
    },
  };
  return { manifest: JSON.stringify(manifest), network: networkText, shapesOverview: shapesText };
}
