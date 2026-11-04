import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { NetworkFile, TimetablesFile } from '../output-schema.ts';
import {
  aggregateDelays,
  dayTypeOf,
  formatObservation,
  historyDays,
  madridEpoch,
  measureDelays,
  parseObservations,
} from '../delays/delays.ts';
import { type FeedTrip, decodeTripUpdates } from '../delays/trip-updates.ts';

const network = {
  schemaVersion: 1,
  stops: [],
  lines: [
    {
      id: '3',
      name: '3',
      notes: '',
      directions: [
        {
          id: 1,
          headsign: 'El Palo',
          stopIds: ['a', 'b', 'c'],
          shapeId: 's',
          shapeQuality: 'official',
          minutes: [0, 5, 10],
          timesSource: 'schedule',
        },
      ],
    },
  ],
} as NetworkFile;

// Salidas de las 8:00 (hora punta: 8 min hasta b) y de las 23:58 (5 min) el 16/10/2026.
// El tiempo real reconoce el viaje 2 del bloque 072-03 del horario G2606S, cuyo
// recorrido es de un viaje típico (6 min hasta b): no se usa para el retraso.
const timetables: TimetablesFile = {
  schemaVersion: 1,
  services: { LAB: ['20261016'] },
  departures: { '3|1': { LAB: [480, 1438] } },
  profiles: {
    '3|1': [
      [0, 8, 16],
      [0, 5, 10],
    ],
  },
  departureProfiles: { '3|1': { LAB: [0, 1] } },
  livePatterns: [{ line: '3', direction: 1, stops: ['a', 'b', 'c'], minutes: [0, 6, 12] }],
  liveTrips: { G2606S: { '072-03': [-1, 0] } },
};

/** Viaje que salió a las 8:00 del 16/10/2026 y llega a b (secuencia 2) a las `arrival`. */
const trip = (arrival: string, extra: Partial<FeedTrip> = {}): FeedTrip => ({
  tripId: 'G2606S_F21_072-03_2',
  startDate: '20261016',
  startTime: '08:00:00',
  vehicleId: '640',
  stops: [
    {
      sequence: 2,
      time: madridEpoch('20261016', seconds(arrival)),
      skipped: false,
    },
  ],
  ...extra,
});

function seconds(clock: string): number {
  const [h, m, s] = clock.split(':').map(Number);
  return h! * 3600 + m! * 60 + (s ?? 0);
}

/** Codificador protobuf mínimo para construir un feed de prueba. */
const varint = (n: number): number[] => {
  const out: number[] = [];
  while (n >= 128) {
    out.push((n % 128) | 128);
    n = Math.floor(n / 128);
  }
  return [...out, n];
};
const field = (number: number, value: number | string | number[]): number[] => {
  if (typeof value === 'number') return [...varint(number * 8), ...varint(value)];
  const bytes = typeof value === 'string' ? [...new TextEncoder().encode(value)] : value;
  return [...varint(number * 8 + 2), ...varint(bytes.length), ...bytes];
};

