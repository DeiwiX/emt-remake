import { swipeDirection, swipeTarget } from './swipe';

describe('Deslizar entre pantallas', () => {
  const tabs = ['/', '/map', '/plan', '/favorites'];

  it('un gesto rápido y horizontal cuenta; uno vertical, corto o lento, no', () => {
    expect(swipeDirection({ dx: -120, dy: 10, ms: 200 })).toBe(1);
    expect(swipeDirection({ dx: 120, dy: -20, ms: 200 })).toBe(-1);
    expect(swipeDirection({ dx: -40, dy: 0, ms: 200 })).toBe(0);
    expect(swipeDirection({ dx: -120, dy: 100, ms: 200 })).toBe(0);
    expect(swipeDirection({ dx: -120, dy: 0, ms: 900 })).toBe(0);
  });

  it('lleva a la pantalla siguiente o anterior de la barra, sin pasarse', () => {
    expect(swipeTarget('/', tabs, 1)).toBe('/map');
    expect(swipeTarget('/plan?from=stop:1', tabs, -1)).toBe('/map');
    expect(swipeTarget('/favorites', tabs, 1)).toBeNull();
    expect(swipeTarget('/', tabs, -1)).toBeNull();
    // Fuera de la barra (p. ej. el detalle de una parada) no hace nada.
    expect(swipeTarget('/stops/322', tabs, 1)).toBeNull();
  });
});
