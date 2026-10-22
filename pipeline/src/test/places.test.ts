import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildLayer, matchShelters, mergeSignals, type RawPlace } from '../build/build-places.ts';
import { resolvePlaces } from '../build/places-source.ts';
import { SOURCES } from '../config.ts';
import type { PlaceKind, PlacesFile } from '../output-schema.ts';
import { parseAcousticSignals } from '../sources/acoustic-signals.ts';
import { parseBikeParking } from '../sources/bike-parking.ts';
import { parseDefibrillators } from '../sources/defibrillators.ts';
import { geoJsonPoints } from '../sources/geojson-points.ts';
import { type OsmPoint, osmPointsQuery, parseOsmPoints } from '../sources/osm-points.ts';
import { parseTicketOffices } from '../sources/ticket-offices.ts';

/** FeatureCollection de puntos con las propiedades dadas, como las publica el portal. */
function collection(...features: [Record<string, unknown>, number[]][]): unknown {
  return {
    type: 'FeatureCollection',
    features: features.map(([properties, coordinates]) => ({
      type: 'Feature',
      properties,
      geometry: { type: 'Point', coordinates },
    })),
  };
}

/** n puntos distintos alineados al este de (36.72, -4.42), cada ~90 m. */
function many(n: number, prefix = 'p'): RawPlace[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    point: [36.72, -4.42 + i * 0.001],
  }));
}

describe('geoJsonPoints', () => {
  it('pasa las claves a minúsculas, limpia el texto y descarta la tercera coordenada', () => {
    const [point] = geoJsonPoints(
      collection([
        { ID: 7, DESCRIPCION: '  Cruce   con  Larios ', VACIO: null },
        [-4.42, 36.72, 4.06e6],
      ]),
    );
    assert.deepEqual(point, {
      point: [36.72, -4.42],
      props: { id: '7', descripcion: 'Cruce con Larios' },
    });
  });

  it('ignora lo que no son puntos válidos', () => {
    const json = {
      features: [
        { properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0]] } },
        { properties: {}, geometry: { type: 'Point', coordinates: ['x', 1] } },
        null,
      ],
    };
    assert.deepEqual(geoJsonPoints(json), []);
    assert.deepEqual(geoJsonPoints('no es json'), []);
  });
});

describe('fuentes de las capas', () => {
  it('desfibriladores: quita los de los autobuses, marca los de 24 h y no publica contactos', () => {
    const places = parseDefibrillators(
      collection(
        [
          {
            id: '14284',
            descripcion: 'BIBLIOTECA MIGUEL DE CERVANTES',
            direccion: 'CALLE JUAN FERNÁNDEZ SÉRIA, 2',
            horarios: 'L-V 09:00-21:00',
            titularidad: 'MUNICIPAL',
            tlfcontacto: '600000000',
            email: 'alguien@example.com',
            VEINTICUATROHORAS: 'Si',
          },
          [-4.43877, 36.72193],
        ],
        [{ id: '9000', descripcion: 'Bus 640', titularidad: 'EMT' }, [-4.4, 36.7]],
      ),
    );
    assert.deepEqual(places, [
      {
        id: '14284',
        point: [36.72193, -4.43877],
        name: 'BIBLIOTECA MIGUEL DE CERVANTES',
        address: 'CALLE JUAN FERNÁNDEZ SÉRIA, 2',
        hours: 'L-V 09:00-21:00',
        tags: ['24h'],
      },
    ]);
  });

  it('puntos de venta: dirección con coma en lugar de "_" y sin el código de tipo', () => {
    const places = parseTicketOffices(
      collection([{ serial: 14343, domicilio: 'C/ Babel_ 10', tipo: '1' }, [-4.43791, 36.71524]]),
    );
    assert.deepEqual(places, [
      { id: '14343', point: [36.71524, -4.43791], address: 'C/ Babel, 10' },
    ]);
  });

  it('aparcamientos de bici: plazas si las hay', () => {
    const places = parseBikeParking(
      collection(
        [{ ID: 1, DESCRIPCION: 'Plaza de la Marina', TOTALPLAZAS: '10' }, [-4.42, 36.72]],
        [{ ID: 2, DIRECCION: 'Calle Larios', TOTALPLAZAS: '' }, [-4.42, 36.72]],
      ),
    );
    assert.equal(places[0]!.capacity, 10);
    assert.equal(places[1]!.capacity, undefined);
  });

  it('semáforos acústicos: nombre del cruce, no el código interno', () => {
    const [signal] = parseAcousticSignals(
      collection([
        {
          ID: 19120,
          NOMBRE: 'SEMAFOROACUSTICO_07.04',
          DESCRIPCION: 'Intersección con Plaza de Toros Vieja',
          DIRECCION: 'CALLE CUARTELES, 42',
        },
        [-4.42858, 36.71334, 0],
      ]),
    );
    assert.deepEqual(signal, {
      id: 'ayto-19120',
      point: [36.71334, -4.42858],
      name: 'Intersección con Plaza de Toros Vieja',
      address: 'CALLE CUARTELES, 42',
      tags: ['acoustic'],
    });
  });

  it('OpenStreetMap: semáforos y paradas con marquesina, con su ref', () => {
    assert.match(osmPointsQuery([36.6, -4.6, 36.8, -4.3]), /traffic_signals.*shelter/);
    const points = parseOsmPoints({
      elements: [
        { type: 'node', id: 1, lat: 36.72, lon: -4.42, tags: { highway: 'traffic_signals' } },
        {
          type: 'node',
          id: 2,
          lat: 36.73,
          lon: -4.43,
          tags: { highway: 'bus_stop', shelter: 'yes', ref: ' 452 ' },
        },
        { type: 'node', id: 3, lat: 36.73, lon: -4.43, tags: { highway: 'crossing' } },
        { type: 'way', id: 4 },
      ],
    });
    assert.deepEqual(points, [
      { id: '1', point: [36.72, -4.42], kind: 'signal' },
      { id: '2', point: [36.73, -4.43], kind: 'shelter', ref: '452' },
    ]);
    assert.throws(() => parseOsmPoints({ remark: 'runtime error' }));
  });
});

