/** Fecha corta y estándar en hora de Madrid: "05/10/2026". */
export function shortDate(date: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Madrid',
  }).format(date);
}
