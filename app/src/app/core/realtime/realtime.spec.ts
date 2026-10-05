import { Direction } from '../models/network.model';
import { ageMinutes, estimateArrivals, parseVehicles } from './realtime';

/** Un registro tal como lo publica el Ayuntamiento. */
const record = (bus: string, line: string, sentido: string, stop: string, time: string) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: ['-4.454177', '36.699112'] },
  codBus: bus,
  codLinea: line,
  sentido,
  codParIni: stop,
  properties: { codLinea: line, codBus: bus, sentido, codParIni: stop, last_update: time },
});

const direction: Direction = {
  id: 1,
  headsign: 'Centro',
  stopIds: ['a', 'b', 'c', 'd'],
  shapeId: 'g1',
  shapeQuality: 'official',
  minutes: [0, 4, 10, 15],
};

describe('Tiempo real', () => {
  it('lee los autobuses y normaliza el código de línea ("1.0" -> "1")', () => {
    const [bus] = parseVehicles([record('640', '1.0', '1', 'a', '2026-10-04 15:45:09')]);
    expect(bus).toEqual({
      id: '640',
      lineId: '1',
      directionId: 1,
      lastStopId: 'a',
      lat: 36.699112,
      lon: -4.454177,
      dateKey: '20261004',
      seconds: 15 * 3600 + 45 * 60 + 9,
    });
  });

  it('descarta registros incompletos sin fallar', () => {
    expect(parseVehicles([null, { codBus: '1' }, record('2', '1.0', '1', 'a', 'ayer')])).toEqual(
      [],
    );
    expect(parseVehicles({ no: 'es una lista' })).toEqual([]);
  });

  it('estima la llegada: tiempo programado desde la última parada menos la antigüedad del dato', () => {
    const now = { dateKey: '20261004', seconds: 15 * 3600 + 47 * 60 };
    const vehicles = parseVehicles([
      // Pasó por "a" hace 2 min: a "c" le faltan 10 − 0 − 2 = 8 min.
      record('1', '1.0', '1', 'a', '2026-10-04 15:45:00'),
      // Pasó por "b": 10 − 4 − 2 = 4 min.
      record('2', '1.0', '1', 'b', '2026-10-04 15:45:00'),
      // Ya pasó por "c" o es de otra línea o sentido: no cuentan.
      record('3', '1.0', '1', 'd', '2026-10-04 15:45:00'),
      record('4', '2.0', '1', 'a', '2026-10-04 15:45:00'),
      record('5', '1.0', '2', 'a', '2026-10-04 15:45:00'),
    ]);
    expect(estimateArrivals(vehicles, '1', direction, 2, now)).toEqual([
      { vehicleId: '2', minutes: 4, ageMinutes: 2, delayMinutes: null },
      { vehicleId: '1', minutes: 8, ageMinutes: 2, delayMinutes: null },
    ]);
  });

  it('no usa datos de otro día ni demasiado antiguos', () => {
    const [bus] = parseVehicles([record('1', '1.0', '1', 'a', '2026-10-04 15:00:00')]);
    expect(ageMinutes(bus!, { dateKey: '20261005', seconds: 100 })).toBeNull();
    expect(
      estimateArrivals([bus!], '1', direction, 2, { dateKey: '20261004', seconds: 16 * 3600 }),
    ).toEqual([]);
  });
});