describe('construcción de las capas', () => {
  it('mergeSignals: el acústico marca al semáforo de OSM cercano y se añade si no hay ninguno', () => {
    const osm: OsmPoint[] = [
      { id: '1', point: [36.72, -4.42], kind: 'signal' },
      { id: '2', point: [36.73, -4.42], kind: 'signal' },
    ];
    const acoustic: RawPlace[] = [
      { id: 'ayto-1', point: [36.72005, -4.42], name: 'Cruce A', tags: ['acoustic'] },
      { id: 'ayto-2', point: [36.75, -4.42], name: 'Cruce B', tags: ['acoustic'] },
    ];
    const merged = mergeSignals(osm, acoustic);
    assert.deepEqual(merged, [
      { id: 'osm-1', point: [36.72, -4.42], name: 'Cruce A', tags: ['acoustic'] },
      { id: 'osm-2', point: [36.73, -4.42] },
      { id: 'ayto-2', point: [36.75, -4.42], name: 'Cruce B', tags: ['acoustic'] },
    ]);
  });

  it('matchShelters: por ref si está cerca y, si no, la parada más cercana a menos de 25 m', () => {
    const stops = [
      { id: '452', lat: 36.72, lon: -4.42 },
      { id: '453', lat: 36.7201, lon: -4.42 },
      { id: '900', lat: 36.8, lon: -4.42 },
    ];
    const osm: OsmPoint[] = [
      // Más cerca de 453, pero su ref dice 452 (a ~11 m): gana la ref.
      { id: 'a', point: [36.72009, -4.42], kind: 'shelter', ref: '452' },
      // Sin ref, a ~5 m de 453.
      { id: 'b', point: [36.72015, -4.42], kind: 'shelter' },
      // Lejos de todo.
      { id: 'c', point: [36.9, -4.42], kind: 'shelter' },
    ];
    assert.deepEqual(
      matchShelters(osm, stops).map((p) => p.id),
      ['452', '453'],
    );
  });

  it('buildLayer: redondea, ordena, quita duplicados y rechaza capas demasiado pequeñas', () => {
    const layer = buildLayer(
      'ticketOffice',
      ['x'],
      [...many(60), { id: 'p0', point: [36.123456789, -4.1] }],
      'T',
    );
    assert.equal(layer.places.length, 60);
    assert.deepEqual(
      layer.places.find((p) => p.id === 'p0'),
      { id: 'p0', lat: 36.12346, lon: -4.1 },
    );
    assert.throws(() => buildLayer('ticketOffice', ['x'], many(10), 'T'), /demasiado pequeña/);
  });
});

