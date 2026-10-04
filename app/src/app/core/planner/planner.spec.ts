import { Line, Stop } from '../models/network.model';
import { Place, buildNearbyStops, planJourneys } from './planner';

const line = (id: string, stopIds: string[], minutes?: number[]): Line => ({
  id,
  name: id,
  notes: '',
  directions: [
    {
      id: 1,
      headsign: `Fin ${id}`,
      stopIds,
      shapeId: id,
      shapeQuality: 'official',
      ...(minutes ? { minutes, timesSource: 'schedule' as const } : {}),
    },
  ],
});

const stop = (id: string): Place => ({ kind: 'stop', id, name: id, stopIds: [id] });
const zone = (id: string, stopIds: string[]): Place => ({
  kind: 'neighbourhood',
  id,
  name: id,
  stopIds,
});

/*
 * Red de prueba:
 *   L1: a → b → c → d   (0, 3, 6, 10 min)
 *   L2: c → x → y       (0, 4, 9 min)
 *   L3: a → y           (0, 30 min)  directa pero lenta
 *   L4: d → c → b → a   (sentido contrario a L1)
 */
const LINES = [
  line('L1', ['a', 'b', 'c', 'd'], [0, 3, 6, 10]),
  line('L2', ['c', 'x', 'y'], [0, 4, 9]),
  line('L3', ['a', 'y'], [0, 30]),
  line('L4', ['d', 'c', 'b', 'a'], [0, 4, 7, 10]),
];

describe('planJourneys', () => {
  it('encuentra el viaje directo con su tiempo según horario', () => {
    const [option] = planJourneys(LINES, stop('a'), stop('d'));
    expect(option?.legs).toEqual([
      expect.objectContaining({
        lineId: 'L1',
        fromStopId: 'a',
        toStopId: 'd',
        stopCount: 3,
        minutes: 10,
        estimated: false,
      }),
    ]);
  });

  it('respeta el sentido: no propone ir hacia atrás por una línea', () => {
    const options = planJourneys(LINES, stop('d'), stop('a'));
    expect(options.map((o) => o.legs.map((l) => l.lineId))).toEqual([['L4']]);
  });

  it('propone transbordos si no hay directa, con el margen de transbordo', () => {
    const options = planJourneys(LINES, stop('b'), stop('y'), { transferMinutes: 5 });
    // La mejor: L1 hasta c y L2 hasta y (también existe L4 + L3, más lenta).
    const [option] = options;
    expect(option?.legs.map((l) => [l.lineId, l.fromStopId, l.toStopId])).toEqual([
      ['L1', 'b', 'c'],
      ['L2', 'c', 'y'],
    ]);
    // 3 min en L1 + 5 de transbordo + 9 en L2.
    expect(option?.totalMinutes).toBe(17);
  });

  it('muestra primero las directas y después los transbordos, aunque sean más rápidos', () => {
    const options = planJourneys(LINES, stop('a'), stop('y'), { transferMinutes: 5 });
    expect(options.map((o) => [o.legs.map((l) => l.lineId), o.totalMinutes])).toEqual([
      [['L3'], 30],
      [['L1', 'L2'], 20],
    ]);
  });

  it('funciona con zonas: cualquier parada de origen y de destino', () => {
    const options = planJourneys(LINES, zone('centro', ['a', 'b']), zone('norte', ['d', 'x']));
    const best = options.map((o) => o.legs.map((l) => `${l.lineId}:${l.fromStopId}-${l.toStopId}`));
    expect(best).toContainEqual(['L1:b-d']);
  });

  it('sin tiempos publicados, estima por número de paradas y lo marca', () => {
    const [option] = planJourneys([line('L9', ['a', 'b', 'c'])], stop('a'), stop('c'));
    expect(option?.legs[0]).toEqual(expect.objectContaining({ minutes: 3, estimated: true }));
  });

  it('no devuelve nada si origen o destino no tienen paradas', () => {
    expect(planJourneys(LINES, zone('vacía', []), stop('a'))).toEqual([]);
  });

  it('no repite la misma línea en varias combinaciones con transbordo', () => {
    const lines = [
      line('A', ['o', 't'], [0, 5]),
      line('B', ['t', 'd'], [0, 5]),
      line('C', ['t', 'd'], [0, 6]),
    ];
    const options = planJourneys(lines, stop('o'), stop('d'), { transferMinutes: 5 });
    expect(options.map((o) => o.legs.map((l) => l.lineId))).toEqual([['A', 'B']]);
  });

  it('deja al final las líneas secundarias (nocturnas) aunque sean más rápidas', () => {
    const lines = [line('N1', ['o', 'd'], [0, 5]), line('7', ['o', 'd'], [0, 9])];
    const options = planJourneys(lines, stop('o'), stop('d'), {
      isSecondary: (id) => id.startsWith('N'),
    });
    expect(options.map((o) => o.legs[0]?.lineId)).toEqual(['7', 'N1']);
  });

  it('permite transbordos andando entre paradas cercanas', () => {
    const lines = [line('A', ['o', 't1'], [0, 5]), line('B', ['t2', 'd'], [0, 5])];
    const options = planJourneys(lines, stop('o'), stop('d'), {
      transferMinutes: 5,
      nearbyStops: (id) => (id === 't2' ? [{ stopId: 't1', metres: 120 }] : []),
    });
    expect(options).toHaveLength(1);
    // 120 m × 1,3 / 80 m/min ≈ 2 min andando.
    expect(options[0]).toEqual(expect.objectContaining({ walkMinutes: 2, totalMinutes: 17 }));
  });

  it('desde "Mi ubicación" cuenta el tiempo andando y elige la parada que antes deja en destino', () => {
    // La línea pasa por p1 (a 1 min andando) y por p2 (a 9 min); de p1 a p2 hay 3 min en bus.
    const lines = [line('7', ['p1', 'p2', 'd'], [0, 3, 10])];
    const here: Place = {
      kind: 'location',
      id: 'me',
      name: 'Mi ubicación',
      stopIds: ['p1', 'p2'],
      accessMinutes: new Map([
        ['p1', 1],
        ['p2', 9],
      ]),
    };
    const [option] = planJourneys(lines, here, stop('d'));
    expect(option!.legs[0]!.fromStopId).toBe('p1');
    expect(option!.accessMinutes).toBe(1);
    expect(option!.totalMinutes).toBe(11);
  });

  it('buildNearbyStops encuentra solo las paradas a menos de la distancia máxima', () => {
    const s = (id: string, lon: number): Stop => ({
      id,
      name: id,
      address: '',
      lat: 36.72,
      lon,
      services: [],
    });
    // 0,001° de longitud ≈ 89 m a esta latitud.
    const nearby = buildNearbyStops([s('a', -4.42), s('b', -4.419), s('c', -4.41)], 250);
    expect(nearby('a').map((n) => n.stopId)).toEqual(['b']);
    expect(nearby('c')).toEqual([]);
  });
});
