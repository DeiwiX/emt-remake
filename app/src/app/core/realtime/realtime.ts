import { Direction } from '../models/network.model';

/**
 * Tiempo real (Fase 3): posiciones de los autobuses publicadas por el
 * Ayuntamiento y estimación de llegada a una parada. Lógica pura.
 *
 * La fuente se actualiza cada ~5 min (medido el 04/10/2026), así que la
 * llegada es una estimación: última parada por la que pasó el bus + tiempo
 * programado hasta la parada − lo que ha pasado desde el dato.
 */

/** Autobús en servicio según el último dato publicado. */
export interface Vehicle {
  readonly id: string;
  readonly lineId: string;
  readonly directionId: number;
  /** Última parada por la que ha pasado (código público). */
  readonly lastStopId: string;
  readonly lat: number;
  readonly lon: number;
  /** Hora del dato, en segundos desde la medianoche de Madrid de `dateKey`. */
  readonly seconds: number;
  /** Día del dato (AAAAMMDD, hora de Madrid). */
  readonly dateKey: string;
}

/** Llegada estimada de un autobús a una parada. */
export interface EstimatedArrival {
  readonly vehicleId: string;
  /** Minutos que faltan (redondeados, al menos 0). */
  readonly minutes: number;
  /** Antigüedad del dato en minutos: cuanto mayor, menos fiable. */
  readonly ageMinutes: number;
}

/** Instante en hora de Madrid con segundos, para comparar con los datos. */
export interface MadridInstant {
  readonly dateKey: string;
  readonly seconds: number;
}

/** Datos con más antigüedad no se usan: el bus puede estar en cualquier sitio. */
export const MAX_AGE_MINUTES = 15;
/** Llegadas más lejanas no se muestran como tiempo real (el horario basta). */
export const MAX_ESTIMATE_MINUTES = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** "1.0" -> "1": la fuente da el código de línea como número decimal. */
function lineIdOf(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const text = String(raw).trim().replace(/\.0+$/, '');
  return text || null;
}

/** "2026-10-04 15:45:09" (hora de Madrid) -> día y segundos. */
function parseLocalTime(raw: unknown): MadridInstant | null {
  if (typeof raw !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  return { dateKey: `${y}${mo}${d}`, seconds: Number(h) * 3600 + Number(mi) * 60 + Number(s) };
}

/**
 * Lee la lista de autobuses de la fuente (GeoJSON como lista de "Feature").
 * Descarta los registros incompletos en vez de fallar entero.
 */
export function parseVehicles(raw: unknown): Vehicle[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): Vehicle[] => {
    if (!isRecord(item)) return [];
    const properties = isRecord(item['properties']) ? item['properties'] : item;
    const geometry = isRecord(item['geometry']) ? item['geometry'] : null;
    const coordinates =
      geometry && Array.isArray(geometry['coordinates']) ? geometry['coordinates'] : [];
    const lon = Number(coordinates[0]);
    const lat = Number(coordinates[1]);
    const lineId = lineIdOf(properties['codLinea'] ?? item['codLinea']);
    const directionId = Number(properties['sentido'] ?? item['sentido']);
    const lastStopId = String(properties['codParIni'] ?? item['codParIni'] ?? '').trim();
    const id = String(properties['codBus'] ?? item['codBus'] ?? '').trim();
    const time = parseLocalTime(properties['last_update']);
    if (!lineId || !id || !lastStopId || !time) return [];
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isInteger(directionId)) return [];
    return [{ id, lineId, directionId, lastStopId, lat, lon, ...time }];
  });
}

const madridFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function madridInstant(date: Date): MadridInstant {
  const parts = Object.fromEntries(madridFormat.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    dateKey: `${parts['year']}${parts['month']}${parts['day']}`,
    seconds: Number(parts['hour']) * 3600 + Number(parts['minute']) * 60 + Number(parts['second']),
  };
}

/** Minutos desde el dato hasta ahora (null si es de otro día o del futuro). */
export function ageMinutes(vehicle: Vehicle, now: MadridInstant): number | null {
  if (vehicle.dateKey !== now.dateKey) return null;
  const age = (now.seconds - vehicle.seconds) / 60;
  return age >= -1 ? Math.max(0, age) : null;
}

/**
 * Autobuses de una línea y sentido que aún no han pasado por la parada `stopIndex`
 * del sentido, con su llegada estimada, del más cercano al más lejano.
 */
export function estimateArrivals(
  vehicles: readonly Vehicle[],
  lineId: string,
  direction: Direction,
  stopIndex: number,
  now: MadridInstant,
): EstimatedArrival[] {
  const minutes = direction.minutes;
  if (!minutes || stopIndex < 0) return [];
  return vehicles
    .flatMap((vehicle): EstimatedArrival[] => {
      if (vehicle.lineId !== lineId || vehicle.directionId !== direction.id) return [];
      const age = ageMinutes(vehicle, now);
      if (age === null || age > MAX_AGE_MINUTES) return [];
      // La última parada antes de la pedida (las circulares pueden repetir paradas).
      const last = direction.stopIds.lastIndexOf(vehicle.lastStopId, stopIndex - 1);
      if (last === -1) return [];
      const remaining = minutes[stopIndex]! - minutes[last]! - age;
      if (remaining > MAX_ESTIMATE_MINUTES) return [];
      return [
        {
          vehicleId: vehicle.id,
          minutes: Math.max(0, Math.round(remaining)),
          ageMinutes: Math.round(age),
        },
      ];
    })
    .sort((a, b) => a.minutes - b.minutes);
}
