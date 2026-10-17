import { TypicalDelays, typicalDelay } from './typical-delay';

const typical: TypicalDelays = {
  stopsPerBucket: 5,
  delays: {
    // Viernes y demás laborables, línea 3 sentido 1: a las 8 va 3 min tarde en el
    // segundo tramo (paradas 5–9); a las 23, medio minuto (no cuenta).
    '3|1|L': [...Array(8).fill([]), [0, 3], ...Array(14).fill([]), [0.4]],
    '3|1|S': [...Array(1).fill([]), [6]],
  },
};

describe('Retraso habitual (Fase 10)', () => {
  it('busca por línea, sentido, tipo de día, hora y tramo de paradas', () => {
    // Viernes 16/10/2026 a las 8:20, parada 7.
    expect(typicalDelay(typical, '3', 1, 7, '20261016', 8 * 60 + 20)).toBe(3);
    expect(typicalDelay(typical, '3', 1, 2, '20261016', 8 * 60 + 20)).toBe(0);
    expect(typicalDelay(typical, '3', 2, 7, '20261016', 8 * 60 + 20)).toBe(0);
  });

  it('un paso de después de medianoche usa el día siguiente (sábado)', () => {
    expect(typicalDelay(typical, '3', 1, 0, '20261016', 1440 + 60 + 5)).toBe(6);
  });

  it('menos de 1 min o sin datos no corrige nada', () => {
    expect(typicalDelay(typical, '3', 1, 0, '20261016', 23 * 60)).toBe(0);
    expect(typicalDelay(null, '3', 1, 7, '20261016', 8 * 60)).toBe(0);
  });
});
