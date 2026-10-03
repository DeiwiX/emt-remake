import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { strToU8, zipSync } from 'fflate';

import { buildDataset } from '../build/build-dataset.ts';
import {
  type LatLon,
  decodePolyline,
  distanceM,
  encodePolyline,
  simplify,
} from '../build/geometry.ts';
import { matchShape } from '../build/match-shapes.ts';
import { checkPlausibility } from '../build/sanity.ts';
import { parseCsv } from '../sources/csv.ts';
import { parseEmtLines } from '../sources/emt-lines.ts';
import { parseGtfsZip } from '../sources/gtfs.ts';
import { ValidationError } from '../validation.ts';
import { STOPS_EASTBOUND, STREET, emtLineJson } from './fixtures.ts';

describe('parseCsv', () => {
  it('lee cabeceras, BOM, comillas y comas dentro de campos', () => {
    const rows = parseCsv('﻿id,name\r\n1,"Plaza, de la ""Merced"""\r\n2,Alameda\r\n');
    assert.deepEqual(rows, [
      { id: '1', name: 'Plaza, de la "Merced"' },
      { id: '2', name: 'Alameda' },
    ]);
  });
});

describe('geometría', () => {
  it('codifica polilíneas igual que el ejemplo oficial de Google', () => {
    const points: LatLon[] = [
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ];
    const encoded = encodePolyline(points);
    assert.equal(encoded, '_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    assert.deepEqual(decodePolyline(encoded), points);
  });

  it('simplifica una recta a sus extremos y conserva las esquinas', () => {
    assert.equal(simplify(STREET, 5).length, 2);
    const corner: LatLon[] = [...STREET, [36.73, -4.42]];
    const simplified = simplify(corner, 5);
    assert.equal(simplified.length, 3);
    assert.deepEqual(simplified.at(-1), [36.73, -4.42]);
  });

  it('mide distancias en metros con precisión suficiente', () => {
    // 0,001° de latitud son unos 111 m.
    const d = distanceM([36.72, -4.43], [36.721, -4.43]);
    assert.ok(Math.abs(d - 111) < 1, `distancia ${d}`);
  });
});

describe('matchShape', () => {
  const shapes = new Map<string, LatLon[]>([
    ['east', STREET],
    ['west', [...STREET].reverse()],
    ['far', STREET.map(([lat, lon]): LatLon => [lat + 0.01, lon])],
  ]);
  const candidates = [
    { shapeId: 'west', trips: 50 },
    { shapeId: 'east', trips: 10 },
    { shapeId: 'far', trips: 99 },
  ];

  it('elige el trazado que recorre las paradas en su orden', () => {
    assert.equal(matchShape(STOPS_EASTBOUND, candidates, shapes)?.shapeId, 'east');
    assert.equal(matchShape([...STOPS_EASTBOUND].reverse(), candidates, shapes)?.shapeId, 'west');
  });

  it('devuelve null si ningún trazado pasa cerca de las paradas', () => {
    assert.equal(matchShape(STOPS_EASTBOUND, [{ shapeId: 'far', trips: 1 }], shapes), null);
  });
});

describe('parseEmtLines', () => {
  it('agrupa por sentido y ordena las paradas', () => {
    const [line] = parseEmtLines([emtLineJson()]);
    assert.ok(line);
    assert.deepEqual(
      line.directions.map((d) => [d.sentido, d.stops.map((s) => s.code)]),
      [
        [1, ['11', '12', '13']],
        [2, ['13', '11']],
      ],
    );
    assert.equal(line.directions[0]?.stops[0]?.address, 'CL EJEMPLO 1');
  });

  it('rechaza formatos inesperados y coordenadas fuera de Málaga', () => {
    assert.throws(() => parseEmtLines({}), ValidationError);
    assert.throws(() => parseEmtLines([emtLineJson({ paradas: 'x' })]), ValidationError);
    const bad = emtLineJson();
    (bad['paradas'] as { parada: { latitud: number } }[])[0]!.parada.latitud = 40.4;
    assert.throws(() => parseEmtLines([bad]), /fuera de Málaga/);
  });
});

describe('parseGtfsZip', () => {
  it('lee trazados y su uso por línea ignorando stop_times', () => {
    const zip = zipSync({
      'routes.txt': strToU8('route_id,route_short_name\n10,1\n'),
      'trips.txt': strToU8('route_id,trip_id,shape_id\n10,a,S1\n10,b,S1\n10,c,S2\n'),
      'shapes.txt': strToU8(
        'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nS1,36.72,-4.42,2\nS1,36.72,-4.43,1\nS2,36.7,-4.4,1\n',
      ),
      'stop_times.txt': strToU8('no se debe leer'),
    });
    const gtfs = parseGtfsZip(zip);
    assert.deepEqual(gtfs.shapesByLineCode.get('1'), [
      { shapeId: 'S1', trips: 2 },
      { shapeId: 'S2', trips: 1 },
    ]);
    assert.deepEqual(gtfs.shapes.get('S1'), [
      [36.72, -4.43],
      [36.72, -4.42],
    ]);
  });

  it('falla si falta un fichero necesario', () => {
    const zip = zipSync({ 'routes.txt': strToU8('route_id,route_short_name\n1,1\n') });
    assert.throws(() => parseGtfsZip(zip), /falta o está vacío trips/);
  });
});

describe('buildDataset', () => {
  const lines = parseEmtLines([
    emtLineJson(),
    emtLineJson({ userCodLinea: '92', cabeceraVuelta: '' }),
  ]);
  const gtfs = {
    shapes: new Map<string, LatLon[]>([['S1', STREET]]),
    shapesByLineCode: new Map([['1', [{ shapeId: 'S1', trips: 3 }]]]),
  };
  const dataset = buildDataset(lines, gtfs);
  const [line1, line92] = dataset.network.lines;

  it('usa el trazado oficial cuando encaja y uno aproximado cuando no hay', () => {
    assert.equal(line1?.directions[0]?.shapeId, 'gS1');
    assert.equal(line1?.directions[0]?.shapeQuality, 'official');
    assert.equal(line92?.directions[0]?.shapeQuality, 'approximate');
    assert.equal(dataset.report.approximateDirections.length, 3);
    assert.ok(dataset.shapesOverview.shapes['a92-1']);
  });

  it('calcula el destino de cada sentido', () => {
    assert.equal(line1?.directions[0]?.headsign, 'Destino');
    assert.equal(line1?.directions[1]?.headsign, 'Origen');
  });

  it('no repite paradas compartidas entre líneas', () => {
    assert.deepEqual(
      dataset.network.stops.map((s) => s.id),
      ['11', '12', '13'],
    );
  });
});

describe('checkPlausibility', () => {
  const ok = { lines: 49, stops: 1135, shapes: 89, approximateShapes: 4 };

  it('acepta datos normales', () => {
    assert.doesNotThrow(() => checkPlausibility(ok, ok));
    assert.doesNotThrow(() => checkPlausibility(ok, null));
  });

  it('rechaza caídas bruscas y mínimos absurdos', () => {
    assert.throws(() => checkPlausibility({ ...ok, stops: 600 }, ok), ValidationError);
    assert.throws(() => checkPlausibility({ ...ok, lines: 3 }, null), ValidationError);
  });
});
