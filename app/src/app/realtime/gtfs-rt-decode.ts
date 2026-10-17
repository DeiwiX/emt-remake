import { transit_realtime } from 'gtfs-realtime-bindings';

import {
  FeedStopUpdate,
  FeedTripUpdate,
  FeedVehicle,
  madridEpoch,
} from '../core/realtime/realtime';

const { FeedMessage, TripUpdate } = transit_realtime;
const SKIPPED = TripUpdate.StopTimeUpdate.ScheduleRelationship.SKIPPED;

/** Los enteros de 64 bits del feed llegan como número o como Long de protobufjs. */
function seconds(value: number | { toNumber(): number } | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : value.toNumber();
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Posiciones de los autobuses (VehiclePositions). Descarta las incompletas sin fallar. */
export function decodeVehicles(bytes: Uint8Array): FeedVehicle[] {
  const feed = FeedMessage.decode(bytes);
  const headerTime = seconds(feed.header.timestamp);
  return feed.entity.flatMap((entity): FeedVehicle[] => {
    const v = entity.vehicle;
    const id = v?.vehicle?.id ?? '';
    const lat = v?.position?.latitude;
    const lon = v?.position?.longitude;
    const timestamp = seconds(v?.timestamp) ?? headerTime;
    if (!v || !id || typeof lat !== 'number' || typeof lon !== 'number' || timestamp === null) {
      return [];
    }
    return [{ id, tripId: v.trip?.tripId || null, lat, lon, timestamp }];
  });
}

/** Llegadas previstas de cada viaje (TripUpdates). */
export function decodeTripUpdates(bytes: Uint8Array): FeedTripUpdate[] {
  const feed = FeedMessage.decode(bytes);
  const headerTime = seconds(feed.header.timestamp) ?? 0;
  return feed.entity.flatMap((entity): FeedTripUpdate[] => {
    const update = entity.tripUpdate;
    const tripId = update?.trip?.tripId;
    if (!update || !tripId) return [];
    const { startDate, startTime } = update.trip;
    const stops = (update.stopTimeUpdate ?? []).flatMap((s): FeedStopUpdate[] =>
      typeof s.stopSequence === 'number'
        ? [
            {
              sequence: s.stopSequence,
              time: seconds(s.arrival?.time) ?? seconds(s.departure?.time),
              skipped: s.scheduleRelationship === SKIPPED,
            },
          ]
        : [],
    );
    return [
      {
        tripId,
        vehicleId: update.vehicle?.id || null,
        start: startDate && startTime ? madridEpoch(startDate, startTime) : null,
        timestamp: seconds(update.timestamp) ?? headerTime,
        stops,
      },
    ];
  });
}
