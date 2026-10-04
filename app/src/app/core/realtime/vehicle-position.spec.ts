import { LatLon } from '../models/network.model';
import { buildTrack, positionFromReport, positionOnTrack } from './vehicle-position';

// Recta hacia el este: ~100 m entre puntos (0,0009° de longitud a 36,72° ≈ 80 m).
const line: LatLon[] = [0, 1, 2, 3, 4].map((i): LatLon => [36.72, -4.42 + i * 0.001]);
const stops: LatLon[] = [line[0]!, line[2]!, line[4]!];
const minutes = [0, 4, 8];

describe('Posición estimada del autobús', () => {
  const track = buildTrack(line, stops)!;

  it('sitúa las paradas sobre el trazado', () => {
    expect(track.stopDistances[0]).toBeCloseTo(0, 0);
    expect(track.stopDistances[1]! / track.stopDistances[2]!).toBeCloseTo(0.5, 2);
  });

  it('avanza al ritmo del horario desde la última parada y mira hacia donde va', () => {
    const half = positionOnTrack(track, minutes, 0, 2); // mitad del primer tramo
    expect(half.point[1]).toBeCloseTo(-4.419, 4);
    expect(half.bearing).toBeCloseTo(90, 0);
    // Pasado el final, se queda en la última parada.
    expect(positionOnTrack(track, minutes, 0, 60).point[1]).toBeCloseTo(-4.416, 4);
  });

  it('parte del punto publicado y no de la parada', () => {
    // Publicado justo en la segunda parada hace 0 min: ahí está.
    const now = positionFromReport(track, minutes, 0, line[2]!, 0);
    expect(now.point[1]).toBeCloseTo(-4.418, 4);
    // Dos minutos después, a medio camino de la tercera.
    expect(positionFromReport(track, minutes, 0, line[2]!, 2).point[1]).toBeCloseTo(-4.417, 4);
  });
});
