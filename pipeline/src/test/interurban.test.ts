import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { strToU8, zipSync } from 'fflate';

import {
  buildInterurban,
  holidayServiceDates,
  parseConsortiumStops,
} from '../build/build-interurban.ts';
import { partFromPrevious } from '../build/previous-part.ts';
import { mergeTimetables } from '../build/build-metro.ts';
import { encodeShapes } from '../build/build-dataset.ts';
import { ValidationError } from '../validation.ts';

const csv = (rows: string[]) => strToU8(rows.join('\n'));

/**
 * GTFS unificado mínimo con la forma del de la Red de Consorcios: una línea de
 * Sevilla (1_) que se ignora y una de Málaga (4_) con dos recorridos que acaban
 * en la misma parada, uno de ellos sin subir en la capital.
 */
function consortiumZip(): Uint8Array {
  return zipSync({
    'routes.txt': csv([
      'route_id,agency_id,route_short_name,route_long_name,route_type,route_color',
      '1_9,1_1,M-101,Sevilla - Bormujos,3,FF0000',
      '4_7,4_1,M-110,M-110 Málaga - Torremolinos - Benalmádena,3,009900',
    ]),
    'stops.txt': csv([
      'stop_id,stop_name,stop_lat,stop_lon',
      '1_1,Plaza de Armas,37.39,-6.00',
      '4_1,Muelle Heredia,36.7160,-4.4210',
      '4_2,Hospital Civil,36.7200,-4.4400',
      '4_3,Torremolinos,36.6230,-4.5000',
      '4_4,Benalmádena Costa,36.5960,-4.5160',
      '4_5,Arroyo de la Miel V,36.6010,-4.5300',
    ]),
    'trips.txt': csv([
      'route_id,service_id,trip_id,trip_headsign,direction_id,shape_id',
      '1_9,1_LAB,s1,,0,1_S',
      '4_7,4_LAB,a1,,0,4_SA',
      '4_7,4_LAB,a2,,0,4_SA',
      '4_7,4_DOM,a3,,0,4_SA',
      '4_7,4_LAB,b1,,0,',
    ]),
    'stop_times.txt': csv([
      'trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type',
      's1,07:00:00,07:00:00,1_1,1,0,0',
      'a1,07:00:00,07:00:00,4_1,1,0,1',
      'a1,07:05:00,07:05:00,4_2,2,0,1',
      'a1,07:30:00,07:30:00,4_3,3,0,0',
      'a1,07:45:00,07:45:00,4_4,4,1,0',
      'a2,08:00:00,08:00:00,4_1,1,0,1',
      'a2,08:06:00,08:06:00,4_2,2,0,1',
      'a2,08:32:00,08:32:00,4_3,3,0,0',
      'a2,08:47:00,08:47:00,4_4,4,1,0',
      'a3,09:00:00,09:00:00,4_1,1,0,1',
      'a3,09:05:00,09:05:00,4_2,2,0,0',
      'a3,09:30:00,09:30:00,4_3,3,0,0',
      'a3,09:45:00,09:45:00,4_4,4,1,0',
      'b1,10:00:00,10:00:00,4_5,1,0,0',
      'b1,10:20:00,10:20:00,4_4,2,0,0',
    ]),
    'shapes.txt': csv([
      'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence',
      '4_SA,36.7160,-4.4210,1',
      '4_SA,36.6230,-4.5000,2',
      '4_SA,36.5960,-4.5160,3',
      '4_SA,40.0,-3.0,4',
    ]),
    // Laborables y domingos todo el año (end_date de broma, como en el GTFS real);
    // el lunes 7/12/2026 es festivo: se añade el domingo y no se quita el laborable.
    'calendar.txt': csv([
      'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date',
      '1_LAB,1,1,1,1,1,0,0,20260101,20301231',
      '4_LAB,1,1,1,1,1,0,0,20260101,20301231',
      '4_DOM,0,0,0,0,0,0,1,20260101,20301231',
    ]),
    'calendar_dates.txt': csv(['service_id,date,exception_type', '4_DOM,20261207,1']),
  });
}

const apiStops = parseConsortiumStops({
  paradas: [
    {
      idParada: '1',
      municipio: 'Málaga',
      latitud: '36.716',
      longitud: '-4.421',
    },
    { idParada: '2', municipio: 'Málaga', latitud: '36.72', longitud: '-4.44' },
    {
      idParada: '3',
      municipio: 'Torremolinos',
      latitud: '36.623',
      longitud: '-4.5',
    },
    {
      idParada: '4',
      municipio: 'Benalmádena',
      latitud: '36.596',
      longitud: '-4.516',
    },
    { idParada: '99', municipio: '', latitud: 'x', longitud: '' },
  ],
});
const few = { minLines: 1, minStops: 1 };

