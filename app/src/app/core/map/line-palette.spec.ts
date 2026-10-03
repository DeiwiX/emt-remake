import { Line } from '../models/network.model';
import { LINE_PALETTE, assignLineColors } from './line-palette';
import { ColorVisionDeficiency, contrastRatio, deltaE, simulateCvd } from './testing/color-math';

/** Fondos de los estilos de OpenFreeMap usados (positron y dark). */
const MAP_BACKGROUND = { light: '#F2F3F0', dark: '#0C0C0C' } as const;
const THEMES = ['light', 'dark'] as const;
const DEFICIENCIES: ColorVisionDeficiency[] = ['protanopia', 'deuteranopia', 'tritanopia'];
/** Diferencia mínima exigida entre dos colores de la paleta (CIE76). */
const MIN_DELTA_E = 7;

describe('Paleta de líneas', () => {
  for (const theme of THEMES) {
    describe(`tema ${theme}`, () => {
      const colors = LINE_PALETTE.map((entry) => entry[theme]);

      it('el número de la insignia tiene contraste ≥ 4,5:1 (WCAG AA texto)', () => {
        for (const { line, text } of colors) {
          expect(contrastRatio(line, text), `${text} sobre ${line}`).toBeGreaterThanOrEqual(4.5);
        }
      });

      it('el trazo tiene contraste ≥ 3:1 con el fondo del mapa (WCAG AA gráficos)', () => {
        for (const { line } of colors) {
          expect(contrastRatio(line, MAP_BACKGROUND[theme]), line).toBeGreaterThanOrEqual(3);
        }
      });

      it('los colores se distinguen entre sí con visión normal y con daltonismo', () => {
        const views: [string, string[]][] = [
          ['normal', colors.map((c) => c.line)],
          ...DEFICIENCIES.map((d): [string, string[]] => [
            d,
            colors.map((c) => simulateCvd(c.line, d)),
          ]),
        ];
        for (const [view, simulated] of views) {
          for (let i = 0; i < simulated.length; i++) {
            for (let j = i + 1; j < simulated.length; j++) {
              const difference = deltaE(simulated[i]!, simulated[j]!);
              expect(
                difference,
                `${view}: ${colors[i]!.line} frente a ${colors[j]!.line}`,
              ).toBeGreaterThanOrEqual(MIN_DELTA_E);
            }
          }
        }
      });
    });
  }
});

describe('assignLineColors', () => {
  const line = (id: string, stopIds: string[]): Line => ({
    id,
    name: id,
    notes: '',
    directions: [{ id: 1, headsign: '', stopIds, shapeId: id, shapeQuality: 'official' }],
  });

  it('da colores distintos a líneas que comparten paradas', () => {
    const colors = assignLineColors(
      [line('1', ['a', 'b']), line('2', ['b', 'c']), line('3', ['c', 'a'])],
      3,
    );
    expect(new Set(colors.values()).size).toBe(3);
  });

  it('es determinista', () => {
    const lines = [line('1', ['a']), line('2', ['a']), line('3', ['b'])];
    expect(Object.fromEntries(assignLineColors(lines))).toEqual(
      Object.fromEntries(assignLineColors([...lines].reverse())),
    );
  });

  it('reparte los colores cuando no hay solapes', () => {
    const colors = assignLineColors([line('1', ['a']), line('2', ['b']), line('3', ['c'])], 3);
    expect(new Set(colors.values()).size).toBe(3);
  });
});
