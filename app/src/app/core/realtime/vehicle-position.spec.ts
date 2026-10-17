import { LatLon } from '../models/network.model';
import { buildTrack, snapToTrack, trackSlice } from './vehicle-position';

// Recta hacia el este: ~100 m entre puntos (0,0009° de longitud a 36,72° ≈ 80 m).
const line: LatLon[] = [0, 1, 2, 3, 4].map((i): LatLon => [36.72, -4.42 + i * 0.001]);
const stops: LatLon[] = [line[0]!, line[2]!, line[4]!];

describe('Autobús sobre el trazado', () => {
  const track = buildTrack(line, stops)!;

  it('recorta el trazado entre dos paradas (tramo lento)', () => {
    const slice = trackSlice(track, track.stopDistances[1]!, track.stopDistances[2]!);
    expect(slice[0]![1]).toBeCloseTo(line[2]![1], 6);
    expect(slice.at(-1)![1]).toBeCloseTo(line[4]![1], 6);
    expect(slice).toHaveLength(3);
  });

  it('sitúa las paradas sobre el trazado', () => {
    expect(track.stopDistances[0]).toBeCloseTo(0, 0);
    expect(track.stopDistances[1]! / track.stopDistances[2]!).toBeCloseTo(0.5, 2);
  });

  it('coloca el GPS sobre el recorrido, mirando hacia donde va', () => {
    // 20 m al norte de la mitad del primer tramo.
    const snapped = snapToTrack(track, [36.72018, -4.4195])!;
    expect(snapped.point[0]).toBeCloseTo(36.72, 5);
    expect(snapped.point[1]).toBeCloseTo(-4.4195, 5);
    expect(snapped.bearing).toBeCloseTo(90, 0);
  });

  it('busca solo entre las paradas indicadas y descarta lo que está lejos del recorrido', () => {
    const snapped = snapToTrack(track, [36.72, -4.4195], [1, 2])!;
    expect(snapped.along).toBeCloseTo(track.stopDistances[1]!, 0);
    expect(snapToTrack(track, [36.73, -4.4195])).toBeNull();
  });
});
