import { transit_realtime } from 'gtfs-realtime-bindings';

import { decodeTripUpdates, decodeVehicles } from './gtfs-rt-decode';

const { FeedMessage, TripUpdate } = transit_realtime;

/** Mensaje como los de la EMT (17/10/2026), codificado en protobuf. */
function encode(entity: object[]): Uint8Array {
  return FeedMessage.encode(
    FeedMessage.fromObject({
      header: { gtfsRealtimeVersion: '1.0', timestamp: 1792256369 },
      entity,
    }),
  ).finish();
}

describe('Lectura del GTFS-RT de la EMT', () => {
  it('lee las posiciones y descarta las incompletas', () => {
    const bytes = encode([
      {
        id: 'vehicle_position_660',
        vehicle: {
          trip: { tripId: 'G2606S_F21_072-03_13', routeId: '72' },
          position: { latitude: 36.728, longitude: -4.4405 },
          timestamp: 1792256314,
          vehicle: { id: '660' },
        },
      },
      { id: 'sin_posicion', vehicle: { vehicle: { id: '661' } } },
    ]);
    const [vehicle, ...rest] = decodeVehicles(bytes);
    expect(rest).toEqual([]);
    expect(vehicle).toMatchObject({
      id: '660',
      tripId: 'G2606S_F21_072-03_13',
      timestamp: 1792256314,
    });
    expect(vehicle!.lat).toBeCloseTo(36.728, 3);
  });

  it('lee las llegadas previstas, las paradas suprimidas y la salida programada', () => {
    const bytes = encode([
      {
        id: 'trip_update_660_072-03_13',
        tripUpdate: {
          trip: { tripId: 'G2606S_F21_072-03_13', startTime: '18:56:00', startDate: '20261017' },
          vehicle: { id: '660' },
          timestamp: 1792256369,
          stopTimeUpdate: [
            { stopSequence: 4, arrival: { time: 1792256468 } },
            {
              stopSequence: 19,
              arrival: { time: 1792258316 },
              scheduleRelationship: TripUpdate.StopTimeUpdate.ScheduleRelationship.SKIPPED,
            },
          ],
        },
      },
    ]);
    expect(decodeTripUpdates(bytes)).toEqual([
      {
        tripId: 'G2606S_F21_072-03_13',
        vehicleId: '660',
        start: Date.UTC(2026, 9, 17, 16, 56) / 1000,
        timestamp: 1792256369,
        stops: [
          { sequence: 4, time: 1792256468, skipped: false },
          { sequence: 19, time: 1792258316, skipped: true },
        ],
      },
    ]);
  });
});
