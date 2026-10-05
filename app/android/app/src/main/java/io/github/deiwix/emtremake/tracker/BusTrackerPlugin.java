package io.github.deiwix.emtremake.tracker;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Puente con la app: `start` guarda el aviso y empieza (o programa) el
 * seguimiento; `stop` lo anula. Ver BusTrackerService.
 */
@CapacitorPlugin(name = "BusTracker")
public class BusTrackerPlugin extends Plugin {
    @PluginMethod
    public void start(PluginCall call) {
        JSObject data = call.getObject("alert");
        if (data == null) {
            call.reject("Falta el aviso");
            return;
        }
        try {
            TrackedAlert alert = TrackedAlert.parse(data.toString());
            alert.save(getContext());
            BusTrackerService.createChannels(getContext());
            TrackerAlarmReceiver.schedule(getContext(), alert);
            call.resolve();
        } catch (Exception e) {
            call.reject("Aviso no válido: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        TrackedAlert.clear(getContext());
        TrackerAlarmReceiver.cancel(getContext());
        BusTrackerService.stop(getContext());
        call.resolve();
    }
}