describe('Retrasos habituales (Fase 10)', () => {
  it('lee las previsiones del GTFS-RT', () => {
    const time = 1_792_130_000;
    const update = [
      ...field(1, [
        ...field(1, 'G2606S_F21_072-03_2'),
        ...field(2, '08:00:00'),
        ...field(3, '20261016'),
      ]),
      ...field(2, [...field(1, 2), ...field(2, [...field(1, 60), ...field(2, time)])]),
      ...field(2, [...field(1, 3), ...field(5, 1)]),
      ...field(3, field(1, '640')),
      ...field(4, time),
    ];
    const bytes = new Uint8Array([
      ...field(1, [...field(1, '2.0'), ...field(3, time)]),
      ...field(2, [...field(1, 'e1'), ...field(3, update)]),
      // Sin autobús: se descarta.
      ...field(2, [...field(1, 'e2'), ...field(3, field(1, field(1, 'X_Y_Z_1')))]),
    ]);
    assert.deepEqual(decodeTripUpdates(bytes), [
      {
        tripId: 'G2606S_F21_072-03_2',
        startDate: '20261016',
        startTime: '08:00:00',
        vehicleId: '640',
        stops: [
          { sequence: 2, time, skipped: false },
          { sequence: 3, time: null, skipped: true },
        ],
      },
    ]);
    assert.throws(() => decodeTripUpdates(new Uint8Array([0x12, 0x05, 0x01])));
  });

  it('hora de Madrid en invierno y en verano', () => {
    assert.equal(madridEpoch('20260115', 0), Date.UTC(2026, 0, 14, 23) / 1000);
    assert.equal(madridEpoch('20260715', 3600), Date.UTC(2026, 6, 14, 23) / 1000);
  });

  it('mide el retraso del viaje en su próxima parada con el horario de su salida', () => {
    // Según el perfil de la salida de las 8:00, debía pasar por b a las 8:08.
    const now = madridEpoch('20261016', seconds('08:05:00'));
    const late = measureDelays([trip('08:10:30')], network, timetables, now);
    assert.deepEqual(late, [
      {
        dateKey: '20261016',
        seconds: seconds('08:08:00'),
        lineId: '3',
        directionId: 1,
        stopIndex: 1,
        delay: 2.5,
        trip: 'G2606S_F21_072-03_2',
      },
    ]);
    // Adelantado: no se confunde con el viaje anterior (no hay que adivinarlo).
    assert.equal(measureDelays([trip('08:06:00')], network, timetables, now)[0]?.delay, -2);
  });

  it('no mide en la primera parada, en suprimidas, con viajes desconocidos ni sin horario', () => {
    const now = madridEpoch('20261016', seconds('08:00:00'));
    const at = madridEpoch('20261016', seconds('08:01:00'));
    const first = trip('', {
      stops: [{ sequence: 1, time: at, skipped: false }],
    });
    const skipped = trip('', {
      stops: [{ sequence: 2, time: at, skipped: true }],
    });
    const unknown = trip('08:06:00', { tripId: 'G2606S_F21_999-99_1' });
    const unscheduled = trip('08:06:00', { startTime: '08:01:00' });
    const otherDay = trip('08:06:00', { startDate: '20261017' });
    const all = [first, skipped, unknown, unscheduled, otherDay];
    assert.deepEqual(measureDelays(all, network, timetables, now), []);
  });

  it('un paso después de medianoche cuenta en el día siguiente', () => {
    const night = trip('', {
      startTime: '23:58:00',
      stops: [
        {
          sequence: 2,
          time: madridEpoch('20261017', seconds('00:05:00')),
          skipped: false,
        },
      ],
    });
    const now = madridEpoch('20261017', seconds('00:01:00'));
    const [observation] = measureDelays([night], network, timetables, now);
    assert.equal(observation?.dateKey, '20261017');
    assert.equal(observation?.seconds, seconds('00:03:00'));
    assert.equal(observation?.delay, 2);
  });

  it('guarda y lee el histórico, descartando líneas dañadas', () => {
    const now = madridEpoch('20261016', seconds('08:05:00'));
    const [observation] = measureDelays([trip('08:10:30')], network, timetables, now);
    const text = formatObservation(observation!) + '\nroto\n';
    assert.deepEqual(parseObservations('20261016', text), [observation]);
  });

  it('calcula el margen habitual (percentiles 25 y 75) por línea, sentido, tipo de día, hora y tramo', () => {
    const base = { lineId: '3', directionId: 1, trip: 'x' };
    const at = (dateKey: string, hour: number, stopIndex: number, delay: number) => ({
      ...base,
      dateKey,
      seconds: hour * 3600,
      stopIndex,
      delay,
    });
    // Jueves 16: nueve datos a las 8 en el primer tramo; solo dos en el segundo.
    const observations = [
      ...[-1, 0, 0, 1, 2, 3, 4, 6, 40].map((d) => at('20261016', 8, 2, d)),
      at('20261016', 8, 6, 5),
      at('20261016', 8, 7, 5),
    ];
    const file = aggregateDelays(observations, 1, 1);
    assert.deepEqual(file.ranges['3|1|L']![8], [[0, 4]]);
    assert.equal(file.ranges['3|1|S'], undefined);
  });

  it('tipos de día y días del histórico', () => {
    assert.equal(dayTypeOf('20261016'), 'L');
    assert.equal(dayTypeOf('20261017'), 'S');
    assert.equal(dayTypeOf('20261018'), 'F');
    assert.deepEqual(historyDays('20261017', 2), ['20261016', '20261015']);
  });
});
