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
import { buildStreets } from '../build/build-streets.ts';
import { parseStreets } from '../sources/streets.ts';
import { buildTraffic } from '../build/build-traffic.ts';
import { STEPS_FACTOR, buildWalkGraph } from '../build/build-walk-graph.ts';
import { resolveWalkGraph } from '../build/walk-graph-source.ts';
import { parseOsmWalk, walkQuery } from '../sources/osm-walk.ts';
import { localDate, parseDgtSituations, parseMunicipalCuts } from '../sources/traffic.ts';
import { parseWktPolygons, parseZonesCsv, titleCase } from '../sources/zones.ts';
import { parseCsv } from '../sources/csv.ts';
import { parseStopTimes } from '../sources/gtfs-times.ts';
import { parseServiceDates } from '../sources/gtfs.ts';
import { buildTimetables, tripProfile } from '../build/build-timetables.ts';
import { directionTimes } from '../build/travel-times.ts';
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
    const zip = zipSync({
      'routes.txt': strToU8('route_id,route_short_name\n1,1\n'),
    });
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
    travelPatterns: new Map([
      ['S1', { stopCodes: ['11', '12', '13'], minutes: [0, 2.5, 6], trips: 4 }],
    ]),
    trips: [],
    serviceDates: new Map(),
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
  const ok = {
    lines: 49,
    stops: 1135,
    shapes: 89,
    approximateShapes: 4,
    zones: 430,
    departures: 20000,
    streets: 3500,
  };

  it('acepta datos normales', () => {
    assert.doesNotThrow(() => checkPlausibility(ok, ok));
    assert.doesNotThrow(() => checkPlausibility(ok, null));
  });

  it('rechaza caídas bruscas y mínimos absurdos', () => {
    assert.throws(() => checkPlausibility({ ...ok, stops: 600 }, ok), ValidationError);
    assert.throws(() => checkPlausibility({ ...ok, lines: 3 }, null), ValidationError);
    assert.throws(() => checkPlausibility({ ...ok, zones: 0 }, null), ValidationError);
    assert.throws(() => checkPlausibility({ ...ok, streets: 10 }, null), ValidationError);
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
  const wkt = 'POLYGON ((-4.42 36.72, -4.4175 36.72, -4.4175 36.722, -4.42 36.722, -4.42 36.72))';

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
    const stop = (id: string, lat: number, lon: number) => ({
      id,
      name: id,
      address: '',
      lat,
      lon,
    });
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
        {
          id: 'b1',
          kind: 'neighbourhood',
          name: 'Teatinos',
          polygons: [[square]],
        },
        {
          id: 'd11',
          kind: 'district',
          name: 'Teatinos-Universidad',
          polygons: [[square]],
        },
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

describe('tiempos de viaje', () => {
  const trips = [
    { trip_id: 'a', shape_id: 'S1' },
    { trip_id: 'b', shape_id: 'S1' },
    { trip_id: 'c', shape_id: 'S1' },
    { trip_id: 'x', shape_id: 'S1' },
  ];
  const stops = [
    { stop_id: '1', stop_code: '101' },
    { stop_id: '2', stop_code: '102' },
    { stop_id: '3', stop_code: '103' },
  ];
  const row = (trip: string, time: string, stop: string, seq: number) =>
    `${trip},${time},${time},${stop},${seq}`;
  const csv = [
    'trip_id,arrival_time,departure_time,stop_id,stop_sequence',
    // Tres viajes con la misma secuencia y distinta duración (mediana: 2 y 5 min).
    row('a', '08:00:00', '1', 1),
    row('a', '08:02:00', '2', 2),
    row('a', '08:05:00', '3', 3),
    row('b', '09:00:00', '1', 1),
    row('b', '09:03:00', '2', 2),
    row('b', '09:07:00', '3', 3),
    row('c', '23:59:00', '1', 1),
    row('c', '24:00:00', '2', 2),
    row('c', '24:03:00', '3', 3),
    // Una variante que solo hace dos paradas: es menos frecuente y no se usa.
    row('x', '10:00:00', '1', 1),
    row('x', '10:10:00', '3', 2),
  ].join('\n');

  it('toma la secuencia más frecuente y la mediana de minutos por parada', () => {
    const pattern = parseStopTimes(csv, trips, stops).patterns.get('S1');
    assert.deepEqual(pattern, {
      stopCodes: ['101', '102', '103'],
      minutes: [0, 2, 5],
      trips: 3,
    });
  });

  const emtStop = (code: string, lon: number) => ({
    code,
    name: code,
    address: '',
    lat: 36.72,
    lon,
  });

  it('alinea el horario con las paradas e interpola las que faltan en el GTFS', () => {
    const times = directionTimes(
      [
        emtStop('101', -4.43),
        emtStop('150', -4.429),
        emtStop('102', -4.428),
        emtStop('103', -4.427),
      ],
      { stopCodes: ['101', '102', '103'], minutes: [0, 2, 5], trips: 3 },
    );
    assert.equal(times.source, 'schedule');
    assert.deepEqual(times.minutes, [0, 1, 2, 5]);
  });

  it('sin horario estima por distancia, siempre creciente', () => {
    const times = directionTimes(
      [emtStop('1', -4.43), emtStop('2', -4.42), emtStop('3', -4.41)],
      undefined,
    );
    assert.equal(times.source, 'estimate');
    // ~893 m entre paradas × 1,3 / 250 m/min ≈ 4,6 min.
    assert.deepEqual(times.minutes, [0, 4.6, 9.3]);
  });
});

describe('horarios', () => {
  it('guarda la hora de salida de cada viaje', () => {
    const csv = [
      'trip_id,arrival_time,departure_time,stop_id,stop_sequence',
      'a,08:00:30,08:00:30,1,1',
      'a,08:05:00,08:05:00,2,2',
    ].join('\n');
    const summary = parseStopTimes(
      csv,
      [{ trip_id: 'a', shape_id: 'S' }],
      [
        { stop_id: '1', stop_code: '101' },
        { stop_id: '2', stop_code: '102' },
      ],
    );
    assert.equal(summary.tripStarts.get('a'), 8 * 3600 + 30);
  });

  it('calcula los días de servicio con calendar y calendar_dates', () => {
    const dates = parseServiceDates(
      [
        {
          service_id: 'L',
          monday: '1',
          tuesday: '1',
          wednesday: '0',
          thursday: '0',
          friday: '0',
          saturday: '0',
          sunday: '0',
          start_date: '20261005',
          end_date: '20261011',
        },
      ],
      [
        { service_id: 'L', date: '20261006', exception_type: '2' },
        { service_id: 'F', date: '20261012', exception_type: '1' },
      ],
    );
    // Lunes 5 sí; martes 6 quitado por excepción; F solo el 12.
    assert.deepEqual(dates.get('L'), ['20261005']);
    assert.deepEqual(dates.get('F'), ['20261012']);
  });

  it('agrupa las salidas por sentido y día usando el sentido del trazado emparejado', () => {
    const network = {
      schemaVersion: 1,
      stops: [],
      lines: [
        {
          id: '1',
          name: '1',
          notes: '',
          directions: [
            {
              id: 1,
              headsign: '',
              stopIds: [],
              shapeId: 'g14',
              shapeQuality: 'official' as const,
              minutes: [],
              timesSource: 'schedule' as const,
            },
            {
              id: 2,
              headsign: '',
              stopIds: [],
              shapeId: 'a1-2',
              shapeQuality: 'approximate' as const,
              minutes: [],
              timesSource: 'estimate' as const,
            },
          ],
        },
      ],
    };
    const trip = (directionId: string, shapeId: string, serviceId: string, hhmm: number) => ({
      lineCode: '1',
      serviceId,
      directionId,
      shapeId,
      startSeconds: hhmm * 60,
    });
    const timetables = buildTimetables(
      network,
      [
        trip('0', '14', 'L', 420),
        trip('0', '15', 'L', 360), // variante del mismo sentido
        trip('1', '12', 'L', 400), // sentido contrario
        trip('0', '14', 'F', 600),
      ],
      new Map([
        ['L', ['20261005']],
        ['F', ['20261012']],
        ['X', ['20261013']],
      ]),
    );
    assert.deepEqual(timetables.departures, {
      '1|1': { L: [360, 420], F: [600] },
    });
    assert.deepEqual(Object.keys(timetables.services).sort(), ['F', 'L']);
  });
});

describe('Calles del callejero', () => {
  const vias = [
    'FID,CODVIAL5,CODVIAL,NOMVIAL,CODHACIENDA,CODTIPVIAL,CODCLASEVIAL,CODCALLECOM,CODCALLEFIN,FECALTA,FECBAJA',
    'a,10,100,LARIOS,1,5,1,,,1900-01-01,',
    'b,20,200,VIEJA,1,5,1,,,1900-01-01,2001-01-01',
    'c,30,300,SIN PORTALES,1,2,2,,,1900-01-01,',
  ].join('\n');
  const tipos = ['FID,CODTIPVIAL,ABRTIPVIAL,DESTIPVIAL', 't,5,CL,Calle', 'u,2,AV,Avenida'].join(
    '\n',
  );
  const numeros = [
    'FID,ID_NUMERO,ID_TRAMOVIAL,CODVIAL5,CODVIAL,NUMERO,BIS,TIPNUMERO,FECALTA,FECBAJA,GMROTATION,SDOPUNTO',
    'n1,1,1,10,100,1, ,A,2008-01-01,,0,POINT (-4.4210 36.7200)',
    // A 11 m del portal 1: no se publica (menos de 40 m).
    'n2,2,1,10,100,3, ,A,2008-01-01,,0,POINT (-4.4210 36.7201)',
    'n3,3,1,10,100,21, ,A,2008-01-01,,0,POINT (-4.4210 36.7210)',
    'n4,4,1,20,200,5, ,A,2008-01-01,,0,POINT (-4.4300 36.7300)',
  ].join('\n');

  it('publica las calles en vigor con portales separados al menos 40 m', () => {
    const file = buildStreets(parseStreets(vias, tipos, numeros));
    assert.equal(file.streets.length, 1);
    const [street] = file.streets;
    assert.equal(street!.name, 'Calle Larios');
    assert.deepEqual(street!.numbers, [1, 21]);
    assert.deepEqual(
      decodePolyline(street!.points).map(([lat]) => lat),
      [36.72, 36.721],
    );
  });
});

describe('horario exacto por viaje', () => {
  it('alinea las paradas del viaje con las del sentido y completa las que faltan', () => {
    const profile = tripProfile(['a', 'b', 'c', 'd'], [0, 3, 6, 9], {
      stopCodes: ['a', 'c', 'd'],
      minutes: [0, 5, 11],
    });
    // b no viene en el viaje: a (0) + (3 − 0) del tiempo típico.
    assert.deepEqual(profile, [0, 3, 5, 11]);
  });

  it('si el viaje casi no coincide con el sentido, no da perfil', () => {
    assert.equal(
      tripProfile(['a', 'b'], [0, 3], {
        stopCodes: ['x', 'b'],
        minutes: [0, 4],
      }),
      null,
    );
  });
});

describe('tráfico', () => {
  const cuts = {
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-4.42, 36.72] },
        properties: {
          ID: 1,
          TIPOCORTE: 'Obras',
          TIPOAFECTACION: ' Corte',
          DESCRIPCION: 'Corte total\r\nde la calle',
          DIRECCION: 'CALLE LARIOS, 1 ',
          DESDE: '06/10/2026 8:00',
          HASTA: '06/10/2026 18:00',
        },
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-4.41, 36.71] },
        properties: {
          ID: 2,
          TIPOCORTE: 'Mudanza',
          DESDE: '01/01/2025 8:00',
          HASTA: '02/01/2025 8:00',
        },
      },
    ],
  };

  it('lee los cortes del Ayuntamiento y descarta los que ya terminaron', () => {
    const items = parseMunicipalCuts(cuts);
    assert.equal(items.length, 2);
    assert.equal(items[0]!.effect, 'Corte');
    assert.equal(items[0]!.description, 'Corte total de la calle');
    assert.equal(items[0]!.from, '2026-10-06T08:00');
    const file = buildTraffic(items, '2026-10-04T12:00');
    assert.deepEqual(
      file.items.map((i) => i.id),
      ['ayto-1'],
    );
    assert.equal(localDate('basura'), null);
  });

  it('lee las incidencias de la DGT solo en la zona de Málaga', () => {
    const record = (id: string, lat: number, lon: number) =>
      `<sit:situationRecord xsi:type="sit:GenericSituationRecord" id="${id}" version="1">
        <com:overallStartTime>2026-10-04T10:00:00.000+02:00</com:overallStartTime>
        <sit:causeType>roadMaintenance</sit:causeType>
        <loc:roadName>MA-20</loc:roadName>
        <loc:latitude>${lat}</loc:latitude> <loc:longitude>${lon}</loc:longitude>
      </sit:situationRecord>`;
    const items = parseDgtSituations(record('a', 36.7, -4.45) + record('b', 40.4, -3.7));
    assert.deepEqual(
      items.map((i) => [i.id, i.kind, i.effect, i.from]),
      [['dgt-a', 'roadMaintenance', 'MA-20', '2026-10-04T10:00']],
    );
  });
});

