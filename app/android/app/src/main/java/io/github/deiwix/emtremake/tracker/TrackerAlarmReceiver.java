package io.github.deiwix.emtremake.tracker;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Arranca el seguimiento a su hora: un aviso para mañana no tiene a la app
 * siguiendo el autobús toda la noche, solo desde un rato antes.
 */
public class TrackerAlarmReceiver extends BroadcastReceiver {
    /** El seguimiento empieza esto antes de la llegada esperada. */
    static final long LEAD_MS = 45 * 60_000L;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (TrackedAlert.load(context) != null) BusTrackerService.start(context);
    }

    /** Sigue ya si la llegada está cerca; si no, programa el arranque. */
    static void schedule(Context context, TrackedAlert alert) {
        long startAt = Math.min(alert.notifyAt, alert.expectedAt - LEAD_MS);
        cancel(context);
        if (startAt <= System.currentTimeMillis()) {
            BusTrackerService.start(context);
            return;
        }
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, startAt, pending(context));
    }

    static void cancel(Context context) {
        context.getSystemService(AlarmManager.class).cancel(pending(context));
    }

    private static PendingIntent pending(Context context) {
        Intent intent = new Intent(context, TrackerAlarmReceiver.class);
        return PendingIntent.getBroadcast(
                context, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
