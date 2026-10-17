import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { NetworkFile, TimetablesFile } from '../output-schema.ts';
import {
  aggregateDelays,
  dayTypeOf,
  formatObservation,
  historyDays,
  measureDelay,
  parseObservations,
  parseSightings,
} from '../delays/delays.ts';

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

const timetables: TimetablesFile = {
  schemaVersion: 1,
  services: { LAB: ['20261016'] },
  // Salidas a las 8:00 y 8:30.
  departures: { '3|1': { LAB: [480, 510] } },
};

const record = (stop: string, time: string) => ({
  type: 'Feature',
  properties: { codLinea: '3.0', codBus: '640', sentido: '1', codParIni: stop, last_update: time },
});

describe('Retrasos habituales (Fase 10)', () => {
  it('lee la fuente de posiciones', () => {
    assert.deepEqual(parseSightings([record('b', '2026-10-16 08:07:30'), { roto: true }]), [
      {
        bus: '640',
        lineId: '3',
        directionId: 1,
        stopId: 'b',
        dateKey: '20261016',
        seconds: 8 * 3600 + 7 * 60 + 30,
      },
    ]);
  });

  it('mide el retraso frente al viaje del horario que está haciendo', () => {
    // El de las 8:00 pasa por b a las 8:05; se le ve a las 8:07:30: 2,5 min tarde.
    const [sighting] = parseSightings([record('b', '2026-10-16 08:07:30')]);
    assert.equal(measureDelay(sighting!, network, timetables)?.delay, 2.5);
    // En la primera parada (esperando para salir) o sin servicio ese día, no se mide.
    const [first] = parseSightings([record('a', '2026-10-16 08:07:30')]);
    assert.equal(measureDelay(first!, network, timetables), null);
    const [otherDay] = parseSightings([record('b', '2026-10-17 08:07:30')]);
    assert.equal(measureDelay(otherDay!, network, timetables), null);
  });

  it('guarda y lee el histórico, descartando líneas dañadas', () => {
    const [sighting] = parseSightings([record('c', '2026-10-16 08:41:00')]);
    const observation = measureDelay(sighting!, network, timetables)!;
    const text = formatObservation(observation) + '\nroto\n';
    assert.deepEqual(parseObservations('20261016', text), [observation]);
  });

  it('calcula la mediana por línea, sentido, tipo de día, hora y tramo', () => {
    const base = { lineId: '3', directionId: 1, bus: 'x' };
    const at = (dateKey: string, hour: number, stopIndex: number, delay: number) => ({
      ...base,
      dateKey,
      seconds: hour * 3600,
      stopIndex,
      delay,
    });
    // Jueves 16: cinco datos a las 8 en el primer tramo; solo dos en el segundo.
    const observations = [
      ...[1, 2, 3, 4, 10].map((d) => at('20261016', 8, 2, d)),
      at('20261016', 8, 6, 5),
      at('20261016', 8, 7, 5),
    ];
    const file = aggregateDelays(observations, 1, 1);
    assert.deepEqual(file.delays['3|1|L']![8], [3]);
    assert.equal(file.delays['3|1|S'], undefined);
  });

  it('tipos de día y días del histórico', () => {
    assert.equal(dayTypeOf('20261016'), 'L');
    assert.equal(dayTypeOf('20261017'), 'S');
    assert.equal(dayTypeOf('20261018'), 'F');
    assert.deepEqual(historyDays('20261017', 2), ['20261016', '20261015']);
  });
});
