package io.github.deiwix.emtremake.tracker;

import android.content.Context;
import android.content.SharedPreferences;
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

    final String feedUrl;
    final String lineId;
    final int directionId;
    final String[] stopIds;
    /** Minutos desde la salida en cada parada del sentido. */
    final double[] profile;
    final int stopIndex;
    final int minutesBefore;
    String vehicleId;
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
        lineId = json.getString("lineId");
        directionId = json.getInt("directionId");
        JSONArray ids = json.getJSONArray("stopIds");
        stopIds = new String[ids.length()];
        for (int i = 0; i < ids.length(); i++) stopIds[i] = ids.getString(i);
        JSONArray minutes = json.getJSONArray("profile");
        profile = new double[minutes.length()];
        for (int i = 0; i < minutes.length(); i++) profile[i] = minutes.getDouble(i);
        stopIndex = json.getInt("stopIndex");
        minutesBefore = json.getInt("minutesBefore");
        vehicleId = json.isNull("vehicleId") ? null : json.getString("vehicleId");
        expectedAt = json.getLong("expectedAt");
        notifyAt = json.getLong("notifyAt");
        title = json.getString("title");
        body = json.getString("body");
        bodyNow = json.getString("bodyNow");
        trackingTitle = json.getString("trackingTitle");
        trackingText = json.getString("trackingText");
        trackingWaiting = json.getString("trackingWaiting");
        if (stopIds.length != profile.length || stopIndex < 0 || stopIndex >= stopIds.length) {
            throw new JSONException("Aviso con paradas y minutos que no casan");
        }
    }

    static TrackedAlert parse(String text) throws JSONException {
        return new TrackedAlert(new JSONObject(text));
    }

    JSONObject toJson() throws JSONException {
        JSONObject json = new JSONObject();
        json.put("feedUrl", feedUrl);
        json.put("lineId", lineId);
        json.put("directionId", directionId);
        json.put("stopIds", new JSONArray(stopIds));
        JSONArray minutes = new JSONArray();
        for (double m : profile) minutes.put(m);
        json.put("profile", minutes);
        json.put("stopIndex", stopIndex);
        json.put("minutesBefore", minutesBefore);
        json.put("vehicleId", vehicleId == null ? JSONObject.NULL : vehicleId);
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
