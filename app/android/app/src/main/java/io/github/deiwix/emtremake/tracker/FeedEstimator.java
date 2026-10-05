package io.github.deiwix.emtremake.tracker;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Llegada estimada a partir de la fuente del Ayuntamiento, para el servicio
 * nativo. Es la misma regla que la app (core/realtime/realtime.ts): minutos de
 * horario desde la última parada del autobús menos la antigüedad del dato.
 */
final class FeedEstimator {
    private static final ZoneId MADRID = ZoneId.of("Europe/Madrid");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    /** Datos más viejos no sirven (el autobús puede estar en cualquier sitio). */
    private static final long MAX_AGE_MS = 15 * 60_000L;
    /** Un autobús se asocia al aviso si llega a menos de esto de la hora esperada. */
    private static final long MATCH_WINDOW_MS = 10 * 60_000L;

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
    static Estimate estimate(String feed, TrackedAlert alert, long now) throws JSONException {
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
            double remaining = alert.profile[alert.stopIndex] - alert.profile[last];
            long arrivalAt = reportedAt + Math.round(remaining * 60_000);
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
