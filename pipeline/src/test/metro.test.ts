import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { strToU8, zipSync } from 'fflate';

import { encodeShapes } from '../build/build-dataset.ts';
import { buildMetro, mergeTimetables } from '../build/build-metro.ts';
import { partFromPrevious } from '../build/previous-part.ts';
import type { PublishedLine, TimetablesFile } from '../output-schema.ts';

/** GTFS mínimo con la forma del de Metro de Málaga (andenes por línea en El Perchel). */
function metroZip(): Uint8Array {
  return zipSync({
    'routes.txt': strToU8(
      'route_id,route_short_name,route_long_name,route_type,route_color\n1,L1,Línea 1,1,DC241F\n',
    ),
    'stops.txt': strToU8(
      [
        'stop_id,stop_name,stop_desc,stop_lat,stop_lon,location_type,parent_station',
        'ATZ,Atarazanas,Alameda,36.7177,-4.4231,0,',
        'PCH,El Perchel,Estación,36.7126,-4.4316,1,',
        'PC1,El Perchel - L1,Estación,36.7126,-4.4316,0,PCH',
        'CRR,Carranque,Calle Virgen,36.7187,-4.4493,0,',
      ].join('\n'),
    ),
    'trips.txt': strToU8(
      [
        'route_id,service_id,trip_id,direction_id,shape_id',
        '1,LAB,t1,0,S0',
        '1,LAB,t2,0,S0',
        '1,LAB,t3,1,S1',
      ].join('\n'),
    ),
    'stop_times.txt': strToU8(
      [
        'trip_id,arrival_time,departure_time,stop_id,stop_sequence',
        't1,07:00:00,07:00:00,ATZ,1',
        't1,07:03:00,07:03:00,PC1,2',
        't1,07:07:00,07:07:00,CRR,3',
        't2,07:10:00,07:10:00,ATZ,1',
        't2,07:13:00,07:13:00,PC1,2',
        't2,07:18:00,07:18:00,CRR,3',
        't3,07:20:00,07:20:00,CRR,1',
        't3,07:24:00,07:24:00,PC1,2',
        't3,07:27:00,07:27:00,ATZ,3',
      ].join('\n'),
    ),
    'shapes.txt': strToU8(
      [
        'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence',
        'S0,36.7177,-4.4231,1',
        'S0,36.7187,-4.4493,2',
        'S1,36.7187,-4.4493,1',
        'S1,36.7177,-4.4231,2',
      ].join('\n'),
    ),
    'calendar_dates.txt': strToU8('service_id,date,exception_type\nLAB,20261019,1\n'),
  });
}

describe('Metro de Málaga (Fase 11)', () => {
  const metro = buildMetro(metroZip());

  it('publica las líneas con su color y las estaciones (sin andenes) con código "M"', () => {
    const [line] = metro.lines;
    assert.equal(line?.id, 'L1');
    assert.equal(line?.mode, 'metro');
    assert.equal(line?.color, '#DC241F');
    assert.deepEqual(line?.directions[0]?.stopIds, ['MATZ', 'MPCH', 'MCRR']);
    assert.equal(line?.directions[0]?.headsign, 'Carranque');
    assert.deepEqual(
      metro.stops.map((s) => [s.id, s.name, s.mode]),
      [
        ['MATZ', 'Atarazanas', 'metro'],
        ['MCRR', 'Carranque', 'metro'],
        ['MPCH', 'El Perchel', 'metro'],
      ],
    );
  });

  it('minutos típicos (mediana) y el paso exacto de cada viaje en el horario', () => {
    // t1 tarda 0/3/7 y t2 0/3/8: mediana 0/3/8 (redondeada).
    assert.deepEqual(metro.lines[0]?.directions[0]?.minutes, [0, 3, 8]);
    assert.deepEqual(metro.timetables.departures['L1|1'], { LAB: [420, 430] });
    assert.deepEqual(metro.timetables.profiles?.['L1|1'], [
      [0, 3, 7],
      [0, 3, 8],
    ]);
    assert.deepEqual(metro.timetables.services, { LAB: ['20261019'] });
    assert.equal(metro.geometries.size, 2);
  });
});

describe('Metro de la publicación anterior (si falla su GTFS)', () => {
  const metro = buildMetro(metroZip());
  const overview = encodeShapes(metro.geometries, 25).shapes;
  const detail = encodeShapes(metro.geometries, 4).shapes;
  const busLine: PublishedLine = {
    id: '1',
    name: 'Bus',
    notes: '',
    directions: [
      {
        id: 1,
        headsign: 'Centro',
        stopIds: ['100', '101'],
        shapeId: 'e1-1',
        shapeQuality: 'official',
        minutes: [0, 4],
        timesSource: 'schedule',
      },
    ],
  };
  const busTimetables: TimetablesFile = {
    schemaVersion: 1,
    services: { EMT: ['20261019'] },
    departures: { '1|1': { EMT: [400] } },
    profiles: { '1|1': [[0, 4]] },
    departureProfiles: { '1|1': { EMT: [0] } },
    livePatterns: [],
  };
  const busStops = [
    { id: '100', name: 'A', address: '', lat: 36.7, lon: -4.4 },
    { id: '101', name: 'B', address: '', lat: 36.71, lon: -4.41 },
  ];

  it('recupera solo el metro (líneas, estaciones, trazados y horario) de los datos publicados', () => {
    const previous = partFromPrevious(
      {
        network: {
          schemaVersion: 1,
          lines: [busLine, ...metro.lines],
          stops: [...busStops, ...metro.stops],
        },
        shapesOverview: {
          schemaVersion: 1,
          toleranceM: 25,
          shapes: { 'e1-1': 'xx', ...overview },
        },
        shapesDetail: {
          schemaVersion: 1,
          toleranceM: 4,
          shapes: { 'e1-1': 'yy', ...detail },
        },
        timetables: mergeTimetables(busTimetables, metro.timetables),
      },
      'metro',
    );
    assert.deepEqual(previous, {
      lines: metro.lines,
      stops: metro.stops,
      shapesOverview: overview,
      shapesDetail: detail,
      timetables: metro.timetables,
    });
  });

  it('sin metro en la publicación anterior no devuelve nada', () => {
    assert.equal(
      partFromPrevious(
        {
          network: { schemaVersion: 1, lines: [busLine], stops: busStops },
          shapesOverview: { schemaVersion: 1, toleranceM: 25, shapes: {} },
          shapesDetail: { schemaVersion: 1, toleranceM: 4, shapes: {} },
          timetables: busTimetables,
        },
        'metro',
      ),
      null,
    );
  });
});
