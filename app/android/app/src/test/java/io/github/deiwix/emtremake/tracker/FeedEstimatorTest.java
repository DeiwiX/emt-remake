package io.github.deiwix.emtremake.tracker;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class FeedEstimatorTest {
    private static final double[] PROFILE = {0, 2, 4, 6, 8, 10};
    private static final long MINUTE = 60_000L;

    @Test
    public void paceEsUnoSiVaComoElHorario() {
        assertEquals(1, FeedEstimator.pace(PROFILE, 1, 0, 3, 4 * MINUTE), 1e-9);
    }

    @Test
    public void paceMideQueVaLentoYSeMezclaYAcota() {
        // 4 min de horario en 8 min reales: medido 0,5, mezclado 0,75.
        assertEquals(0.75, FeedEstimator.pace(PROFILE, 1, 0, 3, 8 * MINUTE), 1e-9);
        // Parado mucho tiempo: no baja de 0,6.
        assertEquals(0.6, FeedEstimator.pace(PROFILE, 1, 0, 2, 20 * MINUTE), 1e-9);
        // Muy rápido: no pasa de 1,4.
        assertEquals(1.4, FeedEstimator.pace(PROFILE, 0, 0, 5, 2 * MINUTE), 1e-9);
    }

    @Test
    public void paceNoMideConDatosMuySeguidos() {
        assertEquals(1, FeedEstimator.pace(PROFILE, 1, 0, 2, MINUTE), 1e-9);
    }

    @Test
    public void historyDevuelveElDatoAnteriorDistinto() {
        FeedEstimator.History history = new FeedEstimator.History();
        FeedEstimator.Report first = new FeedEstimator.Report(1, 0);
        assertNull(history.record("bus", first));
        // La fuente repite el mismo dato durante unos minutos: no cuenta como anterior.
        assertNull(history.record("bus", new FeedEstimator.Report(1, 0)));
        FeedEstimator.Report previous = history.record("bus", new FeedEstimator.Report(3, 5 * MINUTE));
        assertEquals(first.stopIndex, previous.stopIndex);
        assertEquals(first.reportedAt, previous.reportedAt);
    }
}
