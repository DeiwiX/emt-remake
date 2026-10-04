import { alertOptions, createAlert, parseAlert, updateAlert } from './arrival-alert';

const MIN = 60_000;
const NOW = Date.UTC(2026, 9, 4, 20, 0);
const target = { stopId: 'c', lineId: '1', directionId: 1, vehicleId: null };

describe('arrival-alert', () => {
  it('programa el aviso X minutos antes del paso elegido (también mañana)', () => {
    const tomorrow = NOW + 11 * 60 * MIN;
    const alert = createAlert({ ...target, at: tomorrow }, 10);
    expect(alert.notifyAt).toBe(tomorrow - 10 * MIN);
    expect(updateAlert(alert, null, NOW)).toEqual({ kind: 'keep' });
  });

  it('solo ofrece antelaciones que dejan el aviso en el futuro', () => {
    expect(alertOptions(NOW + 12 * MIN, NOW)).toEqual([2, 5, 10]);
    expect(alertOptions(NOW + 2 * MIN, NOW)).toEqual([]);
  });

  it('asocia el autobús en tiempo real más cercano a la hora y mueve el aviso', () => {
    const alert = createAlert({ ...target, at: NOW + 20 * MIN }, 5);
    const update = updateAlert(
      alert,
      [
        { vehicleId: 'lejos', at: NOW + 45 * MIN },
        { vehicleId: 'tarde', at: NOW + 26 * MIN },
      ],
      NOW,
    );
    expect(update).toEqual({
      kind: 'schedule',
      alert: { ...alert, vehicleId: 'tarde', expectedAt: NOW + 26 * MIN, notifyAt: NOW + 21 * MIN },
    });
  });

  it('sigue a su autobús aunque se aleje de la hora del horario', () => {
    const alert = { ...createAlert({ ...target, at: NOW + 20 * MIN }, 5), vehicleId: 'b' };
    const update = updateAlert(alert, [{ vehicleId: 'b', at: NOW + 40 * MIN }], NOW);
    expect(update.kind === 'schedule' && update.alert.notifyAt).toBe(NOW + 35 * MIN);
  });

  it('avisa ya si el autobús se adelanta y el aviso programado aún no ha saltado', () => {
    // Aviso a las +5 min (10 antes de las +15), pero el autobús llega ya a las +8.
    const alert = createAlert({ ...target, at: NOW + 15 * MIN }, 10);
    const update = updateAlert(alert, [{ vehicleId: 'b', at: NOW + 8 * MIN }], NOW);
    expect(update.kind).toBe('notify-now');
  });

  it('no repite el aviso que ya dio el sistema y termina cuando el paso queda atrás', () => {
    const alert = createAlert({ ...target, at: NOW + 3 * MIN }, 5);
    expect(updateAlert(alert, null, NOW)).toEqual({ kind: 'done' });
    const old = createAlert({ ...target, at: NOW - 10 * MIN }, 5);
    expect(updateAlert(old, null, NOW)).toEqual({ kind: 'done' });
  });

  it('lee el aviso guardado y descarta datos inválidos', () => {
    const alert = createAlert({ ...target, at: NOW }, 5);
    expect(parseAlert(JSON.stringify(alert))).toEqual(alert);
    expect(parseAlert('{"stopId":1}')).toBeNull();
    expect(parseAlert('no es json')).toBeNull();
    expect(parseAlert(null)).toBeNull();
  });
});
