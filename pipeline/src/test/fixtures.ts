import type { LatLon } from '../build/geometry.ts';

/** Una calle recta de oeste a este en el centro de Málaga, con un punto cada ~90 m. */
export const STREET: LatLon[] = Array.from({ length: 11 }, (_, i): LatLon => [
  36.72,
  -4.43 + i * 0.001,
]);

/** Paradas sobre esa calle, desplazadas ~5 m al norte. */
export const STOPS_EASTBOUND: LatLon[] = [1, 4, 7, 10].map((i): LatLon => [
  36.72005,
  -4.43 + i * 0.001,
]);

/** Entrada mínima con el formato de "Líneas y paradas autobuses EMT". */
export function emtLineJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const stop = (code: number, lon: number, sentido: number, orden: number) => ({
    sentido,
    orden,
    parada: {
      codParada: code,
      nombreParada: `Parada ${code}`,
      direccion: 'CL  EJEMPLO  1',
      latitud: 36.72005,
      longitud: lon,
    },
  });
  return {
    userCodLinea: '1',
    nombreLinea: 'Origen - Destino',
    observaciones: '',
    cabeceraIda: 'Origen',
    cabeceraVuelta: 'Destino',
    // Desordenadas a propósito: el parser debe ordenarlas por "orden".
    paradas: [
      stop(12, -4.426, 1, 2),
      stop(11, -4.429, 1, 1),
      stop(13, -4.423, 1, 3),
      stop(13, -4.423, 2, 1),
      stop(11, -4.429, 2, 2),
    ],
    ...overrides,
  };
}
