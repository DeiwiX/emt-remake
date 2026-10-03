import { MIN_COUNTS, MIN_RATIO_VS_PREVIOUS } from '../config.ts';
import type { Manifest } from '../output-schema.ts';
import { ValidationError } from '../validation.ts';

type Counts = Manifest['counts'];
type PreviousCounts = Partial<Counts>;

/**
 * Comprueba que los datos nuevos son plausibles antes de publicarlos.
 * Una caída brusca respecto a la última publicación suele indicar una fuente rota
 * y no un cambio real de la red; en ese caso es mejor mantener los datos anteriores.
 */
export function checkPlausibility(counts: Counts, previous: PreviousCounts | null): void {
  if (counts.lines < MIN_COUNTS.lines) {
    throw new ValidationError(`Solo hay ${counts.lines} líneas (mínimo ${MIN_COUNTS.lines})`);
  }
  if (counts.stops < MIN_COUNTS.stops) {
    throw new ValidationError(`Solo hay ${counts.stops} paradas (mínimo ${MIN_COUNTS.stops})`);
  }
  if (counts.zones < MIN_COUNTS.zones) {
    throw new ValidationError(`Solo hay ${counts.zones} zonas (mínimo ${MIN_COUNTS.zones})`);
  }
  if (!previous) return;

  for (const key of ['lines', 'stops', 'shapes', 'zones'] as const) {
    // Las publicaciones anteriores a las zonas no tienen ese recuento.
    if (previous[key] === undefined) continue;
    const minimum = Math.floor(previous[key] * MIN_RATIO_VS_PREVIOUS);
    if (counts[key] < minimum) {
      throw new ValidationError(
        `"${key}" ha caído de ${previous[key]} a ${counts[key]} (mínimo aceptado ${minimum})`,
      );
    }
  }
}
