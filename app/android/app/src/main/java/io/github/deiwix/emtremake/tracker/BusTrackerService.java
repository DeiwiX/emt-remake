package io.github.deiwix.emtremake.tracker;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import io.github.deiwix.emtremake.R;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * "Siguiendo tu bus" (Fase 6): servicio en primer plano que, mientras haya un
 * aviso, consulta la posición de los autobuses cada minuto aunque la app esté
 * cerrada, mueve la hora del aviso si el autobús se adelanta o se retrasa y
 * avisa cuando faltan los minutos elegidos. Muestra una notificación fija con
 * lo que falta. Sin datos, avisa a la hora prevista.
 */
public class BusTrackerService extends Service {
    static final String TRACKING_CHANNEL = "bus-tracking";
    static final String ALERT_CHANNEL = "bus-alerts";
    private static final int TRACKING_ID = 7001;
    private static final int ALERT_ID = 7002;
    private static final long POLL_MS = 60_000;
    /** Pasado este tiempo desde la llegada esperada se deja de seguir. */
    private static final long EXPIRE_MS = 5 * 60_000L;

    private HandlerThread thread;
    private Handler handler;
    private final Runnable tick = this::check;

    static void start(Context context) {
        Intent intent = new Intent(context, BusTrackerService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
        else context.startService(intent);
    }

    static void stop(Context context) {
        context.stopService(new Intent(context, BusTrackerService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannels(this);
        thread = new HandlerThread("bus-tracker");
        thread.start();
        handler = new Handler(thread.getLooper());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        TrackedAlert alert = TrackedAlert.load(this);
        Notification notification = tracking(alert, null);
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
                ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                : 0;
        ServiceCompat.startForeground(this, TRACKING_ID, notification, type);
        if (alert == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        handler.removeCallbacks(tick);
        handler.post(tick);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        thread.quitSafely();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /** Una comprobación: descarga, recalcula, avisa o actualiza la notificación fija. */
    private void check() {
        TrackedAlert alert = TrackedAlert.load(this);
        if (alert == null) {
            stopSelf();
            return;
        }
        long now = System.currentTimeMillis();
        Long minutesLeft = null;
        try {
            FeedEstimator.Estimate estimate = FeedEstimator.estimate(download(alert.feedUrl), alert, now);
            if (estimate != null) {
                alert.vehicleId = estimate.vehicleId;
                alert.expectedAt = estimate.arrivalAt;
                alert.notifyAt = estimate.arrivalAt - alert.minutesBefore * 60_000L;
                alert.save(this);
                minutesLeft = Math.max(0, Math.round((estimate.arrivalAt - now) / 60_000.0));
            }
        } catch (Exception e) {
            // Sin conexión o fuente caída: se sigue con la última hora conocida.
        }
        if (now > alert.expectedAt + EXPIRE_MS) {
            finish();
            return;
        }
        if (now >= alert.notifyAt) {
            long minutes = Math.max(0, Math.round((alert.expectedAt - now) / 60_000.0));
            notifyArrival(alert, minutes);
            finish();
            return;
        }
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.notify(TRACKING_ID, tracking(alert, minutesLeft));
        handler.postDelayed(tick, POLL_MS);
    }

    private void finish() {
        TrackedAlert.clear(this);
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void notifyArrival(TrackedAlert alert, long minutes) {
        String text = minutes == 0 ? alert.bodyNow : alert.body.replace("{minutes}", String.valueOf(minutes));
        Notification notification = new NotificationCompat.Builder(this, ALERT_CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_bus)
                .setContentTitle(alert.title)
                .setContentText(text)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setContentIntent(openApp(this))
                .build();
        getSystemService(NotificationManager.class).notify(ALERT_ID, notification);
    }

    private Notification tracking(TrackedAlert alert, Long minutesLeft) {
        String title = alert == null ? "" : alert.trackingTitle;
        String text = alert == null
                ? ""
                : minutesLeft == null
                        ? alert.trackingWaiting
                        : alert.trackingText.replace("{minutes}", String.valueOf(minutesLeft));
        return new NotificationCompat.Builder(this, TRACKING_CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_bus)
                .setContentTitle(title)
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(openApp(this))
                .build();
    }

    private static PendingIntent openApp(Context context) {
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        return PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_IMMUTABLE);
    }

    static void createChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(
                TRACKING_CHANNEL, context.getString(R.string.tracking_channel), NotificationManager.IMPORTANCE_LOW));
        manager.createNotificationChannel(new NotificationChannel(
                ALERT_CHANNEL, context.getString(R.string.alerts_channel), NotificationManager.IMPORTANCE_HIGH));
    }

    private static String download(String url) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(20_000);
        connection.setReadTimeout(30_000);
        try (InputStream in = connection.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[16_384];
            for (int n; (n = in.read(buffer)) > 0; ) out.write(buffer, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        } finally {
            connection.disconnect();
        }
    }
}
