/**
 * Horario programado de la EMT (GTFS): salidas de cada sentido por día de
 * servicio y cálculo de los próximos buses en una parada. Lógica pura.
 *
 * Las horas se expresan en "minutos desde la medianoche del día de referencia"
 * (el día en que se consulta), así que un bus de mañana a las 6:20 es 1440 + 380.
 * Siempre es horario programado, nunca tiempo real.
 */

export interface Timetables {
  /** Días (AAAAMMDD) en que funciona cada servicio. */
  readonly services: ReadonlyMap<string, ReadonlySet<string>>;
  /** "línea|sentido" -> servicio -> minutos de salida desde la primera parada. */
  readonly departures: ReadonlyMap<string, ReadonlyMap<string, readonly number[]>>;
  /**
   * Horario exacto (opcional): perfiles de paso de cada sentido (minutos desde la
   * salida en cada parada) y, para cada salida, el índice de su perfil.
   */
  readonly profiles?: ReadonlyMap<string, readonly (readonly number[])[]>;
  readonly departureProfiles?: ReadonlyMap<string, ReadonlyMap<string, readonly number[]>>;
}

/** Parada de un sentido: su posición y los minutos típicos desde la primera parada. */
export interface StopAt {
  readonly index: number;
  readonly typical: number;
}

/** Paso de un viaje por dos paradas de su sentido, en minutos desde la medianoche de referencia. */
export interface PassingTrip {
  readonly departure: number;
  readonly arrival: number;
}

/** Instante de consulta en hora de Málaga. */
export interface ServiceClock {
  /** AAAAMMDD del día de referencia. */
  readonly dateKey: string;
  /** Minutos desde su medianoche. */
  readonly minutes: number;
}

export const MINUTES_PER_DAY = 1440;

/** La EMT funciona en hora de Madrid, aunque el móvil esté en otra zona horaria. */
const madridFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function madridClock(date: Date): ServiceClock {
  const parts = Object.fromEntries(madridFormat.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    dateKey: `${parts['year']}${parts['month']}${parts['day']}`,
    minutes: Number(parts['hour']) * 60 + Number(parts['minute']),
  };
}

