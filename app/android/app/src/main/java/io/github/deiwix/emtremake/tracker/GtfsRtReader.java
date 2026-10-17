package io.github.deiwix.emtremake.tracker;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * Lector mínimo del TripUpdates de la EMT (GTFS-RT, protobuf), para el servicio
 * nativo (17/10/2026). Solo lee lo que hace falta para seguir un viaje: su
 * trip_id, el autobús, la hora del dato y la llegada prevista a cada parada. Así
 * no hace falta meter en la app una librería de protobuf entera.
 *
 * Números de campo según gtfs-realtime.proto:
 * FeedMessage.entity = 2; FeedEntity.trip_update = 3;
 * TripUpdate: trip = 1, stop_time_update = 2, vehicle = 3, timestamp = 4;
 * TripDescriptor.trip_id = 1; VehicleDescriptor.id = 1;
 * StopTimeUpdate: stop_sequence = 1, arrival = 2, departure = 3, schedule_relationship = 5;
 * StopTimeEvent.time = 2. SKIPPED = 1.
 */
final class GtfsRtReader {
    /** Una parada de un viaje: su posición en el viaje y la llegada prevista. */
    static final class StopUpdate {
        final int sequence;
        /** Segundos Unix, o -1 si no la trae. */
        final long time;
        final boolean skipped;

        StopUpdate(int sequence, long time, boolean skipped) {
            this.sequence = sequence;
            this.time = time;
            this.skipped = skipped;
        }
    }

    /** Un viaje del feed. */
    static final class TripUpdate {
        String tripId = "";
        String vehicleId = "";
        long timestamp;
        final List<StopUpdate> stops = new ArrayList<>();
    }

    private static final int SKIPPED = 1;

    private final byte[] data;
    private int position;
    private final int end;

    private GtfsRtReader(byte[] data, int start, int end) {
        this.data = data;
        this.position = start;
        this.end = end;
    }

    /** Viajes del FeedMessage; los que no traen trip_id se descartan. */
    static List<TripUpdate> tripUpdates(byte[] feed) throws IOException {
        List<TripUpdate> result = new ArrayList<>();
        GtfsRtReader message = new GtfsRtReader(feed, 0, feed.length);
        while (message.hasMore()) {
            int tag = message.readTag();
            if (field(tag) != 2 || wireType(tag) != 2) {
                message.skip(tag);
                continue;
            }
            GtfsRtReader entity = message.readMessage();
            while (entity.hasMore()) {
                int entityTag = entity.readTag();
                if (field(entityTag) == 3 && wireType(entityTag) == 2) {
                    TripUpdate update = readTripUpdate(entity.readMessage());
                    if (!update.tripId.isEmpty()) result.add(update);
                } else {
                    entity.skip(entityTag);
                }
            }
        }
        return result;
    }

    private static TripUpdate readTripUpdate(GtfsRtReader in) throws IOException {
        TripUpdate update = new TripUpdate();
        while (in.hasMore()) {
            int tag = in.readTag();
            switch (field(tag)) {
                case 1:
                    update.tripId = firstString(in.readMessage());
                    break;
                case 2:
                    update.stops.add(readStop(in.readMessage()));
                    break;
                case 3:
                    update.vehicleId = firstString(in.readMessage());
                    break;
                case 4:
                    update.timestamp = in.readVarint();
                    break;
                default:
                    in.skip(tag);
            }
        }
        return update;
    }

    private static StopUpdate readStop(GtfsRtReader in) throws IOException {
        int sequence = -1;
        long arrival = -1;
        long departure = -1;
        boolean skipped = false;
        while (in.hasMore()) {
            int tag = in.readTag();
            switch (field(tag)) {
                case 1:
                    sequence = (int) in.readVarint();
                    break;
                case 2:
                    arrival = eventTime(in.readMessage());
                    break;
                case 3:
                    departure = eventTime(in.readMessage());
                    break;
                case 5:
                    skipped = in.readVarint() == SKIPPED;
                    break;
                default:
                    in.skip(tag);
            }
        }
        return new StopUpdate(sequence, arrival >= 0 ? arrival : departure, skipped);
    }

    private static long eventTime(GtfsRtReader in) throws IOException {
        long time = -1;
        while (in.hasMore()) {
            int tag = in.readTag();
            if (field(tag) == 2 && wireType(tag) == 0) time = in.readVarint();
            else in.skip(tag);
        }
        return time;
    }

    /** El campo 1 de tipo texto (trip_id del TripDescriptor, id del VehicleDescriptor). */
    private static String firstString(GtfsRtReader in) throws IOException {
        String value = "";
        while (in.hasMore()) {
            int tag = in.readTag();
            if (field(tag) == 1 && wireType(tag) == 2) value = in.readString();
            else in.skip(tag);
        }
        return value;
    }

    private static int field(int tag) {
        return tag >>> 3;
    }

    private static int wireType(int tag) {
        return tag & 7;
    }

    private boolean hasMore() {
        return position < end;
    }

    private int readTag() throws IOException {
        return (int) readVarint();
    }

    private long readVarint() throws IOException {
        long result = 0;
        for (int shift = 0; shift < 64; shift += 7) {
            if (position >= end) throw new IOException("Mensaje cortado");
            byte b = data[position++];
            result |= (long) (b & 0x7F) << shift;
            if ((b & 0x80) == 0) return result;
        }
        throw new IOException("Número mal formado");
    }

    private GtfsRtReader readMessage() throws IOException {
        int length = (int) readVarint();
        if (length < 0 || position + length > end) throw new IOException("Mensaje cortado");
        GtfsRtReader inner = new GtfsRtReader(data, position, position + length);
        position += length;
        return inner;
    }

    private String readString() throws IOException {
        GtfsRtReader inner = readMessage();
        return new String(data, inner.position, inner.end - inner.position, java.nio.charset.StandardCharsets.UTF_8);
    }

    private void skip(int tag) throws IOException {
        switch (wireType(tag)) {
            case 0:
                readVarint();
                break;
            case 1:
                position += 8;
                break;
            case 2:
                readMessage();
                break;
            case 5:
                position += 4;
                break;
            default:
                throw new IOException("Tipo de campo no admitido: " + wireType(tag));
        }
        if (position > end) throw new IOException("Mensaje cortado");
    }
}
