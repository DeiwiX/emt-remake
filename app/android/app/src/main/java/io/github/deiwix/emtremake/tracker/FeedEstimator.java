package io.github.deiwix.emtremake.tracker;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Llegada estimada a partir de la fuente del Ayuntamiento, para el servicio
 * nativo. Es la misma regla que la app (core/realtime/live-estimate.ts):
 * minutos del viaje del horario (la app envía el perfil del viaje elegido)
 * desde la última parada del autobús, divididos por su ritmo, menos la
 * antigüedad del dato. El ritmo se mide con dos datos seguidos del mismo
 * autobús (optimización 2, 16/10/2026).
 */
final class FeedEstimator {
    private static final ZoneId MADRID = ZoneId.of("Europe/Madrid");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    /** Datos más viejos no sirven (el autobús puede estar en cualquier sitio). */
    private static final long MAX_AGE_MS = 15 * 60_000L;
    /** Un autobús se asocia al aviso si llega a menos de esto de la hora esperada. */
    private static final long MATCH_WINDOW_MS = 10 * 60_000L;
    /** Para medir el ritmo, los dos datos deben estar separados al menos esto. */
    private static final double MIN_PACE_INTERVAL_MINUTES = 2;
    /** El ritmo medido se mezcla con el del horario y se acota (un semáforo no es un atasco). */
    private static final double PACE_WEIGHT = 0.5;
    private static final double MIN_PACE = 0.6;
    private static final double MAX_PACE = 1.4;

    /** Último dato distinto de un autobús: en qué parada iba y cuándo. */
    static final class Report {
        final int stopIndex;
        final long reportedAt;

        Report(int stopIndex, long reportedAt) {
            this.stopIndex = stopIndex;
            this.reportedAt = reportedAt;
        }
    }

    /** Dato actual y anterior de cada autobús, mientras dura el seguimiento. */
    static final class History {
        private final Map<String, Report> latest = new HashMap<>();
        private final Map<String, Report> previous = new HashMap<>();

        /** Guarda el dato y devuelve el anterior distinto (o null). */
        Report record(String bus, Report report) {
            Report current = latest.get(bus);
            if (current != null && current.reportedAt != report.reportedAt) {
                previous.put(bus, current);
            }
            latest.put(bus, report);
            return previous.get(bus);
        }
    }

    /** Autobús elegido y cuándo llegará a la parada del aviso. */
    static final class Estimate {
        final String vehicleId;
        final long arrivalAt;

        Estimate(String vehicleId, long arrivalAt) {
            this.vehicleId = vehicleId;
            this.arrivalAt = arrivalAt;
        }
    }

    private FeedEstimator() {}

    /** null si el autobús del aviso no aparece (o ninguno encaja con la hora esperada). */
    static Estimate estimate(String feed, TrackedAlert alert, long now, History history)
            throws JSONException {
        JSONArray items = new JSONArray(feed);
        Estimate own = null;
        Estimate nearest = null;
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            JSONObject p = item.optJSONObject("properties");
            if (p == null) p = item;
            String line = p.optString("codLinea", item.optString("codLinea", "")).replaceAll("\\.0+$", "");
            if (!alert.lineId.equals(line)) continue;
            if (p.optInt("sentido", item.optInt("sentido", -1)) != alert.directionId) continue;
            String lastStop = p.optString("codParIni", item.optString("codParIni", "")).trim();
            String bus = p.optString("codBus", item.optString("codBus", "")).trim();
            long reportedAt = parseTime(p.optString("last_update", ""));
            if (bus.isEmpty() || reportedAt < 0) continue;
            long age = now - reportedAt;
            if (age < -60_000 || age > MAX_AGE_MS) continue;
            int last = lastIndexBefore(alert.stopIds, lastStop, alert.stopIndex);
            if (last < 0) continue;
            Report previous = history.record(bus, new Report(last, reportedAt));
            double pace = previous == null
                    ? 1
                    : pace(alert.profile, previous.stopIndex, previous.reportedAt, last, reportedAt);
            double remaining = alert.profile[alert.stopIndex] - alert.profile[last];
            long arrivalAt = reportedAt + Math.round(remaining / pace * 60_000);
            Estimate estimate = new Estimate(bus, Math.max(now, arrivalAt));
            if (bus.equals(alert.vehicleId)) own = estimate;
            long distance = Math.abs(estimate.arrivalAt - alert.expectedAt);
            if (distance <= MATCH_WINDOW_MS
                    && (nearest == null || distance < Math.abs(nearest.arrivalAt - alert.expectedAt))) {
                nearest = estimate;
            }
        }
        return own != null ? own : nearest;
    }

    /**
     * Ritmo frente al horario entre dos datos del mismo autobús: 1 = como el
     * horario, 0,8 = un 20 % más lento. Igual que vehicleProgress en la app.
     */
    static double pace(double[] profile, int fromIndex, long fromAt, int toIndex, long toAt) {
        double elapsed = (toAt - fromAt) / 60_000.0;
        if (elapsed < MIN_PACE_INTERVAL_MINUTES || fromIndex > toIndex) return 1;
        double scheduled = profile[toIndex] - profile[fromIndex];
        double measured = scheduled / elapsed;
        double blended = 1 - PACE_WEIGHT + PACE_WEIGHT * measured;
        return Math.min(MAX_PACE, Math.max(MIN_PACE, blended));
    }

    private static int lastIndexBefore(String[] stopIds, String stopId, int before) {
        for (int i = before - 1; i >= 0; i--) if (stopIds[i].equals(stopId)) return i;
        return -1;
    }

    private static long parseTime(String text) {
        try {
            String clean = text.trim().replace('T', ' ');
            if (clean.length() < 19) return -1;
            return LocalDateTime.parse(clean.substring(0, 19), TIME).atZone(MADRID).toInstant().toEpochMilli();
        } catch (RuntimeException e) {
            return -1;
        }
    }
}
