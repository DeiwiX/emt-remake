/**
 * Tiempo parado en cada parada mientras suben y bajan viajeros (Fase 6). Es una
 * estimación: no hay datos de viajeros, así que se usa cuántas líneas pasan
 * por la parada (las paradas con muchas líneas suelen tener más gente).
 * El horario ya incluye este tiempo; aquí solo sirve para repartirlo: el
 * autobús se para en la parada y después recorre el tramo.
 */

/** Segundos en una parada de una sola línea. */
const BASE_SECONDS = 12;
/** Segundos de más por cada línea adicional que para allí. */
const PER_LINE_SECONDS = 6;
/** Como mucho, aunque pasen muchas líneas. */
const MAX_SECONDS = 45;

/** Segundos estimados parado en una parada por la que pasan `lines` líneas. */
export function dwellSeconds(lines: number): number {
  return Math.min(MAX_SECONDS, BASE_SECONDS + PER_LINE_SECONDS * Math.max(0, lines - 1));
}

/**
 * Minutos parado en cada parada de un sentido. En la primera (cabecera) no se
 * cuenta: el horario empieza a la salida; en la última, el viaje ya ha terminado.
 */
export function dwellMinutes(
  stopIds: readonly string[],
  linesAt: (stopId: string) => number,
): number[] {
  return stopIds.map((id, i) =>
    i === 0 || i === stopIds.length - 1 ? 0 : dwellSeconds(linesAt(id)) / 60,
  );
}
