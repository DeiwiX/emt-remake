/**
 * Retrasos habituales (Fase 10, ADR 0016): cuánto suele ir tarde cada línea y
 * sentido en cada tramo de paradas, según la hora y el tipo de día. Los
 * aprende el script de datos con las posiciones de las últimas 8 semanas.
 */
export interface TypicalDelays {
  readonly stopsPerBucket: number;
  /** "línea|sentido|L/S/F" -> hora (0–23) -> tramo de paradas -> minutos (o null). */
  readonly delays: Readonly<Record<string, readonly (readonly (number | null)[])[]>>;
}

const MINUTES_PER_DAY = 1440;

/** "L" laborable, "S" sábado, "F" domingo (como el script de datos). */
function dayTypeOf(dateKey: string, dayOffset: number): 'L' | 'S' | 'F' {
  const day = new Date(
    Date.UTC(+dateKey.slice(0, 4), +dateKey.slice(4, 6) - 1, +dateKey.slice(6, 8) + dayOffset),
  ).getUTCDay();
  return day === 0 ? 'F' : day === 6 ? 'S' : 'L';
}

/**
 * Minutos que suele ir tarde un paso del horario (`minutes` desde la medianoche
 * de `dateKey`, puede pasar de 1440). 0 si no hay dato o es menos de 1 min.
 */
export function typicalDelay(
  typical: TypicalDelays | null,
  lineId: string,
  directionId: number,
  stopIndex: number,
  dateKey: string,
  minutes: number,
): number {
  if (!typical || stopIndex < 0) return 0;
  const dayOffset = Math.floor(minutes / MINUTES_PER_DAY);
  const hour = Math.floor((minutes - dayOffset * MINUTES_PER_DAY) / 60);
  const key = `${lineId}|${directionId}|${dayTypeOf(dateKey, dayOffset)}`;
  const delay =
    typical.delays[key]?.[hour]?.[Math.floor(stopIndex / typical.stopsPerBucket)] ?? null;
  return delay !== null && Math.abs(delay) >= 1 ? delay : 0;
}
