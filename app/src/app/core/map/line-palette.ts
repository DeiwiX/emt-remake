import { Line } from '../models/network.model';

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

/**
 * Paleta propia de 7 colores, basada en Okabe-Ito y Paul Tol y ajustada en
 * luminosidad para cada tema. Validada (ver line-palette.spec.ts):
 * - trazo ≥ 3:1 frente al fondo del mapa base claro (#F2F3F0) y oscuro (#0C0C0C);
 * - número de la insignia ≥ 4,5:1 frente a su fondo;
 * - colores distinguibles entre sí también con protanopía, deuteranopía y tritanopía.
 *
 * Con 49 líneas los colores se repiten: el número de línea, siempre visible,
 * es lo que identifica una línea; el color solo ayuda a distinguir recorridos.
 */
export const LINE_PALETTE: readonly PaletteEntry[] = [
  // Bermellón
  { light: { line: '#D55E00', text: '#000000' }, dark: { line: '#D55E00', text: '#000000' } },
  // Verde azulado
  { light: { line: '#00996F', text: '#000000' }, dark: { line: '#009E73', text: '#000000' } },
  // Azul cielo
  { light: { line: '#1B8DCE', text: '#000000' }, dark: { line: '#56B4E9', text: '#000000' } },
  // Índigo
  { light: { line: '#332288', text: '#FFFFFF' }, dark: { line: '#634DD2', text: '#FFFFFF' } },
  // Granate
  { light: { line: '#882255', text: '#FFFFFF' }, dark: { line: '#B12C6F', text: '#FFFFFF' } },
  // Arena
  { light: { line: '#9A8626', text: '#000000' }, dark: { line: '#DDCC77', text: '#000000' } },
  // Púrpura
  { light: { line: '#AA4499', text: '#FFFFFF' }, dark: { line: '#AA4499', text: '#FFFFFF' } },
];

/**
 * Asigna a cada línea un índice de la paleta procurando que las líneas que
 * comparten paradas (y por tanto calles) no tengan el mismo color.
 * Coloreado voraz y determinista: mismas líneas, mismos colores.
 */
export function assignLineColors(
  lines: readonly Line[],
  paletteSize = LINE_PALETTE.length,
): Map<string, number> {
  const stopsByLine = new Map(
    lines.map((line) => [line.id, new Set(line.directions.flatMap((d) => d.stopIds))]),
  );
  const sharedStops = (a: string, b: string): number => {
    const stopsA = stopsByLine.get(a)!;
    let count = 0;
    for (const stop of stopsByLine.get(b)!) if (stopsA.has(stop)) count++;
    return count;
  };

  const ids = lines.map((l) => l.id);
  const weights = new Map(ids.map((id) => [id, new Map<string, number>()]));
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const shared = sharedStops(ids[i]!, ids[j]!);
      if (shared > 0) {
        weights.get(ids[i]!)!.set(ids[j]!, shared);
        weights.get(ids[j]!)!.set(ids[i]!, shared);
      }
    }
  }

  const totalWeight = (id: string) => [...weights.get(id)!.values()].reduce((a, b) => a + b, 0);
  // Primero las líneas con más solapes: son las más difíciles de colorear.
  const order = [...ids].sort((a, b) => totalWeight(b) - totalWeight(a) || a.localeCompare(b));

  const assigned = new Map<string, number>();
  const usage = new Array<number>(paletteSize).fill(0);
  for (const id of order) {
    const conflict = new Array<number>(paletteSize).fill(0);
    for (const [other, weight] of weights.get(id)!) {
      const color = assigned.get(other);
      if (color !== undefined) conflict[color]! += weight;
    }
    let best = 0;
    for (let c = 1; c < paletteSize; c++) {
      if (
        conflict[c]! < conflict[best]! ||
        (conflict[c] === conflict[best] && usage[c]! < usage[best]!)
      ) {
        best = c;
      }
    }
    assigned.set(id, best);
    usage[best]!++;
  }
  return assigned;
}
