import {
  FeedTripUpdate,
  LiveIndex,
  approachingBus,
  arrivalsAt,
  liveTrips,
  liveVehicles,
  madridEpoch,
  nextStopIndex,
  patternOf,
  stopTrips,
  tripKeyParts,
} from './realtime';

/** Línea 1, sentido 1: a → b → c → d (y una variante que se salta "c"); sentido 2 al revés. */
const index: LiveIndex = {
  patterns: [
    { lineId: '1', directionId: 1, stops: ['a', 'b', 'c', 'd'], minutes: [0, 4, 10, 15] },
    { lineId: '1', directionId: 1, stops: ['a', 'b', 'd'], minutes: [0, 4, 12] },
    { lineId: '1', directionId: 2, stops: ['d', 'c', 'b', 'a'], minutes: [0, 5, 11, 15] },
  ],
  trips: new Map([['G1L', new Map([['001-01', [0, 2, 1]]])]]),
};

const T0 = 1_792_000_000;
const update = (tripId: string, overrides: Partial<FeedTripUpdate> = {}): FeedTripUpdate => ({
  tripId,
  vehicleId: 'bus',
  start: T0,
  timestamp: T0 + 60,
  stops: [],
  ...overrides,
});

describe('Tiempo real de la EMT (GTFS-RT)', () => {
  it('reconoce el viaje por horario, bloque y número, sin la variante', () => {
    expect(tripKeyParts('G2606S_F21_072-03_13')).toEqual({
      schedule: 'G2606S',
      block: '072-03',
      trip: 13,
    });
    expect(patternOf(index, 'G1L_F9_001-01_2')?.directionId).toBe(2);
    expect(patternOf(index, 'G1L_F9_001-01_4')).toBeNull();
    expect(patternOf(index, 'raro')).toBeNull();
  });

  it('completa las paradas sin dato con el retraso de la anterior y salta las suprimidas', () => {
    const [trip] = liveTrips(
      [
        update('G1L_F1_001-01_1', {
          stops: [
            { sequence: 2, time: T0 + 6 * 60, skipped: false }, // b, 2 min tarde
            { sequence: 3, time: T0 + 12 * 60, skipped: true },
          ],
        }),
      ],
      index,
    );
    expect(trip).toMatchObject({ lineId: '1', directionId: 1, vehicleId: 'bus' });
    // a ya pasó; c no para; d hereda el retraso de c (2 min).
    expect(trip!.arrivals).toEqual([null, T0 + 6 * 60, null, T0 + 17 * 60]);
    expect(trip!.delays).toEqual([null, 120, 120, 120]);
    expect(nextStopIndex(trip!, T0 + 5 * 60)).toBe(1);
    expect(nextStopIndex(trip!, T0 + 8 * 60)).toBe(3);
  });

  it('da las llegadas a una parada de la más próxima a la más lejana', () => {
    const trips = liveTrips(
      [
        update('G1L_F1_001-01_1', { stops: [{ sequence: 3, time: T0 + 600, skipped: false }] }),
        update('G1L_F1_001-01_3', {
          vehicleId: null,
          stops: [{ sequence: 1, time: T0 + 60, skipped: false }],
        }),
        // Otro sentido y un viaje sin recorrido conocido: no cuentan.
        update('G1L_F1_001-01_2', { stops: [{ sequence: 1, time: T0, skipped: false }] }),
        update('G9X_F1_009-01_1', { stops: [{ sequence: 1, time: T0, skipped: false }] }),
      ],
      index,
    );
    expect(arrivalsAt(trips, '1', 1, 'd', T0)).toEqual([
      // a las T0 + 60 s y d 12 min después.
      { tripId: 'G1L_F1_001-01_3', vehicleId: null, minutes: 13, ageMinutes: 0, delayMinutes: 1 },
      { tripId: 'G1L_F1_001-01_1', vehicleId: 'bus', minutes: 15, ageMinutes: 0, delayMinutes: 0 },
    ]);
    // Ya pasado (más de medio minuto) no cuenta.
    expect(arrivalsAt(trips, '1', 1, 'c', T0 + 700)).toEqual([]);
  });

  it('no usa datos viejos ni llegadas a más de una hora', () => {
    const trips = liveTrips(
      [
        update('G1L_F1_001-01_1', {
          stops: [{ sequence: 4, time: T0 + 2 * 3600, skipped: false }],
        }),
      ],
      index,
    );
    expect(arrivalsAt(trips, '1', 1, 'd', T0)).toEqual([]);
    const old = liveTrips(
      [
        update('G1L_F1_001-01_1', {
          timestamp: T0 - 20 * 60,
          stops: [{ sequence: 4, time: T0 + 60, skipped: false }],
        }),
      ],
      index,
    );
    expect(arrivalsAt(old, '1', 1, 'd', T0)).toEqual([]);
  });

  it('pone a cada autobús la línea y el sentido de su viaje', () => {
    expect(
      liveVehicles(
        [
          { id: '640', tripId: 'G1L_F1_001-01_2', lat: 36.7, lon: -4.4, timestamp: T0 },
          { id: '641', tripId: null, lat: 36.7, lon: -4.4, timestamp: T0 },
        ],
        index,
      ),
    ).toEqual([
      {
        id: '640',
        lineId: '1',
        directionId: 2,
        lat: 36.7,
        lon: -4.4,
        timestamp: T0,
        tripId: 'G1L_F1_001-01_2',
      },
    ]);
  });

  it('ubica el autobús que antes llega a la parada, con las paradas que le faltan', () => {
    const trips = liveTrips(
      [
        update('G1L_F1_001-01_1', {
          stops: [{ sequence: 2, time: T0 + 2 * 3600, skipped: false }],
        }),
      ],
      index,
    );
    expect(approachingBus(trips, [{ lineId: '1', directionId: 1 }], 'd', T0)).toEqual({
      vehicleId: 'bus',
      lineId: '1',
      minutes: null,
      stopsAway: 2,
    });
    expect(approachingBus(trips, [{ lineId: '1', directionId: 2 }], 'd', T0)).toBeNull();
  });

  it('prepara para el seguimiento nativo los viajes que pasan por una parada', () => {
    expect(stopTrips(index, '1', 1, 'd')).toEqual({
      patterns: [
        { sequence: 4, minutes: [0, 4, 10, 15] },
        { sequence: 3, minutes: [0, 4, 12] },
      ],
      trips: { 'G1L_001-01_1': 0, 'G1L_001-01_3': 1 },
    });
  });

  it('convierte la hora de salida de Madrid a segundos Unix (verano e invierno)', () => {
    expect(madridEpoch('20261017', '18:56:00')).toBe(Date.UTC(2026, 9, 17, 16, 56) / 1000);
    expect(madridEpoch('20261201', '08:00:00')).toBe(Date.UTC(2026, 11, 1, 7, 0) / 1000);
    expect(madridEpoch('20261017', '25:10:00')).toBe(Date.UTC(2026, 9, 17, 23, 10) / 1000);
    expect(madridEpoch('raro', '08:00:00')).toBeNull();
  });
});