describe('Interurbanos del Consorcio de Málaga (ADR 0022)', () => {
  const data = buildInterurban(consortiumZip(), apiStops, '20261201', '20261210', few);
  const [line] = data.lines;

  it('solo el consorcio de Málaga, con su color, código y nombre sin el código delante', () => {
    assert.equal(data.lines.length, 1);
    assert.equal(line?.id, 'M-110');
    assert.equal(line?.mode, 'interurban');
    assert.equal(line?.color, '#2F7D5B');
    assert.equal(line?.name, 'Málaga - Torremolinos - Benalmádena');
  });

  it('cada recorrido es un sentido; el destino es la última parada (y de dónde sale si se repite)', () => {
    assert.deepEqual(
      line?.directions.map((d) => [d.id, d.headsign, d.stopIds]),
      [
        [1, 'Benalmádena Costa (desde Muelle Heredia)', ['I1', 'I2', 'I3', 'I4']],
        [2, 'Benalmádena Costa (desde Arroyo de la Miel V)', ['I5', 'I4']],
      ],
    );
  });

  it('paradas con prefijo "I", modo y municipio (el de la más cercana si la API no la trae)', () => {
    assert.deepEqual(
      data.stops.map((s) => [s.id, s.name, s.address, s.mode]),
      [
        ['I1', 'Muelle Heredia', 'Málaga', 'interurban'],
        ['I2', 'Hospital Civil', 'Málaga', 'interurban'],
        ['I3', 'Torremolinos', 'Torremolinos', 'interurban'],
        ['I4', 'Benalmádena Costa', 'Benalmádena', 'interurban'],
        ['I5', 'Arroyo de la Miel V', 'Benalmádena', 'interurban'],
      ],
    );
  });

  it('no subir o bajar donde lo dice la mayoría de los viajes, sin lo evidente de los extremos', () => {
    const main = line!.directions[0]!;
    // En Hospital Civil 2 de 3 viajes no dejan bajar; en la primera no se baja nunca.
    assert.deepEqual(main.noAlighting, [1]);
    assert.equal(main.noBoarding, undefined);
    assert.equal(line!.directions[1]!.noAlighting, undefined);
  });

  it('trazado oficial sin puntos fuera de la provincia; sin trazado, uniendo paradas', () => {
    const main = line!.directions[0]!;
    assert.equal(main.shapeQuality, 'official');
    assert.equal(data.geometries.get(main.shapeId)?.length, 3);
    const branch = line!.directions[1]!;
    assert.equal(branch.shapeQuality, 'approximate');
    assert.equal(data.geometries.get(branch.shapeId)?.length, 2);
  });

  it('horario con minutos típicos, perfiles exactos y servicios con prefijo propio', () => {
    const main = line!.directions[0]!;
    assert.deepEqual(main.minutes, [0, 5, 30, 45]);
    const t = data.timetables;
    assert.deepEqual(t.departures['M-110|1'], {
      iLAB: [420, 480],
      iDOM: [540],
    });
    assert.deepEqual(t.profiles?.['M-110|1'], [
      [0, 5, 30, 45],
      [0, 6, 32, 47],
    ]);
    assert.deepEqual(t.departureProfiles?.['M-110|1'], {
      iLAB: [0, 1],
      iDOM: [0],
    });
  });

  it('solo los días publicados, y el festivo con horario de domingo y sin el de laborable', () => {
    const { services } = data.timetables;
    assert.ok(!services['iLAB']?.includes('20261207'));
    assert.ok(services['iDOM']?.includes('20261207'));
    assert.ok(services['iLAB']?.includes('20261201'));
    assert.ok(
      services['iLAB']?.includes('20261130'),
      'el día anterior, por los viajes de madrugada',
    );
    assert.ok(!services['iLAB']?.some((d) => d > '20261210'));
  });

  it('sin líneas suficientes la fuente se da por rota', () => {
    assert.throws(
      () => buildInterurban(consortiumZip(), null, '20261201', '20261210'),
      ValidationError,
    );
  });

  it('sin la API las paradas se publican sin municipio', () => {
    const plain = buildInterurban(consortiumZip(), null, '20261201', '20261210', few);
    assert.ok(plain.stops.every((s) => s.address === ''));
  });

  it('se recupera de la publicación anterior junto con el metro y la EMT', () => {
    const shapes = encodeShapes(data.geometries, 25).shapes;
    const previous = partFromPrevious(
      {
        network: { schemaVersion: 1, lines: data.lines, stops: data.stops },
        shapesOverview: { schemaVersion: 1, toleranceM: 25, shapes },
        shapesDetail: { schemaVersion: 1, toleranceM: 4, shapes },
        timetables: mergeTimetables(
          { schemaVersion: 1, services: {}, departures: {} },
          data.timetables,
        ),
      },
      'interurban',
    );
    assert.equal(previous?.lines.length, 1);
    assert.equal(previous?.stops.length, 5);
    assert.deepEqual(Object.keys(previous?.timetables.services ?? {}).sort(), ['iDOM', 'iLAB']);
  });
});

describe('Festivos del Consorcio', () => {
  it('un servicio añadido que no es de domingo no convierte el día en festivo', () => {
    const dates = holidayServiceDates(
      [
        {
          service_id: 'LAB',
          monday: '1',
          tuesday: '1',
          wednesday: '1',
          thursday: '1',
          friday: '1',
          saturday: '0',
          sunday: '0',
          start_date: '20261201',
          end_date: '20261231',
        },
      ],
      [{ service_id: 'FERIA', date: '20261202', exception_type: '1' }],
      '20261201',
      '20261203',
    );
    assert.deepEqual(dates.get('LAB'), ['20261201', '20261202', '20261203']);
    assert.deepEqual(dates.get('FERIA'), ['20261202']);
  });
});
