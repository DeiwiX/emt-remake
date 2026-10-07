/**
 * Deslizar entre las pantallas de la barra inferior (07/10/2026). Lógica pura:
 * decide si un gesto es un deslizamiento horizontal y a qué pantalla lleva.
 */

/** Distancia horizontal mínima, en píxeles, para contar como deslizamiento. */
const MIN_DISTANCE_PX = 70;
/** Como mucho este desvío vertical por cada píxel horizontal (si no, es un desplazamiento). */
const MAX_SLOPE = 0.6;
/** Gestos más lentos que esto no cuentan (arrastrar algo, leer...). */
const MAX_DURATION_MS = 600;

export interface Gesture {
  readonly dx: number;
  readonly dy: number;
  readonly ms: number;
}

/** -1: deslizar a la derecha (pantalla anterior); 1: a la izquierda (siguiente); 0: nada. */
export function swipeDirection({ dx, dy, ms }: Gesture): -1 | 0 | 1 {
  if (ms > MAX_DURATION_MS || Math.abs(dx) < MIN_DISTANCE_PX) return 0;
  if (Math.abs(dy) > Math.abs(dx) * MAX_SLOPE) return 0;
  return dx < 0 ? 1 : -1;
}

/** Pantalla a la que lleva el gesto (null si no hay o la actual no es de la barra). */
export function swipeTarget(
  path: string,
  tabs: readonly string[],
  direction: -1 | 0 | 1,
): string | null {
  if (direction === 0) return null;
  const clean = path.split(/[?#]/)[0] || '/';
  const index = tabs.indexOf(clean);
  if (index === -1) return null;
  return tabs[index + direction] ?? null;
}
