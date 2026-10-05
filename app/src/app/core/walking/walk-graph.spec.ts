import { Stop } from '../models/network.model';
import { Place } from '../planner/planner';
import { withStreetWalks } from './walk-access';
import { WalkGraph } from './walk-graph';

/**
 * Cuadrícula de 3 calles: A(0) – B(1) – C(2) en horizontal, B(1) – D(3) hacia
 * arriba con un codo, y un atajo largo A(0) – C(2) que da un rodeo.
 * 0,001° de longitud ≈ 89 m; 0,001° de latitud ≈ 111 m.
 */
const nodes: [number, number][] = [
  [36.72, -4.42],
  [36.72, -4.419],
  [36.72, -4.418],
  [36.721, -4.419],
];
const graph = new WalkGraph(nodes, [
  { a: 0, b: 1, cost: 90 },
  { a: 1, b: 2, cost: 90 },
  { a: 1, b: 3, cost: 120, shape: [[36.7205, -4.4192]] },
  { a: 0, b: 2, cost: 400 },
]);

describe('WalkGraph', () => {
  it('engancha un punto al cruce más cercano, y no a más de 300 m', () => {
    expect(graph.nearest([36.72001, -4.41901])?.node).toBe(1);
    expect(graph.nearest([36.73, -4.42])).toBeNull();
  });

  it('elige el camino más corto por las calles y lo dibuja con sus codos', () => {
    const path = graph.route([36.72, -4.42], [36.721, -4.419])!;
    expect(path.metres).toBeCloseTo(210, 0);
    expect(path.points).toEqual([
      [36.72, -4.42],
      [36.72, -4.419],
      [36.7205, -4.4192],
      [36.721, -4.419],
    ]);
  });

  it('respeta el límite de distancia', () => {
    expect(graph.from([36.72, -4.42], 100)!.metresTo([36.72, -4.418])).toBeNull();
    expect(graph.from([36.72, -4.42], 500)!.metresTo([36.72, -4.418])).toBeCloseTo(180, 0);
  });

  it('cambia los minutos andando de un lugar por los del camino real', () => {
    const stop = (id: string, lat: number, lon: number) => ({ id, lat, lon }) as Stop;
    const stops = new Map([
      ['s1', stop('s1', 36.721, -4.419)],
      ['lejos', stop('lejos', 36.8, -4.3)],
    ]);
    const place: Place = {
      kind: 'address',
      id: 'x',
      name: 'Calle',
      stopIds: ['s1', 'lejos'],
      accessMinutes: new Map([
        ['s1', 1],
        ['lejos', 9],
      ]),
      accessPoints: new Map([
        ['s1', [36.72, -4.42]],
        ['lejos', [36.72, -4.42]],
      ]),
    };
    const refined = withStreetWalks(place, graph, (id) => stops.get(id));
    // 210 m a 80 m/min: 3 min; la parada sin camino conserva su estimación.
    expect(refined.accessMinutes?.get('s1')).toBe(3);
    expect(refined.accessMinutes?.get('lejos')).toBe(9);
  });
});
