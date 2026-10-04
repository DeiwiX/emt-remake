import { alertOptions, decideAlert } from './arrival-alert';

describe('arrival-alert', () => {
  it('avisa ya si faltan los minutos pedidos o menos', () => {
    expect(decideAlert(5, 5)).toEqual({ kind: 'now', eta: 5 });
    expect(decideAlert(5, 2)).toEqual({ kind: 'now', eta: 2 });
  });

  it('programa el aviso para cuando falten los minutos pedidos', () => {
    expect(decideAlert(5, 12)).toEqual({ kind: 'later', inMinutes: 7 });
  });

  it('da el aviso por perdido si el autobús ya no viene', () => {
    expect(decideAlert(5, null)).toEqual({ kind: 'lost' });
  });

  it('solo ofrece minutos menores que lo que falta', () => {
    expect(alertOptions(12)).toEqual([2, 5, 10]);
    expect(alertOptions(2)).toEqual([]);
  });
});
