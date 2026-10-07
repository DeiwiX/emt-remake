import { Direction } from '../models/network.model';
import { minutesToStop, vehicleProgress } from './live-estimate';
import { Vehicle, estimateArrivals } from './realtime';
import { previousReports } from './realtime.service';
import { dwellMinutes, dwellSeconds } from './dwell';
import { buildTrack, positionOnTrack, smoothAlong } from './vehicle-position';

const direction: Direction = {
  id: 1,
  headsign: 'Centro',
  stopIds: ['a', 'b', 'c', 'd'],
  shapeId: 'g1',
  shapeQuality: 'official',
  minutes: [0, 4, 10, 15],
};

/** Autobús 7 que pasó por `stop`; el dato es de las `hhmm` (hora de Madrid). */
const bus = (stop: string, hhmm: string): Vehicle => {
  const [h, m] = hhmm.split(':').map(Number);
  return {
    id: '7',
    lineId: '1',
    directionId: 1,
    lastStopId: stop,
    lat: 36.72,
    lon: -4.42,
    dateKey: '20261005',
    seconds: h! * 3600 + m! * 60,
  };
};

describe('Fase 6: retraso real y ritmo', () => {
  // Salidas a las 8:00 (perfil lento de hora punta) y a las 8:20 (perfil típico).
  const trips = () => [
    { start: 8 * 60, profile: [0, 6, 14, 20] },
    { start: 8 * 60 + 20, profile: null },
  ];

  it('casa el autobús con su viaje, usa sus tiempos y calcula el retraso', () => {
    // Pasó por "b" a las 8:09: el viaje de las 8:00 debía pasar a las 8:06 (3 min tarde).
    const progress = vehicleProgress(bus('b', '08:09'), direction, 1, { trips })!;
    expect(progress.delay).toBe(3);
    expect(progress.profile).toEqual([0, 6, 14, 20]);
    // A "d" le faltan 20 − 6 = 14 min desde el dato; han pasado 2.
    expect(minutesToStop(progress, 1, 3, 2)).toBe(12);
  });

  it('prefiere que vaya tarde a que vaya adelantado', () => {
    // Pasó por "b" a las 8:16: 10 min tarde para el de las 8:00 o 8 min antes que el de las 8:20.
    expect(vehicleProgress(bus('b', '08:16'), direction, 1, { trips })!.delay).toBe(10);
  });

  it('sin horario usa los minutos típicos y no sabe el retraso', () => {
    const progress = vehicleProgress(bus('b', '08:09'), direction, 1)!;
    expect(progress.delay).toBeNull();
    expect(progress.pace).toBe(1);
    expect(minutesToStop(progress, 1, 3, 0)).toBe(11);
  });

  it('mide el ritmo con el dato anterior: si va lento, tarda más', () => {
    // De "a" a "b" (4 min de horario) ha tardado 8 min: ritmo medido 0,5 → 0,75 mezclado.
    const previous = () => bus('a', '08:01');
    const progress = vehicleProgress(bus('b', '08:09'), direction, 1, { previous })!;
    expect(progress.pace).toBeCloseTo(0.75);
    expect(minutesToStop(progress, 1, 2, 0)).toBeCloseTo(8);
  });

  it('guarda el dato anterior solo cuando el autobús publica uno nuevo', () => {
    const first = bus('a', '08:01');
    const same = previousReports([first], [first], new Map());
    expect(same.get('7')).toBeUndefined();
    const second = bus('b', '08:06');
    expect(previousReports([first], [second], same).get('7')).toEqual(first);
    // El mismo dato repetido conserva el anterior.
    const kept = previousReports([second], [second], new Map([['7', first]]));
    expect(kept.get('7')).toEqual(first);
  });

  it('no teletransporta el autobús cuando la estimación salta', () => {
    let state = smoothAlong(undefined, 1000);
    expect(state.shown).toBe(1000);
    // Llega un dato nuevo: la estimación salta 300 m hacia delante.
    state = smoothAlong(state, 1300);
    expect(state.shown).toBeGreaterThan(1000);
    expect(state.shown).toBeLessThan(1100);
    for (let i = 0; i < 60; i++) state = smoothAlong(state, 1300);
    expect(state.shown).toBeCloseTo(1300, 0);
    // Un salto enorme (otro viaje) se coloca directamente.
    expect(smoothAlong(state, 5000).shown).toBe(5000);
  });
});

describe('Fase 6: tiempo parado en las paradas', () => {
  it('más líneas, más tiempo parado, con un tope; sin parar en cabecera ni en la última', () => {
    expect(dwellSeconds(1)).toBe(12);
    expect(dwellSeconds(4)).toBe(30);
    expect(dwellSeconds(20)).toBe(45);
    expect(dwellMinutes(['a', 'b', 'c'], () => 1)).toEqual([0, 0.2, 0]);
  });

  it('el autobús se queda parado en la parada y después recorre el tramo', () => {
    // Recta de unos 900 m con tres paradas; 0,5 min parado en "b".
    const track = buildTrack(
      [
        [36.72, -4.43],
        [36.72, -4.42],
      ],
      [
        [36.72, -4.43],
        [36.72, -4.425],
        [36.72, -4.42],
      ],
    )!;
    const minutes = [0, 2, 4];
    const dwell = [0, 0.5, 0];
    const stopped = positionOnTrack(track, minutes, 1, 0.3, dwell);
    expect(stopped.stoppedAt).toBe(1);
    expect(stopped.along).toBeCloseTo(track.stopDistances[1]!, 0);
    const moving = positionOnTrack(track, minutes, 1, 1.25, dwell);
    expect(moving.stoppedAt).toBeNull();
    // A mitad del tiempo de marcha (0,75 de 1,5 min): a mitad del tramo.
    const middle = (track.stopDistances[1]! + track.stopDistances[2]!) / 2;
    expect(moving.along).toBeCloseTo(middle, 0);
  });
});

describe('Fase 6: posición y llegada cuadran', () => {
  it('con el avance del mapa, la llegada sale de él y un bus ya pasado no cuenta', () => {
    const now = { dateKey: '20261005', seconds: 8 * 3600 + 10 * 60 };
    const progressOf = (minutes: number) => () => ({
      directionKey: '1|1',
      profile: [0, 4, 10, 15],
      minutes,
      pace: 1,
    });
    // Va por el minuto 9 de su horario: a "c" (minuto 10) le falta 1 min.
    const [arrival] = estimateArrivals([bus('b', '08:09')], '1', direction, 2, now, {
      progressOf: progressOf(9),
    });
    expect(arrival?.minutes).toBe(1);
    // Por el minuto 11: ya ha pasado "c".
    expect(
      estimateArrivals([bus('b', '08:09')], '1', direction, 2, now, { progressOf: progressOf(11) }),
    ).toEqual([]);
  });

  it('el autobús dibujado nunca va por delante de la estimación', () => {
    let state = smoothAlong(undefined, 1000);
    // La estimación retrocede (dato nuevo): el dibujo no se queda por delante.
    state = smoothAlong(state, 900);
    expect(state.shown).toBeLessThanOrEqual(900);
  });
});
