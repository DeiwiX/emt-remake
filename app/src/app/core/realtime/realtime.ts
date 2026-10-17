/**
 * Tiempo real oficial de la EMT (GTFS-RT, 17/10/2026). Lógica pura.
 *
 * La EMT publica cada minuto dos ficheros: la posición GPS de cada autobús
 * (VehiclePositions) y la llegada prevista de cada viaje a sus paradas
 * (TripUpdates). Sus viajes solo dicen la posición de cada parada en el viaje
 * ("stop_sequence"), así que se cruzan con los recorridos publicados en el
 * horario (LiveIndex) para saber de qué línea, sentido y paradas son.
 */

/** Recorridos y viajes del GTFS para leer el tiempo real (se publican con el horario). */
export interface LiveIndex {
  readonly patterns: readonly LivePattern[];
  /** Horario ("G2606S") -> bloque ("072-03") -> índice del recorrido de cada viaje (número − 1). */
  readonly trips: ReadonlyMap<string, ReadonlyMap<string, readonly number[]>>;
}

export interface LivePattern {
  readonly lineId: string;
  readonly directionId: number;
  /** Paradas del viaje en orden (stop_sequence 1, 2, …). */
  readonly stops: readonly string[];
  /** Minutos desde la salida en cada parada, según el horario. */
  readonly minutes: readonly number[];
}

/** Lo que interesa de una entidad VehiclePosition del feed. */
export interface FeedVehicle {
  readonly id: string;
  readonly tripId: string | null;
  readonly lat: number;
  readonly lon: number;
  /** Hora del dato (segundos Unix). */
  readonly timestamp: number;
}

/** Lo que interesa de una entidad TripUpdate del feed. */
export interface FeedTripUpdate {
  readonly tripId: string;
  readonly vehicleId: string | null;
  /** Salida programada del viaje (segundos Unix), si el feed la trae. */
  readonly start: number | null;
  readonly timestamp: number;
  readonly stops: readonly FeedStopUpdate[];
}

export interface FeedStopUpdate {
  readonly sequence: number;
  /** Llegada prevista (segundos Unix), si la trae. */
  readonly time: number | null;
  /** La parada no se hace en este viaje (desvío). */
  readonly skipped: boolean;
}

/** Un viaje en tiempo real, ya cruzado con su recorrido. */
export interface LiveTrip {
  readonly tripId: string;
  readonly vehicleId: string | null;
  readonly lineId: string;
  readonly directionId: number;
  readonly stops: readonly string[];
  /** Llegada prevista a cada parada (segundos Unix); null si ya pasó, no se sabe o no para. */
  readonly arrivals: readonly (number | null)[];
  /** Retraso frente al horario en cada parada (segundos); null si no se sabe. */
  readonly delays: readonly (number | null)[];
  readonly timestamp: number;
}

/** Autobús en servicio según su último dato. */
export interface Vehicle {
  readonly id: string;
  readonly lineId: string;
  readonly directionId: number;
  readonly lat: number;
  readonly lon: number;
  /** Hora del dato (segundos Unix). */
  readonly timestamp: number;
  /** Viaje que está haciendo (para cruzarlo con su llegada prevista). */
  readonly tripId: string | null;
}

/** Llegada prevista de un autobús a una parada. */
export interface EstimatedArrival {
  readonly tripId: string;
  /** Autobús que hace el viaje, si ya se sabe (los viajes siguientes a veces no lo traen). */
  readonly vehicleId: string | null;
  /** Minutos que faltan (redondeados, al menos 0). */
  readonly minutes: number;
  /** Antigüedad del dato en minutos. */
  readonly ageMinutes: number;
  /** Retraso frente al horario (min, negativo si va adelantado); null si no se sabe. */
  readonly delayMinutes: number | null;
}

/** Datos con más antigüedad no se usan: el bus puede estar en cualquier sitio. */
export const MAX_AGE_MINUTES = 15;
/** Llegadas más lejanas no se muestran como tiempo real (el horario basta). */
export const MAX_ESTIMATE_MINUTES = 60;
/** Mientras el autobús está en la parada (o el dato llega con un poco de retraso) aún cuenta. */
const ARRIVING_GRACE_SECONDS = 30;

/**
 * Partes de un trip_id del tiempo real: "G2606S_F21_072-03_13" -> horario
 * "G2606S", bloque "072-03" y viaje 13. La variante ("F21") no siempre está en
 * el GTFS publicado, así que no se usa.
 */
