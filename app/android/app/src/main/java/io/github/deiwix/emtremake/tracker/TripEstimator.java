package io.github.deiwix.emtremake.tracker;

import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Llegada a la parada del aviso según el tiempo real de la EMT (GTFS-RT,
 * 17/10/2026), para el servicio nativo. Es la misma regla que la app
 * (core/realtime/realtime.ts): la llegada prevista de la parada o, si el feed
 * no la trae, la de la parada anterior que sí la trae más los minutos del
 * horario entre las dos.
 */
final class TripEstimator {
    /** "G2606S_F21_072-03_13" -> "G2606S_072-03_13" (la variante no siempre está en el GTFS). */
    private static final Pattern TRIP_ID = Pattern.compile("^([^_]+)_[^_]+_(.+)_(\\d+)$");
    /** Un viaje se asocia al aviso si llega a menos de esto de la hora esperada. */
    private static final long MATCH_WINDOW_MS = 10 * 60_000L;
    /** Mientras el autobús está en la parada aún cuenta. */
    private static final long ARRIVING_GRACE_MS = 30_000L;
    /** Datos más viejos no sirven. */
    private static final long MAX_AGE_MS = 15 * 60_000L;

    /** Viaje elegido y cuándo llegará a la parada del aviso (ms). */
    static final class Estimate {
        final String tripId;
        final long arrivalAt;

        Estimate(String tripId, long arrivalAt) {
            this.tripId = tripId;
            this.arrivalAt = arrivalAt;
        }
    }

    private TripEstimator() {}

    static String tripKey(String tripId) {
        Matcher m = TRIP_ID.matcher(tripId);
        return m.matches() ? m.group(1) + "_" + m.group(2) + "_" + m.group(3) : null;
    }

    /** Lo que se sigue: los recorridos que pasan por la parada y el viaje asociado. */
    static final class Target {
        final int[] sequences;
        final double[][] minutes;
        final Map<String, Integer> trips;
        final String tripId;
        final long expectedAt;

        Target(int[] sequences, double[][] minutes, Map<String, Integer> trips, String tripId, long expectedAt) {
            this.sequences = sequences;
            this.minutes = minutes;
            this.trips = trips;
            this.tripId = tripId;
            this.expectedAt = expectedAt;
        }
    }

    /** null si el viaje del aviso no aparece (o ninguno encaja con la hora esperada). */
    static Estimate estimate(List<GtfsRtReader.TripUpdate> updates, Target alert, long now) {
        Estimate own = null;
        Estimate nearest = null;
        for (GtfsRtReader.TripUpdate update : updates) {
            String key = tripKey(update.tripId);
            Integer pattern = key == null ? null : alert.trips.get(key);
            if (pattern == null) continue;
            if (update.timestamp > 0 && now - update.timestamp * 1000 > MAX_AGE_MS) continue;
            long arrival = arrivalAt(update, alert.sequences[pattern], alert.minutes[pattern]);
            if (arrival < 0 || arrival < now - ARRIVING_GRACE_MS) continue;
            Estimate estimate = new Estimate(update.tripId, Math.max(now, arrival));
            if (update.tripId.equals(alert.tripId)) own = estimate;
            long distance = Math.abs(estimate.arrivalAt - alert.expectedAt);
            if (distance <= MATCH_WINDOW_MS
                    && (nearest == null || distance < Math.abs(nearest.arrivalAt - alert.expectedAt))) {
                nearest = estimate;
            }
        }
        return own != null ? own : nearest;
    }

    /**
     * Llegada (ms) a la parada en la posición `sequence` del viaje, o -1 si no
     * para allí, ya ha pasado o no se sabe.
     */
    static long arrivalAt(GtfsRtReader.TripUpdate update, int sequence, double[] minutes) {
        GtfsRtReader.StopUpdate anchor = null;
        for (GtfsRtReader.StopUpdate stop : update.stops) {
            if (stop.sequence == sequence) {
                if (stop.skipped) return -1;
                if (stop.time > 0) return stop.time * 1000;
            }
            if (stop.sequence < sequence
                    && stop.time > 0
                    && (anchor == null || stop.sequence > anchor.sequence)) {
                anchor = stop;
            }
        }
        if (anchor == null || sequence > minutes.length || anchor.sequence > minutes.length) return -1;
        double extra = minutes[sequence - 1] - minutes[anchor.sequence - 1];
        return anchor.time * 1000 + Math.round(extra * 60_000);
    }
}
