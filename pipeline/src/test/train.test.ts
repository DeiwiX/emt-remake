import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { strToU8, zipSync } from 'fflate';

import { buildTrain, publishedLineId, trainNumber, withinCity } from '../build/build-train.ts';
import { drawnBackwards, groupPatterns } from '../build/gtfs-patterns.ts';
import { partFromPrevious } from '../build/previous-part.ts';
import { mergeTimetables } from '../build/build-metro.ts';
import { encodeShapes } from '../build/build-dataset.ts';
import { ValidationError } from '../validation.ts';

const csv = (rows: string[]) => strToU8(rows.join('\r\n'));

/**
 * GTFS de Cercanías mínimo con la forma del de Renfe (23/10/2026): campos con
 * espacios de relleno, stop_sequence con ceros, un servicio por día, una ruta de
 * otro núcleo (10, Madrid) que se ignora, la vuelta en Álora con una sola parada
 * y el trazado de la C1 dibujado al revés.
 */
function renfeZip(): Uint8Array {
  return zipSync({
    'routes.txt': csv([
      'route_id,route_short_name,route_long_name,route_type,route_color,route_text_color',
      '10T0001C5 ,C5      ,Móstoles - Fuenlabrada ,2,4a8ccc,FFFFFF',
      '32T0001C1 ,C1      ,Málaga-Centro Alameda      -Fuengirola ,2,4a8ccc,FFFFFF',
      '32T0002C1 ,C1      ,Fuengirola      -Málaga-Centro Alameda ,2,4a8ccc,FFFFFF',
      '32T0003C2 ,C2      ,Málaga-Centro Alameda      -Álora ,2,0fcf34,FFFFFF',
      '32T0019C2 ,C2      ,Álora      - ,2,0fcf34,FFFFFF',
    ]),
    'stops.txt': csv([
      'stop_id,stop_name,stop_lat,stop_lon,wheelchair_boarding',
      '18002 ,Móstoles ,40.32,-3.86,1',
      '54517 ,Málaga-Centro Alameda ,36.7159539,-4.4265335,1',
      '54500 ,Málaga M.Z. Cercanías ,36.7113885,-4.4328909,1',
      '54505 ,Málaga-Aeropuerto ,36.6777169,-4.4901607,1',
      '54516 ,Fuengirola ,36.5418947,-4.6238580,1',
      '54405 ,Álora ,36.8198747,-4.6996105,1',
    ]),
    'trips.txt': csv([
      'route_id,service_id,trip_id,trip_headsign,wheelchair_accessible,block_id,shape_id',
      '10T0001C5 ,1001J ,1001J10001C5 , ,1,1001J10001 ,10_C5',
      '32T0001C1 ,3201J ,3201J23303C1 , ,1,3201J23303 ,32_C1',
      '32T0001C1 ,3201J ,3201J23305C1 , ,1,3201J23305 ,32_C1',
      '32T0001C1 ,3202V ,3202V23303C1 , ,1,3202V23303 ,32_C1',
      '32T0002C1 ,3201J ,3201J23302C1 , ,1,3201J23302 ,32_C1_INV',
      '32T0003C2 ,3201J ,3201J23151C2 , ,1,3201J23151 ,32_C2',
      '32T0019C2 ,3201J ,3201J00301C2 , ,1,3201J23157 ,32_C2',
    ]),
    'stop_times.txt': csv([
      'trip_id,arrival_time,departure_time,stop_id,stop_sequence',
      '1001J10001C5 ,06:00:00,06:00:00,18002 ,001',
      '3201J23303C1 ,05:20:00,05:20:00,54517 ,001',
      '3201J23303C1 ,05:22:00,05:23:00,54500 ,002',
      '3201J23303C1 ,05:31:00,05:32:00,54505 ,003',
      '3201J23303C1 ,06:06:00,06:06:00,54516 ,004',
      '3201J23305C1 ,05:40:00,05:40:00,54517 ,001',
      '3201J23305C1 ,05:42:00,05:43:00,54500 ,002',
      '3201J23305C1 ,05:51:00,05:52:00,54505 ,003',
      '3201J23305C1 ,06:26:00,06:26:00,54516 ,004',
      '3202V23303C1 ,05:20:00,05:20:00,54517 ,001',
      '3202V23303C1 ,05:22:00,05:23:00,54500 ,002',
      '3202V23303C1 ,05:31:00,05:32:00,54505 ,003',
      '3202V23303C1 ,06:06:00,06:06:00,54516 ,004',
      '3201J23302C1 ,06:10:00,06:10:00,54516 ,001',
      '3201J23302C1 ,06:43:00,06:44:00,54505 ,002',
      '3201J23302C1 ,06:52:00,06:53:00,54500 ,003',
      '3201J23302C1 ,06:56:00,06:56:00,54517 ,004',
      '3201J23151C2 ,05:44:00,05:44:00,54517 ,001',
      '3201J23151C2 ,05:46:00,05:47:00,54500 ,002',
      '3201J23151C2 ,06:22:00,06:22:00,54405 ,003',
      '3201J00301C2 ,10:25:00,10:26:00,54405 ,009',
    ]),
    'shapes.txt': csv([
      'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence',
      '10_C5 ,40.32,-3.86,1',
      // 32_C1 empieza en Fuengirola aunque sus viajes salgan de Málaga.
      '32_C1 ,36.5418,-4.6238,1',
      '32_C1 ,36.6777,-4.4901,2',
      '32_C1 ,36.7159,-4.4265,3',
      '32_C1_INV ,36.5418,-4.6238,1',
      '32_C1_INV ,36.7159,-4.4265,2',
    ]),
    // Un servicio por día, como el de Renfe.
    'calendar.txt': csv([
      'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date',
      '1001J ,0,0,0,1,0,0,0,20261029,20261029',
      '3201J ,0,0,0,1,0,0,0,20261029,20261029',
      '3202V ,0,0,0,0,1,0,0,20261030,20261030',
    ]),
  });
}