describe('red peatonal (2B)', () => {
  // Un cruce en "T": A–B–C en línea y B–D hacia arriba, más un trozo aislado E–F.
  const osm = {
    elements: [
      { type: 'node', id: 1, lat: 36.72, lon: -4.42 },
      { type: 'node', id: 2, lat: 36.72, lon: -4.419 },
      { type: 'node', id: 3, lat: 36.72, lon: -4.418 },
      { type: 'node', id: 4, lat: 36.721, lon: -4.419 },
      { type: 'node', id: 5, lat: 36.73, lon: -4.4 },
      { type: 'node', id: 6, lat: 36.731, lon: -4.4 },
      { type: 'node', id: 7, lat: 36.7205, lon: -4.4192 },
      { type: 'way', id: 10, nodes: [1, 2, 3], tags: { highway: 'residential' } },
      { type: 'way', id: 11, nodes: [2, 7, 4], tags: { highway: 'steps' } },
      { type: 'way', id: 12, nodes: [5, 6], tags: { highway: 'footway' } },
      { type: 'way', id: 13, nodes: [99, 1] },
    ],
  };

  it('lee las vías de Overpass y marca las escaleras', () => {
    const ways = parseOsmWalk(osm);
    assert.equal(ways.length, 3); // la 13 apunta a un nodo que no existe
    assert.deepEqual(
      ways.map((w) => w.steps),
      [false, true, false],
    );
  });

  it('parte las vías en los cruces, se queda con la parte conectada y encarece las escaleras', () => {
    const graph = buildWalkGraph(parseOsmWalk(osm), new Date('2026-10-05T00:00:00Z'));
    const nodes = decodePolyline(graph.nodes);
    assert.equal(nodes.length, 4); // 1, 2, 3 y 4; el trozo 5–6 queda fuera
    assert.equal(graph.edges.length, 3);
    const stepsEdge = graph.edges.find((e) => e.length === 4)!; // 2–7–4 no es recto
    const straight =
      distanceM([36.72, -4.419], [36.7205, -4.4192]) +
      distanceM([36.7205, -4.4192], [36.721, -4.419]);
    assert.equal(stepsEdge[2], Math.round(straight * STEPS_FACTOR));
    assert.equal(graph.builtAt, '2026-10-05T00:00:00.000Z');
  });

  it('reutiliza la red publicada si tiene menos de una semana y si no la descarga', async () => {
    const stops = [{ lat: 36.72, lon: -4.42 }];
    const recent = JSON.stringify({
      schemaVersion: 1,
      builtAt: '2026-10-01T00:00:00Z',
      nodes: '',
      edges: [[0, 1, 5]],
    });
    let calls = 0;
    const fetchFn = async () => {
      calls++;
      throw new Error('sin red');
    };
    const now = new Date('2026-10-05T00:00:00Z');
    const kept = await resolveWalkGraph(recent, stops, now, fetchFn);
    assert.equal(kept?.reused, true);
    assert.equal(calls, 0);
    // Vieja y con la descarga fallando: se mantiene la vieja.
    const old = await resolveWalkGraph(recent, stops, new Date('2026-10-20T00:00:00Z'), fetchFn);
    assert.equal(old?.reused, true);
    assert.equal(calls, 1);
    // Sin anterior y con la descarga fallando: no hay red peatonal.
    assert.equal(await resolveWalkGraph(null, stops, now, fetchFn), null);
  });

  it('la consulta excluye autopistas y vías privadas', () => {
    const query = walkQuery([36.6, -4.6, 36.8, -4.3]);
    assert.match(query, /motorway/);
    assert.match(query, /\(36\.6,-4\.6,36\.8,-4\.3\)/);
  });
});