export function tripKeyParts(
  tripId: string,
): { schedule: string; block: string; trip: number } | null {
  const match = /^([^_]+)_[^_]+_(.+)_(\d+)$/.exec(tripId);
  return match ? { schedule: match[1]!, block: match[2]!, trip: Number(match[3]) } : null;
}

/** Índice del recorrido de un viaje del tiempo real, o −1. */
function patternIndexOf(index: LiveIndex, tripId: string): number {
  const key = tripKeyParts(tripId);
  if (!key) return -1;
  return index.trips.get(key.schedule)?.get(key.block)?.[key.trip - 1] ?? -1;
}

export function patternOf(index: LiveIndex, tripId: string): LivePattern | null {
  return index.patterns[patternIndexOf(index, tripId)] ?? null;
}

/**
 * Lo que necesita el seguimiento nativo para reconocer, en el feed, los viajes
 * de un sentido que pasan por una parada: la posición de la parada en cada
 * recorrido (con sus minutos) y los viajes ("horario_bloque_número") de cada uno.
 */
export interface StopTrips {
  readonly patterns: readonly { readonly sequence: number; readonly minutes: readonly number[] }[];
  readonly trips: Readonly<Record<string, number>>;
}

export function stopTrips(
  index: LiveIndex,
  lineId: string,
  directionId: number,
  stopId: string,
): StopTrips {
  const local = new Map<number, number>();
  const patterns: { sequence: number; minutes: readonly number[] }[] = [];
  index.patterns.forEach((pattern, i) => {
    const position = pattern.stops.indexOf(stopId);
    if (pattern.lineId !== lineId || pattern.directionId !== directionId || position === -1) return;
    local.set(i, patterns.push({ sequence: position + 1, minutes: pattern.minutes }) - 1);
  });
  const trips: Record<string, number> = {};
  for (const [schedule, blocks] of index.trips) {
    for (const [block, list] of blocks) {
      list.forEach((pattern, n) => {
        const mine = local.get(pattern);
        if (mine !== undefined) trips[`${schedule}_${block}_${n + 1}`] = mine;
      });
    }
  }
  return { patterns, trips };
}

/**
 * Cruza los TripUpdates con sus recorridos. Una parada sin dato toma el retraso
 * de la anterior que lo tenga (como dice el estándar GTFS-RT); las anteriores a
 * la primera con dato ya han pasado.
 */
export function liveTrips(updates: readonly FeedTripUpdate[], index: LiveIndex): LiveTrip[] {
  return updates.flatMap((update): LiveTrip[] => {
    const pattern = patternOf(index, update.tripId);
    if (!pattern) return [];
    const bySequence = new Map(update.stops.map((s) => [s.sequence, s]));
    const arrivals: (number | null)[] = [];
    const delays: (number | null)[] = [];
    let anchor: { index: number; time: number } | null = null;
    pattern.stops.forEach((_, i) => {
      const stop = bySequence.get(i + 1);
      let time: number | null = null;
      if (stop?.time !== null && stop?.time !== undefined) {
        time = stop.time;
        anchor = { index: i, time };
      } else if (anchor) {
        time = anchor.time + (pattern.minutes[i]! - pattern.minutes[anchor.index]!) * 60;
      }
      const scheduled = update.start === null ? null : update.start + pattern.minutes[i]! * 60;
      delays.push(time === null || scheduled === null ? null : time - scheduled);
      arrivals.push(stop?.skipped ? null : time);
    });
    return [
      {
        tripId: update.tripId,
        vehicleId: update.vehicleId,
        lineId: pattern.lineId,
        directionId: pattern.directionId,
        stops: pattern.stops,
        arrivals,
        delays,
        timestamp: update.timestamp,
      },
    ];
  });
}

/** Autobuses del feed de posiciones, con la línea y el sentido de su viaje. */
export function liveVehicles(feed: readonly FeedVehicle[], index: LiveIndex): Vehicle[] {
  return feed.flatMap((vehicle): Vehicle[] => {
    const pattern = vehicle.tripId ? patternOf(index, vehicle.tripId) : null;
    if (!pattern) return [];
    return [
      {
        id: vehicle.id,
        lineId: pattern.lineId,
        directionId: pattern.directionId,
        lat: vehicle.lat,
        lon: vehicle.lon,
        timestamp: vehicle.timestamp,
        tripId: vehicle.tripId,
      },
    ];
  });
}

/** Posición (en el viaje) de la próxima parada que le queda: la primera aún por llegar. */
export function nextStopIndex(trip: LiveTrip, now: number): number | null {
  const index = trip.arrivals.findIndex(
    (time) => time !== null && time >= now - ARRIVING_GRACE_SECONDS,
  );
  return index === -1 ? null : index;
}

