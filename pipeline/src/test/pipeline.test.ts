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
import { buildZones, insidePolygon, stopsInZone } from '../build/build-zones.ts';
import { parseWktPolygons, parseZonesCsv, titleCase } from '../sources/zones.ts';
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
  const ok = { lines: 49, stops: 1135, shapes: 89, approximateShapes: 4, zones: 430 };

  it('acepta datos normales', () => {
    assert.doesNotThrow(() => checkPlausibility(ok, ok));
    assert.doesNotThrow(() => checkPlausibility(ok, null));
  });

  it('rechaza caídas bruscas y mínimos absurdos', () => {
    assert.throws(() => checkPlausibility({ ...ok, stops: 600 }, ok), ValidationError);
    assert.throws(() => checkPlausibility({ ...ok, lines: 3 }, null), ValidationError);
    assert.throws(() => checkPlausibility({ ...ok, zones: 0 }, null), ValidationError);
  });

  it('acepta una publicación anterior sin zonas', () => {
    const { zones: _zones, ...withoutZones } = ok;
    assert.doesNotThrow(() => checkPlausibility(ok, withoutZones));
  });
});

describe('zonas', () => {
  // Un cuadrado de unos 220 m de lado en el centro de Málaga, con un hueco en una esquina.
  const square: LatLon[] = [
    [36.72, -4.42],
    [36.72, -4.4175],
    [36.722, -4.4175],
    [36.722, -4.42],
    [36.72, -4.42],
  ];
  const wkt =
    'POLYGON ((-4.42 36.72, -4.4175 36.72, -4.4175 36.722, -4.42 36.722, -4.42 36.72))';

  it('lee POLYGON y MULTIPOLYGON en WKT como [lat, lon]', () => {
    assert.deepEqual(parseWktPolygons(wkt), [[square]]);
    const multi =
      'MULTIPOLYGON (((-4.42 36.72, -4.4175 36.72, -4.4175 36.722, -4.42 36.72)), ' +
      '((-4.41 36.73, -4.409 36.73, -4.409 36.731, -4.41 36.73)))';
    assert.equal(parseWktPolygons(multi).length, 2);
    assert.throws(() => parseWktPolygons('POINT (-4.42 36.72)'), ValidationError);
  });

  it('lee los CSV de barrios y distritos y pone los nombres en formato título', () => {
    const csv = `FID,ID_BARRIO,NUMBARRIO,NOMBARRIO,NOMCOMUNBAR,SDOAREA
x,7,1,TEATINOS   ,T,"${wkt}"
`;
    const [zone] = parseZonesCsv(csv, 'neighbourhood');
    assert.equal(zone?.id, 'b7');
    assert.equal(zone?.name, 'Teatinos');
    assert.equal(titleCase('CARRETERA DE CADIZ'), 'Carretera de Cadiz');
    assert.equal(titleCase('TEATINOS-UNIVERSIDAD'), 'Teatinos-Universidad');
  });

  it('incluye las paradas de dentro y las de junto al borde, no las lejanas', () => {
    const stop = (id: string, lat: number, lon: number) => ({ id, name: id, address: '', lat, lon });
    const stops = [
      stop('dentro', 36.721, -4.419),
      stop('borde', 36.7225, -4.419), // ~55 m fuera del lado norte
      stop('lejos', 36.73, -4.419), // ~900 m al norte
    ];
    assert.deepEqual(stopsInZone([[square]], stops), ['dentro', 'borde']);
    assert.equal(insidePolygon([36.721, -4.419], [square]), true);
    assert.equal(insidePolygon([36.721, -4.419], [square, square]), false);
  });

  it('genera zones.json con distritos primero y contornos codificados', () => {
    const zones = buildZones(
      [
        { id: 'b1', kind: 'neighbourhood', name: 'Teatinos', polygons: [[square]] },
        { id: 'd11', kind: 'district', name: 'Teatinos-Universidad', polygons: [[square]] },
      ],
      [{ id: '1', name: 'x', address: '', lat: 36.721, lon: -4.419 }],
    );
    assert.deepEqual(
      zones.zones.map((z) => [z.id, z.stopIds]),
      [
        ['d11', ['1']],
        ['b1', ['1']],
      ],
    );
    assert.equal(typeof zones.zones[0]?.polygons[0]?.[0], 'string');
  });
});
