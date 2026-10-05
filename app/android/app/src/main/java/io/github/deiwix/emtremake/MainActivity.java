package io.github.deiwix.emtremake;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import io.github.deiwix.emtremake.tracker.BusTrackerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin propio: seguimiento del autobús con la app cerrada (Fase 6).
        registerPlugin(BusTrackerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
