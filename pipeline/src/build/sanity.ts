import { MIN_COUNTS, MIN_RATIO_VS_PREVIOUS } from '../config.ts';
import type { Manifest } from '../output-schema.ts';
import { ValidationError } from '../validation.ts';

type Counts = Manifest['counts'];

/**
 * Comprueba que los datos nuevos son plausibles antes de publicarlos.
 * Una caída brusca respecto a la última publicación suele indicar una fuente rota
 * y no un cambio real de la red; en ese caso es mejor mantener los datos anteriores.
 */
export function checkPlausibility(counts: Counts, previous: Counts | null): void {
  if (counts.lines < MIN_COUNTS.lines) {
    throw new ValidationError(`Solo hay ${counts.lines} líneas (mínimo ${MIN_COUNTS.lines})`);
  }
  if (counts.stops < MIN_COUNTS.stops) {
    throw new ValidationError(`Solo hay ${counts.stops} paradas (mínimo ${MIN_COUNTS.stops})`);
  }
  if (!previous) return;

  for (const key of ['lines', 'stops', 'shapes'] as const) {
    const minimum = Math.floor(previous[key] * MIN_RATIO_VS_PREVIOUS);
    if (counts[key] < minimum) {
      throw new ValidationError(
        `"${key}" ha caído de ${previous[key]} a ${counts[key]} (mínimo aceptado ${minimum})`,
      );
    }
  }
}