/**
 * Llegadas a una parada de los viajes de una línea y sentido, de la más
 * próxima a la más lejana (hasta MAX_ESTIMATE_MINUTES).
 */
export function arrivalsAt(
  trips: readonly LiveTrip[],
  lineId: string,
  directionId: number,
  stopId: string,
  now: number,
): EstimatedArrival[] {
  return trips
    .flatMap((trip): EstimatedArrival[] => {
      if (trip.lineId !== lineId || trip.directionId !== directionId) return [];
      // La primera vez que pasa por la parada aún por llegar (las circulares la repiten).
      const index = trip.stops.findIndex(
        (id, i) => id === stopId && (trip.arrivals[i] ?? -Infinity) >= now - ARRIVING_GRACE_SECONDS,
      );
      if (index === -1) return [];
      const remaining = (trip.arrivals[index]! - now) / 60;
      const age = (now - trip.timestamp) / 60;
      if (remaining > MAX_ESTIMATE_MINUTES || age > MAX_AGE_MINUTES) return [];
      const delay = trip.delays[index];
      return [
        {
          tripId: trip.tripId,
          vehicleId: trip.vehicleId,
          minutes: Math.max(0, Math.round(remaining)),
          ageMinutes: Math.max(0, Math.round(age)),
          delayMinutes: delay === null || delay === undefined ? null : Math.round(delay / 60),
        },
      ];
    })
    .sort((a, b) => a.minutes - b.minutes);
}

/** Minutos desde el dato hasta ahora (al menos 0). */
export function ageMinutes(vehicle: Vehicle, now: number): number {
  return Math.max(0, (now - vehicle.timestamp) / 60);
}

/** Segundos Unix de una hora "HH:MM:SS" del día AAAAMMDD en Madrid (como `start_time`). */
export function madridEpoch(dateKey: string, time: string): number | null {
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(dateKey);
  const clock = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(time);
  if (!date || !clock) return null;
  const seconds = Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
  const noonUtc = Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3]), 12);
  // Diferencia de Madrid con UTC ese día (1 h en invierno, 2 h en verano).
  const offset = madridOffsetMinutes(new Date(noonUtc));
  return (noonUtc - 12 * 3_600_000) / 1000 + seconds - offset * 60;
}

const offsetFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Madrid',
  timeZoneName: 'shortOffset',
});

function madridOffsetMinutes(date: Date): number {
  const name = offsetFormat.formatToParts(date).find((p) => p.type === 'timeZoneName')?.value;
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name ?? '');
  if (!match) return 60;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === '-' ? -minutes : minutes;
}

/** Autobús que va hacia una parada: el que antes llega de los que la sirven. */
export interface ApproachingBus {
  readonly vehicleId: string;
  readonly lineId: string;
  /** Minutos que faltan (null si pasa de MAX_ESTIMATE_MINUTES: entonces se dicen las paradas). */
  readonly minutes: number | null;
  /** Paradas que le quedan hasta la de destino. */
  readonly stopsAway: number;
}

/**
 * "Ubicar bus más cercano": de los viajes con autobús asignado de las líneas y
 * sentidos que paran aquí, el que antes llega a la parada (siempre uno que va
 * hacia ella, nunca uno que ya pasó o va al revés).
 */
export function approachingBus(
  trips: readonly LiveTrip[],
  services: readonly { readonly lineId: string; readonly directionId: number }[],
  stopId: string,
  now: number,
): ApproachingBus | null {
  let best: { trip: LiveTrip; at: number; index: number } | null = null;
  for (const trip of trips) {
    if (!trip.vehicleId) continue;
    if (!services.some((s) => s.lineId === trip.lineId && s.directionId === trip.directionId)) {
      continue;
    }
    const index = trip.stops.findIndex(
      (id, i) => id === stopId && (trip.arrivals[i] ?? -Infinity) >= now - ARRIVING_GRACE_SECONDS,
    );
    if (index === -1 || (now - trip.timestamp) / 60 > MAX_AGE_MINUTES) continue;
    const at = trip.arrivals[index]!;
    if (!best || at < best.at) best = { trip, at, index };
  }
  if (!best) return null;
  const remaining = (best.at - now) / 60;
  const ahead = nextStopIndex(best.trip, now) ?? best.index;
  return {
    vehicleId: best.trip.vehicleId!,
    lineId: best.trip.lineId,
    minutes: remaining > MAX_ESTIMATE_MINUTES ? null : Math.max(0, Math.round(remaining)),
    stopsAway: Math.max(0, best.index - ahead),
  };
}
