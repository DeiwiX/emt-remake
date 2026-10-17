package io.github.deiwix.emtremake.tracker;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Aviso de llegada que sigue el servicio nativo (Fase 6, "Siguiendo tu bus").
 * Lo envía la app (ArrivalAlertService) y se guarda para sobrevivir a que la
 * app se cierre. Las horas son instantes en milisegundos.
 */
final class TrackedAlert {
    private static final String PREFS = "bus-tracker";
    private static final String KEY = "alert";

    /** TripUpdates del tiempo real de la EMT (GTFS-RT). */
    final String feedUrl;
    /**
     * Recorridos del sentido que pasan por la parada: posición de la parada en
     * cada uno (stop_sequence) y minutos desde la salida en cada parada.
     */
    final int[] sequences;
    final double[][] minutes;
    /** Viajes ("horario_bloque_número") -> su recorrido (índice en sequences/minutes). */
    final Map<String, Integer> trips;
    final int minutesBefore;
    /** Viaje asociado al aviso (trip_id de la EMT), cuando se conoce. */
    String tripId;
    long expectedAt;
    long notifyAt;
    /** Textos ya traducidos por la app; "{minutes}" se sustituye. */
    final String title;
    final String body;
    final String bodyNow;
    final String trackingTitle;
    final String trackingText;
    final String trackingWaiting;

    private TrackedAlert(JSONObject json) throws JSONException {
        feedUrl = json.getString("feedUrl");
        JSONArray patterns = json.getJSONArray("patterns");
        sequences = new int[patterns.length()];
        minutes = new double[patterns.length()][];
        for (int p = 0; p < patterns.length(); p++) {
            JSONObject pattern = patterns.getJSONObject(p);
            sequences[p] = pattern.getInt("sequence");
            JSONArray list = pattern.getJSONArray("minutes");
            minutes[p] = new double[list.length()];
            for (int i = 0; i < list.length(); i++) minutes[p][i] = list.getDouble(i);
            if (sequences[p] < 1 || sequences[p] > minutes[p].length) {
                throw new JSONException("Recorrido con la parada fuera de sus minutos");
            }
        }
        trips = new HashMap<>();
        JSONObject tripsJson = json.getJSONObject("trips");
        for (Iterator<String> keys = tripsJson.keys(); keys.hasNext(); ) {
            String key = keys.next();
            int pattern = tripsJson.getInt(key);
            if (pattern < 0 || pattern >= sequences.length) throw new JSONException("Viaje sin recorrido");
            trips.put(key, pattern);
        }
        minutesBefore = json.getInt("minutesBefore");
        tripId = json.isNull("tripId") ? null : json.getString("tripId");
        expectedAt = json.getLong("expectedAt");
        notifyAt = json.getLong("notifyAt");
        title = json.getString("title");
        body = json.getString("body");
        bodyNow = json.getString("bodyNow");
        trackingTitle = json.getString("trackingTitle");
        trackingText = json.getString("trackingText");
        trackingWaiting = json.getString("trackingWaiting");
    }

    TripEstimator.Target target() {
        return new TripEstimator.Target(sequences, minutes, trips, tripId, expectedAt);
    }

    static TrackedAlert parse(String text) throws JSONException {
        return new TrackedAlert(new JSONObject(text));
    }

    JSONObject toJson() throws JSONException {
        JSONObject json = new JSONObject();
        json.put("feedUrl", feedUrl);
        JSONArray patterns = new JSONArray();
        for (int p = 0; p < sequences.length; p++) {
            JSONArray list = new JSONArray();
            for (double m : minutes[p]) list.put(m);
            patterns.put(new JSONObject().put("sequence", sequences[p]).put("minutes", list));
        }
        json.put("patterns", patterns);
        json.put("trips", new JSONObject(trips));
        json.put("minutesBefore", minutesBefore);
        json.put("tripId", tripId == null ? JSONObject.NULL : tripId);
        json.put("expectedAt", expectedAt);
        json.put("notifyAt", notifyAt);
        json.put("title", title);
        json.put("body", body);
        json.put("bodyNow", bodyNow);
        json.put("trackingTitle", trackingTitle);
        json.put("trackingText", trackingText);
        json.put("trackingWaiting", trackingWaiting);
        return json;
    }

    static TrackedAlert load(Context context) {
        String text = prefs(context).getString(KEY, null);
        if (text == null) return null;
        try {
            return parse(text);
        } catch (JSONException e) {
            clear(context);
            return null;
        }
    }

    void save(Context context) {
        try {
            prefs(context).edit().putString(KEY, toJson().toString()).apply();
        } catch (JSONException ignored) {
            // No se puede llegar aquí con un aviso ya leído.
        }
    }

    static void clear(Context context) {
        prefs(context).edit().remove(KEY).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