describe('resolvePlaces', () => {
  const now = new Date('2026-10-21T20:00:00Z');
  const stops = Array.from({ length: 200 }, (_, i) => ({
    id: `s${i}`,
    lat: 36.7,
    lon: -4.5 + i * 0.001,
  }));
  const ok = (json: unknown) => ({
    bytes: new TextEncoder().encode(JSON.stringify(json)),
    lastModified: 'L',
  });
  const points = (n: number, extra: (i: number) => Record<string, unknown> = () => ({})) =>
    collection(
      ...Array.from({ length: n }, (_, i): [Record<string, unknown>, number[]] => [
        { ID: i, serial: i, ...extra(i) },
        [-4.5 + i * 0.001, 36.72],
      ]),
    );
  const osm = {
    elements: [
      ...Array.from({ length: 400 }, (_, i) => ({
        type: 'node',
        id: i,
        lat: 36.73,
        lon: -4.5 + i * 0.0005,
        tags: { highway: 'traffic_signals' },
      })),
      ...stops.map((s, i) => ({
        type: 'node',
        id: 10_000 + i,
        lat: s.lat,
        lon: s.lon,
        tags: { highway: 'bus_stop', shelter: 'yes' },
      })),
    ],
  };
  const sources: Record<string, unknown> = {
    [SOURCES.defibrillators.url]: points(250),
    [SOURCES.ticketOffices.url]: points(60),
    [SOURCES.bikeParking.url]: points(60),
    [SOURCES.acousticSignals.url]: points(5),
  };
  const fetchAll =
    (failing: string[] = []) =>
    async (url: string) => {
      if (failing.some((f) => url.startsWith(f))) throw new Error('HTTP 503');
      if (url.startsWith(SOURCES.osmPoints.url)) return ok(osm);
      return ok(sources[url]);
    };
  const kinds = (file: PlacesFile) => file.layers.map((l) => l.kind).sort();
  const ALL: PlaceKind[] = [
    'bikeParking',
    'defibrillator',
    'shelter',
    'ticketOffice',
    'trafficLight',
  ];

  it('genera las cinco capas desde cero', async () => {
    const result = await resolvePlaces(null, stops, now, fetchAll());
    assert.deepEqual(kinds(result!.file), ALL);
    assert.deepEqual(result!.reused, []);
    const signals = result!.file.layers.find((l) => l.kind === 'trafficLight')!;
    assert.equal(signals.places.filter((p) => p.tags?.includes('acoustic')).length, 5);
    assert.equal(result!.file.layers.find((l) => l.kind === 'shelter')!.places.length, 200);
  });

  it('si una fuente falla, mantiene su capa anterior y renueva las demás', async () => {
    const first = (await resolvePlaces(null, stops, now, fetchAll()))!.file;
    const later = new Date('2026-10-30T20:00:00Z');
    const result = await resolvePlaces(
      first,
      stops,
      later,
      fetchAll([SOURCES.defibrillators.url, SOURCES.osmPoints.url]),
    );
    assert.deepEqual(kinds(result!.file), ALL);
    assert.deepEqual(result!.reused.sort(), ['defibrillator', 'shelter', 'trafficLight']);
    const defib = result!.file.layers.find((l) => l.kind === 'defibrillator')!;
    assert.equal(defib.builtAt, now.toISOString());
  });

  it('no consulta OpenStreetMap si sus capas tienen menos de una semana', async () => {
    const first = (await resolvePlaces(null, stops, now, fetchAll()))!.file;
    const asked: string[] = [];
    const spy = async (url: string) => {
      asked.push(url);
      return fetchAll()(url);
    };
    await resolvePlaces(first, stops, new Date('2026-10-22T20:00:00Z'), spy);
    assert.ok(!asked.some((url) => url.startsWith(SOURCES.osmPoints.url)));
  });

  it('sin acústicos ni capa anterior publica los semáforos de OSM solos', async () => {
    const result = await resolvePlaces(null, stops, now, fetchAll([SOURCES.acousticSignals.url]));
    const signals = result!.file.layers.find((l) => l.kind === 'trafficLight')!;
    assert.equal(signals.places.length, 400);
    assert.deepEqual(signals.sources, [SOURCES.osmPoints.name]);
  });

  it('sin ninguna fuente ni publicación anterior no hay capas', async () => {
    const result = await resolvePlaces(null, stops, now, async () => {
      throw new Error('sin red');
    });
    assert.equal(result, null);
  });
});