const few = { minLines: 1, minStops: 1 };

describe('Cercanías de Málaga (ADR 0023)', () => {
  const data = buildTrain(renfeZip(), '20261029', '20261130', few);
  const c1 = data.lines.find((l) => l.id === 'C-1');
  const c2 = data.lines.find((l) => l.id === 'C-2');

  it('solo el núcleo de Málaga, "C-1" (la EMT tiene su C1), en rojo y con los extremos de nombre', () => {
    assert.deepEqual(
      data.lines.map((l) => [l.id, l.name, l.mode, l.color]),
      [
        ['C-1', 'Málaga-Centro Alameda - Fuengirola', 'train', '#C8102E'],
        ['C-2', 'Málaga-Centro Alameda - Álora', 'train', '#C8102E'],
      ],
    );
  });

  it('cada recorrido es un sentido; la vuelta en Álora de una parada no cuenta', () => {
    assert.deepEqual(
      c1?.directions.map((d) => [d.id, d.headsign, d.stopIds, d.minutes]),
      [
        [1, 'Fuengirola', ['T54517', 'T54500', 'T54505', 'T54516'], [0, 3, 12, 46]],
        [2, 'Málaga-Centro Alameda', ['T54516', 'T54505', 'T54500', 'T54517'], [0, 34, 43, 46]],
      ],
    );
    assert.deepEqual(
      c2?.directions.map((d) => d.stopIds),
      [['T54517', 'T54500', 'T54405']],
    );
  });

  it('estaciones con prefijo "T", sin espacios de relleno y sin las de otros núcleos', () => {
    assert.deepEqual(
      data.stops.map((s) => [s.id, s.name, s.mode]),
      [
        ['T54405', 'Álora', 'train'],
        ['T54500', 'Málaga M.Z. Cercanías', 'train'],
        ['T54505', 'Málaga-Aeropuerto', 'train'],
        ['T54516', 'Fuengirola', 'train'],
        ['T54517', 'Málaga-Centro Alameda', 'train'],
      ],
    );
  });

  it('el trazado dibujado al revés se da la vuelta (y cambia de id)', () => {
    const outbound = c1?.directions[0];
    assert.equal(outbound?.shapeId, 't32_C1~r');
    assert.deepEqual(data.geometries.get('t32_C1~r')?.[0], [36.7159, -4.4265]);
    assert.equal(c1?.directions[1]?.shapeId, 't32_C1_INV');
    // La C2 no tiene puntos de trazado: paradas unidas.
    assert.equal(c2?.directions[0]?.shapeQuality, 'approximate');
  });

  it('horario por día de servicio, con el número de tren de cada salida', () => {
    assert.deepEqual(data.timetables.services, {
      t3201J: ['20261029'],
      t3202V: ['20261030'],
    });
    assert.deepEqual(data.timetables.departures['C-1|1'], {
      t3201J: [320, 340],
      t3202V: [320],
    });
    assert.deepEqual(data.timetables.departureTrains?.['C-1|1'], {
      t3201J: ['23303', '23305'],
      t3202V: ['23303'],
    });
    assert.deepEqual(data.timetables.departureTrains?.['C-1|2'], {
      t3201J: ['23302'],
    });
  });

  it('sin líneas suficientes la fuente se da por rota', () => {
    assert.throws(() => buildTrain(renfeZip(), '20261029', '20261130'), ValidationError);
    assert.throws(
      () =>
        buildTrain(
          zipSync({ 'routes.txt': csv(['route_id,route_short_name']) }),
          '20261029',
          '20261130',
          few,
        ),
      ValidationError,
    );
  });

  it('se recupera de la publicación anterior con sus números de tren', () => {
    const shapes = encodeShapes(data.geometries, 5).shapes;
    const timetables = mergeTimetables(
      {
        schemaVersion: 1,
        services: {},
        departures: {},
        profiles: {},
        departureProfiles: {},
      } as never,
      data.timetables,
    );
    const part = partFromPrevious(
      {
        network: { schemaVersion: 1, lines: data.lines, stops: data.stops },
        shapesOverview: { schemaVersion: 1, toleranceM: 5, shapes },
        shapesDetail: { schemaVersion: 1, toleranceM: 5, shapes },
        timetables,
      },
      'train',
    );
    assert.equal(part?.lines.length, 2);
    assert.deepEqual(part?.timetables.departureTrains, data.timetables.departureTrains);
  });
});

