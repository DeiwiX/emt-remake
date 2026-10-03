import { Line } from '../models/network.model';
import { contrastRatio, hslToHex, toLab } from './color-math';

export interface LineColor {
  /** Color del trazo y del fondo de la insignia. */
  readonly line: string;
  /** Color del número dentro de la insignia (blanco o negro, el de mayor contraste). */
  readonly text: string;
}

export interface PaletteEntry {
  readonly light: LineColor;
  readonly dark: LineColor;
}

/** Fondos de los estilos de OpenFreeMap usados (positron y dark). */
export const MAP_BACKGROUND = { light: '#F2F3F0', dark: '#0C0C0C' } as const;
/** Contraste mínimo del trazo frente al fondo del mapa (WCAG 1.4.11, gráficos). */
export const MIN_LINE_CONTRAST = 3;

/** Candidatos: un tono cada 6° con varias combinaciones de saturación y luminosidad. */
const HUE_STEP = 6;
const TONES: readonly [saturation: number, lightness: number][] = [
  [0.85, 0.45],
  [0.65, 0.3],
  [0.75, 0.6],
  [0.5, 0.45],
  [0.9, 0.38],
  [0.6, 0.52],
];
const LIGHTNESS_STEP = 0.01;

/**
 * Genera una paleta de `count` colores lo más distintos posible entre sí, con
 * variante para el tema claro y el oscuro (decisión del desarrollador del
 * 03/10/2026: un color distinto para cada línea).
 *
 * Método: se crean unos 360 candidatos, se ajusta su luminosidad hasta que el
 * trazo tenga contraste ≥ 3:1 con el fondo de cada tema, y se eligen por
 * "punto más lejano": cada nuevo color es el candidato más diferente (CIE76,
 * peor de los dos temas) de los ya elegidos. Es determinista.
 *
 * Con tantos colores no se puede garantizar que todos se distingan con
 * daltonismo; por eso el número de línea está siempre visible (ver ADR 0004).
 */
export function generateLinePalette(count: number): PaletteEntry[] {
  const candidates = buildCandidates();
  const labs = candidates.map((c) => ({ light: toLab(c.light.line), dark: toLab(c.dark.line) }));
  const distance = (i: number, j: number) =>
    Math.min(
      Math.hypot(...labs[i]!.light.map((v, k) => v - labs[j]!.light[k]!)),
      Math.hypot(...labs[i]!.dark.map((v, k) => v - labs[j]!.dark[k]!)),
    );

  const chosen: number[] = [];
  const nearest = new Array<number>(candidates.length).fill(Infinity);
  let next = 0;
  while (chosen.length < Math.min(count, candidates.length)) {
    chosen.push(next);
    let farthest = -1;
    for (let k = 0; k < candidates.length; k++) {
      nearest[k] = Math.min(nearest[k]!, distance(next, k));
      if (farthest === -1 || nearest[k]! > nearest[farthest]!) farthest = k;
    }
    next = farthest;
  }
  return chosen.map((i) => candidates[i]!);
}

function buildCandidates(): PaletteEntry[] {
  const seen = new Set<string>();
  const result: PaletteEntry[] = [];
  for (let hue = 0; hue < 360; hue += HUE_STEP) {
    for (const [saturation, lightness] of TONES) {
      const entry: PaletteEntry = {
        light: withText(adjust(hue, saturation, lightness, MAP_BACKGROUND.light, -LIGHTNESS_STEP)),
        dark: withText(adjust(hue, saturation, lightness, MAP_BACKGROUND.dark, LIGHTNESS_STEP)),
      };
      const key = entry.light.line + entry.dark.line;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(entry);
      }
    }
  }
  return result;
}

/** Oscurece (paso negativo) o aclara (positivo) hasta alcanzar el contraste mínimo con el fondo. */
function adjust(
  hue: number,
  saturation: number,
  lightness: number,
  background: string,
  step: number,
): string {
  let l = lightness;
  let hex = hslToHex(hue, saturation, l);
  while (contrastRatio(hex, background) < MIN_LINE_CONTRAST && l > 0 && l < 1) {
    l += step;
    hex = hslToHex(hue, saturation, l);
  }
  return hex;
}

/** El número va en blanco o negro, el que más contraste dé (siempre ≥ 4,5:1). */
function withText(line: string): LineColor {
  const text =
    contrastRatio(line, '#FFFFFF') >= contrastRatio(line, '#000000') ? '#FFFFFF' : '#000000';
  return { line, text };
}

/**
 * Asigna a cada línea un color distinto de la paleta. Las líneas que comparten
 * paradas (y por tanto calles) reciben colores lo más diferentes posible entre sí.
 * Reparto voraz y determinista: mismas líneas, mismos colores.
 */
export function assignLineColors(
  lines: readonly Line[],
  palette: readonly PaletteEntry[] = generateLinePalette(lines.length),
): Map<string, PaletteEntry> {
  const stopsByLine = new Map(
    lines.map((l) => [l.id, new Set(l.directions.flatMap((d) => d.stopIds))]),
  );
  const overlaps = new Map(lines.map((l) => [l.id, [] as string[]]));
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i]!.id;
      const b = lines[j]!.id;
      const stopsA = stopsByLine.get(a)!;
      if ([...stopsByLine.get(b)!].some((stop) => stopsA.has(stop))) {
        overlaps.get(a)!.push(b);
        overlaps.get(b)!.push(a);
      }
    }
  }

  const labs = palette.map((p) => toLab(p.light.line));
  const distance = (i: number, j: number) =>
    Math.hypot(...labs[i]!.map((v, k) => v - labs[j]![k]!));

  // Primero las líneas con más solapes: son las más difíciles de colorear.
  const order = [...lines]
    .map((l) => l.id)
    .sort((a, b) => overlaps.get(b)!.length - overlaps.get(a)!.length || a.localeCompare(b));

  const assigned = new Map<string, number>();
  const used = new Set<number>();
  for (const id of order) {
    const neighbourColors = overlaps
      .get(id)!
      .map((other) => assigned.get(other))
      .filter((c): c is number => c !== undefined);
    let best = -1;
    let bestScore = -1;
    for (let c = 0; c < palette.length; c++) {
      if (used.has(c)) continue;
      const score = neighbourColors.length
        ? Math.min(...neighbourColors.map((n) => distance(c, n)))
        : Infinity;
      if (score > bestScore) {
        best = c;
        bestScore = score;
      }
    }
    // Si hubiera más líneas que colores, se reutiliza el más alejado de los vecinos.
    if (best === -1) best = assigned.size % palette.length;
    assigned.set(id, best);
    used.add(best);
  }
  return new Map([...assigned].map(([id, index]) => [id, palette[index]!]));
}
