import { Line } from '../models/network.model';
import { contrastRatio, deltaE } from './color-math';
import {
  MAP_BACKGROUND,
  MIN_LINE_CONTRAST,
  assignLineColors,
  generateLinePalette,
} from './line-palette';

const THEMES = ['light', 'dark'] as const;
/** La red tiene 49 líneas; se valida con margen por si se añaden más. */
const LINE_COUNT = 60;
/** Diferencia mínima entre dos colores cualesquiera (CIE76; ~10 se distingue con claridad). */
const MIN_DELTA_E = 10;

describe('Paleta de líneas generada', () => {
  const palette = generateLinePalette(LINE_COUNT);

  it('genera tantos colores como líneas, todos distintos', () => {
    expect(palette).toHaveLength(LINE_COUNT);
    for (const theme of THEMES) {
      expect(new Set(palette.map((p) => p[theme].line)).size).toBe(LINE_COUNT);
    }
  });

  it('es determinista', () => {
    expect(generateLinePalette(LINE_COUNT)).toEqual(palette);
  });

  for (const theme of THEMES) {
    describe(`tema ${theme}`, () => {
      const colors = palette.map((p) => p[theme]);

      it('el número de la insignia tiene contraste ≥ 4,5:1 (WCAG AA texto)', () => {
        for (const { line, text } of colors) {
          expect(contrastRatio(line, text), `${text} sobre ${line}`).toBeGreaterThanOrEqual(4.5);
        }
      });

      it('el trazo tiene contraste ≥ 3:1 con el fondo del mapa (WCAG AA gráficos)', () => {
        for (const { line } of colors) {
          expect(contrastRatio(line, MAP_BACKGROUND[theme]), line).toBeGreaterThanOrEqual(
            MIN_LINE_CONTRAST,
          );
        }
      });

      it('todos los colores se distinguen entre sí con visión normal', () => {
        for (let i = 0; i < colors.length; i++) {
          for (let j = i + 1; j < colors.length; j++) {
            const difference = deltaE(colors[i]!.line, colors[j]!.line);
            expect(
              difference,
              `${colors[i]!.line} frente a ${colors[j]!.line}`,
            ).toBeGreaterThanOrEqual(MIN_DELTA_E);
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

  it('da un color distinto a cada línea', () => {
    const lines = Array.from({ length: 49 }, (_, i) => line(String(i + 1), [`s${i}`, `s${i + 1}`]));
    const colors = assignLineColors(lines);
    expect(new Set([...colors.values()].map((c) => c.light.line)).size).toBe(49);
  });

  it('es determinista aunque cambie el orden de las líneas', () => {
    const lines = [line('1', ['a']), line('2', ['a']), line('3', ['b'])];
    const pick = (map: ReturnType<typeof assignLineColors>) =>
      Object.fromEntries([...map].map(([id, c]) => [id, c.light.line]));
    expect(pick(assignLineColors(lines))).toEqual(pick(assignLineColors([...lines].reverse())));
  });

  it('aleja los colores de las líneas que comparten paradas', () => {
    const lines = [line('1', ['a']), line('2', ['a']), line('3', ['z'])];
    const colors = assignLineColors(lines);
    const difference = deltaE(colors.get('1')!.light.line, colors.get('2')!.light.line);
    expect(difference).toBeGreaterThanOrEqual(MIN_DELTA_E);
  });
});