describe('piezas de Cercanías', () => {
  it('número de tren: el trip_id sin el servicio ni la línea', () => {
    assert.equal(trainNumber({ id: '3294V23370C1', serviceId: '3294V' }), '23370');
    assert.equal(publishedLineId('C1'), 'C-1');
  });

  it('con los mismos trenes en los dos sentidos, primero el que sale de Málaga', () => {
    const trip = (id: string, stops: string[]) => ({
      id,
      lineId: 'C-2',
      serviceId: 's',
      shapeId: '',
      stops: stops.map((stopId) => ({
        stopId,
        minutes: 0,
        noBoarding: false,
        noAlighting: false,
      })),
    });
    const trips = [trip('a', ['54405', '54517']), trip('b', ['54517', '54405'])];
    assert.deepEqual(
      groupPatterns(trips, '54517').map((p) => p.stopIds[0]),
      ['54517', '54405'],
    );
    assert.deepEqual(
      groupPatterns(trips).map((p) => p.stopIds[0]),
      ['54405', '54517'],
    );
  });

  it('un trazado circular no se da la vuelta', () => {
    const loop: [number, number][] = [
      [36.7, -4.4],
      [36.71, -4.41],
      [36.7, -4.4],
    ];
    assert.equal(
      drawnBackwards(loop, [
        [36.7, -4.4],
        [36.7, -4.4],
      ]),
      false,
    );
  });

  it('para la red peatonal solo cuentan las estaciones de tren dentro de la ciudad', () => {
    const stops = [
      { id: '1', lat: 36.72, lon: -4.42 },
      { id: '2', lat: 36.68, lon: -4.49 },
      { id: 'T54517', lat: 36.7159, lon: -4.4265, mode: 'train' as const },
      { id: 'T54516', lat: 36.5418, lon: -4.6238, mode: 'train' as const },
      { id: 'I1', lat: 36.7, lon: -4.43, mode: 'interurban' as const },
    ];
    assert.deepEqual(
      withinCity(stops).map((s) => s.id),
      ['1', '2', 'T54517'],
    );
  });
});
