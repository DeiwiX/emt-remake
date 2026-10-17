package io.github.deiwix.emtremake.tracker;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

public class TripEstimatorTest {
    private static final long T0 = 1_792_000_000L;

    // --- Protobuf mínimo para escribir mensajes de prueba ---

    private static void varint(ByteArrayOutputStream out, long value) {
        while ((value & ~0x7FL) != 0) {
            out.write((int) ((value & 0x7F) | 0x80));
            value >>>= 7;
        }
        out.write((int) value);
    }

    private static byte[] field(int number, long value) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        varint(out, (long) number << 3);
        varint(out, value);
        return out.toByteArray();
    }

    private static byte[] field(int number, byte[]... parts) {
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        for (byte[] part : parts) body.write(part, 0, part.length);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        varint(out, ((long) number << 3) | 2);
        varint(out, body.size());
        out.write(body.toByteArray(), 0, body.size());
        return out.toByteArray();
    }

    private static byte[] text(int number, String value) {
        return field(number, value.getBytes(StandardCharsets.UTF_8));
    }

    private static byte[] stop(int sequence, long time, boolean skipped) {
        return field(2, field(1, sequence), field(2, field(2, time)), skipped ? field(5, 1) : new byte[0]);
    }

    /** FeedMessage con un TripUpdate, como los de la EMT. */
    private static byte[] feed(String tripId, String vehicle, byte[]... stops) {
        byte[][] parts = new byte[stops.length + 3][];
        parts[0] = field(1, text(1, tripId));
        parts[1] = field(3, text(1, vehicle));
        parts[2] = field(4, T0);
        System.arraycopy(stops, 0, parts, 3, stops.length);
        byte[] entity = field(2, text(1, "trip_update_1"), field(3, parts));
        // Cabecera (campo 1) que el lector debe saltar.
        return concat(field(1, text(1, "1.0")), entity);
    }

    private static byte[] concat(byte[] a, byte[] b) {
        byte[] result = new byte[a.length + b.length];
        System.arraycopy(a, 0, result, 0, a.length);
        System.arraycopy(b, 0, result, a.length, b.length);
        return result;
    }

    /** Aviso en la tercera parada (minuto 10) del recorrido a → b → c → d. */
    private static TripEstimator.Target alert(String tripId, long expectedAt) {
        return new TripEstimator.Target(
                new int[] {3},
                new double[][] {{0, 4, 10, 15}},
                Collections.singletonMap("G1L_001-01_1", 0),
                tripId,
                expectedAt);
    }

    @Test
    public void leeElViajeDelFeed() throws Exception {
        List<GtfsRtReader.TripUpdate> updates =
                GtfsRtReader.tripUpdates(feed("G1L_F1_001-01_1", "640", stop(2, T0 + 240, false), stop(3, T0 + 600, true)));
        assertEquals(1, updates.size());
        GtfsRtReader.TripUpdate update = updates.get(0);
        assertEquals("G1L_F1_001-01_1", update.tripId);
        assertEquals("640", update.vehicleId);
        assertEquals(T0, update.timestamp);
        assertEquals(2, update.stops.size());
        assertEquals(true, update.stops.get(1).skipped);
    }

    @Test
    public void sinDatoEnLaParadaUsaLaAnteriorMasElHorario() throws Exception {
        List<GtfsRtReader.TripUpdate> updates =
                GtfsRtReader.tripUpdates(feed("G1L_F21_001-01_1", "640", stop(2, T0 + 240, false)));
        long now = T0 * 1000;
        TripEstimator.Estimate estimate = TripEstimator.estimate(updates, alert(null, now + 600_000), now);
        // b a los 4 min y c 6 min después.
        assertEquals("G1L_F21_001-01_1", estimate.tripId);
        assertEquals(now + 600_000, estimate.arrivalAt);
    }

    @Test
    public void noCuentaSiLaParadaNoSeHaceOElViajeNoEsDelAviso() throws Exception {
        long now = T0 * 1000;
        List<GtfsRtReader.TripUpdate> skipped =
                GtfsRtReader.tripUpdates(feed("G1L_F1_001-01_1", "640", stop(3, T0 + 600, true)));
        assertNull(TripEstimator.estimate(skipped, alert(null, now + 600_000), now));
        List<GtfsRtReader.TripUpdate> other =
                GtfsRtReader.tripUpdates(feed("G1L_F1_001-02_1", "640", stop(3, T0 + 600, false)));
        assertNull(TripEstimator.estimate(other, alert(null, now + 600_000), now));
    }

    @Test
    public void sinViajeAsociadoSoloLoTomaSiLlegaCercaDeLaHoraEsperada() throws Exception {
        long now = T0 * 1000;
        List<GtfsRtReader.TripUpdate> updates =
                GtfsRtReader.tripUpdates(feed("G1L_F1_001-01_1", "640", stop(3, T0 + 1800, false)));
        assertNull(TripEstimator.estimate(updates, alert(null, now + 600_000), now));
        // Con su viaje asociado, se sigue aunque se haya retrasado mucho.
        assertEquals(now + 1_800_000, TripEstimator.estimate(updates, alert("G1L_F1_001-01_1", now + 600_000), now).arrivalAt);
    }
}
