/** Error de validación de una fuente: impide publicar datos sospechosos. */
export class ValidationError extends Error {
  override name = 'ValidationError';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function requireString(value: unknown, where: string): string {
  if (typeof value !== 'string') throw new ValidationError(`${where}: se esperaba texto`);
  return value.trim();
}

export function requireNumber(value: unknown, where: string): number {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) {
    throw new ValidationError(`${where}: se esperaba un número`);
  }
  return number;
}

/** Caja que contiene el área metropolitana de Málaga con margen. */
const MALAGA_BOUNDS = { minLat: 36.55, maxLat: 36.9, minLon: -4.75, maxLon: -4.2 };

export function requireMalagaCoordinate(lat: number, lon: number, where: string): void {
  const inside =
    lat >= MALAGA_BOUNDS.minLat &&
    lat <= MALAGA_BOUNDS.maxLat &&
    lon >= MALAGA_BOUNDS.minLon &&
    lon <= MALAGA_BOUNDS.maxLon;
  if (!inside) throw new ValidationError(`${where}: coordenada fuera de Málaga (${lat}, ${lon})`);
}