export function addDays(dateKey: string, days: number): string {
  const date = new Date(
    Date.UTC(
      Number(dateKey.slice(0, 4)),
      Number(dateKey.slice(4, 6)) - 1,
      Number(dateKey.slice(6, 8)),
    ),
  );
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

export const departuresKey = (lineId: string, directionId: number) => `${lineId}|${directionId}`;

/**
 * Viajes programados que pasan por `from` y después por `to` en el día de
 * referencia y el siguiente (y los del anterior que pasan de medianoche),
 * ordenados por la hora de paso por `from`. Con horario exacto se usa el paso
 * de cada viaje; si no, los minutos típicos del sentido.
 */
export function passingTrips(
  timetables: Timetables,
  lineId: string,
  directionId: number,
  from: StopAt,
  to: StopAt,
  referenceDateKey: string,
): PassingTrip[] {
  const key = departuresKey(lineId, directionId);
  const byService = timetables.departures.get(key);
  if (!byService) return [];
  const profiles = timetables.profiles?.get(key);
  const profileOf = timetables.departureProfiles?.get(key);
  const trips: PassingTrip[] = [];
  // Día anterior (-1), día de referencia (0) y siguiente (+1).
  for (const dayOffset of [-1, 0, 1]) {
    const dateKey = addDays(referenceDateKey, dayOffset);
    for (const [service, starts] of byService) {
      if (!timetables.services.get(service)?.has(dateKey)) continue;
      const indexes = profileOf?.get(service);
      starts.forEach((start, i) => {
        const profile = indexes ? profiles?.[indexes[i]!] : undefined;
        const base = dayOffset * MINUTES_PER_DAY + start;
        trips.push({
          departure: base + (profile?.[from.index] ?? from.typical),
          arrival: base + (profile?.[to.index] ?? to.typical),
        });
      });
    }
  }
  return trips.filter((t) => t.departure >= 0).sort((a, b) => a.departure - b.departure);
}

/** Pasos programados por una parada (ver passingTrips). */
export function passingTimes(
  timetables: Timetables,
  lineId: string,
  directionId: number,
  stop: StopAt,
  referenceDateKey: string,
): number[] {
  return passingTrips(timetables, lineId, directionId, stop, stop, referenceDateKey).map(
    (t) => t.departure,
  );
}

/** Días que se miran hacia delante para encontrar el próximo bus (líneas sin servicio en festivos). */
const LOOKAHEAD_DAYS = 7;

/**
 * Próximos pasos desde la hora del reloj (incluida). Si hoy y mañana no hay
 * servicio, sigue buscando hasta una semana (p. ej. líneas que no circulan en
 * domingo). Vacío solo si la línea no tiene horario.
 */
export function nextPassing(
  timetables: Timetables,
  lineId: string,
  directionId: number,
  stop: StopAt,
  clock: ServiceClock,
  count = 3,
): number[] {
  const found: number[] = [];
  // passingTimes ya cubre el día anterior, el de referencia y el siguiente: se avanza de dos en dos.
  for (let day = 0; day < LOOKAHEAD_DAYS && found.length < count; day += 2) {
    const shift = day * MINUTES_PER_DAY;
    const times = passingTimes(timetables, lineId, directionId, stop, addDays(clock.dateKey, day))
      .map((t) => t + shift)
      .filter((t) => t >= clock.minutes && !found.includes(t));
    found.push(...times);
  }
  return found.sort((a, b) => a - b).slice(0, count);
}

/** Fecha (AAAAMMDD) de unos minutos contados desde la medianoche del día de referencia. */
export function dateKeyOf(referenceDateKey: string, minutes: number): string {
  return addDays(referenceDateKey, dayOffsetOf(minutes));
}

/** "18:05" para unos minutos desde la medianoche del día de referencia. */
export function formatClock(minutes: number): string {
  const inDay = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(inDay / 60)).padStart(2, '0')}:${String(inDay % 60).padStart(2, '0')}`;
}

/** 0 = hoy, 1 = mañana... (para avisar de "mañana"). */
export function dayOffsetOf(minutes: number): number {
  return Math.floor(minutes / MINUTES_PER_DAY);
}

/**
 * Instante (ms) de unos minutos contados desde la medianoche de Madrid del día
 * `dateKey`: para programar avisos a la hora de un paso del horario.
 */
export function madridInstantOf(dateKey: string, minutes: number): number {
  const wall = Date.UTC(
    Number(dateKey.slice(0, 4)),
    Number(dateKey.slice(4, 6)) - 1,
    Number(dateKey.slice(6, 8)),
    0,
    minutes,
  );
  // Se corrige la diferencia con la hora de Madrid (dos pasos por los cambios de hora).
  let instant = wall;
  for (let i = 0; i < 2; i++) {
    const clock = madridClock(new Date(instant));
    const shown = Date.UTC(
      Number(clock.dateKey.slice(0, 4)),
      Number(clock.dateKey.slice(4, 6)) - 1,
      Number(clock.dateKey.slice(6, 8)),
      0,
      clock.minutes,
    );
    instant += wall - shown;
  }
  return instant;
}

/** Un viaje programado: su salida y, con horario exacto, sus minutos en cada parada. */
export interface ScheduledTrip {
  /** Salida en minutos desde la medianoche de `dateKey` (negativa si salió el día anterior). */
  readonly start: number;
  readonly profile: readonly number[] | null;
}

/**
 * Viajes de un sentido que circulan el día `dateKey` (incluidos los del día
 * anterior que pasan de medianoche), para casar un autobús en tiempo real con
 * el viaje que está haciendo.
 */
export function scheduledTrips(
  timetables: Timetables,
  lineId: string,
  directionId: number,
  dateKey: string,
): ScheduledTrip[] {
  const key = departuresKey(lineId, directionId);
  const byService = timetables.departures.get(key);
  if (!byService) return [];
  const profiles = timetables.profiles?.get(key);
  const profileOf = timetables.departureProfiles?.get(key);
  const trips: ScheduledTrip[] = [];
  for (const dayOffset of [-1, 0]) {
    const day = addDays(dateKey, dayOffset);
    for (const [service, starts] of byService) {
      if (!timetables.services.get(service)?.has(day)) continue;
      const indexes = profileOf?.get(service);
      starts.forEach((start, i) => {
        const profile = indexes ? (profiles?.[indexes[i]!] ?? null) : null;
        trips.push({ start: dayOffset * MINUTES_PER_DAY + start, profile });
      });
    }
  }
  return trips;
}
