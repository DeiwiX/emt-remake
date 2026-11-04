// TEMPORAL: diagnóstico de la recogida (se quita antes de unir).
import { PUBLISHED_BASE_URL, SOURCES } from '../config.ts';
import type { NetworkFile, TimetablesFile } from '../output-schema.ts';
import { download } from '../sources/fetch.ts';
import { measureDelays } from './delays.ts';
import { decodeTripUpdates } from './trip-updates.ts';

const json = async <T>(url: string) =>
  JSON.parse(new TextDecoder().decode((await download(url)).bytes)) as T;
const network = await json<NetworkFile>(`${PUBLISHED_BASE_URL}network.json`);
const tt = await json<TimetablesFile>(`${PUBLISHED_BASE_URL}timetables.json`);
const trips = decodeTripUpdates((await download(SOURCES.emtTripUpdates.url)).bytes);
const now = Date.now() / 1000;
console.log('viajes', trips.length, 'ahora', new Date().toISOString());
const obs = measureDelays(trips, network, tt, now);
const d = obs.map((o) => o.delay).sort((a, b) => a - b);
const q = (p: number) => d[Math.floor(p * (d.length - 1))];
console.log('obs', d.length, 'p10', q(0.1), 'p25', q(0.25), 'p50', q(0.5), 'p75', q(0.75), 'p90', q(0.9));
// Compara con el horario por salida (perfiles), como enseña la app.
let n = 0;
const diffs: number[] = [];
for (const o of obs) {
  const trip = trips.find((t) => t.tripId === o.trip)!;
  const [h, m] = trip.startTime.split(':').map(Number);
  const start = h! * 60 + m!;
  const key = `${o.lineId}|${o.directionId}`;
  const dir = network.lines.find((l) => l.id === o.lineId)?.directions.find((x) => x.id === o.directionId);
  for (const [service, starts] of Object.entries(tt.departures[key] ?? {})) {
    if (!tt.services[service]?.includes(trip.startDate)) continue;
    const i = starts.indexOf(start);
    if (i < 0) continue;
    const pi = tt.departureProfiles?.[key]?.[service]?.[i];
    const prof = (pi !== undefined && tt.profiles?.[key]?.[pi]) || dir!.minutes!;
    const sched = start + prof[o.stopIndex]!;
    const diff = o.seconds / 60 - sched;
    diffs.push(Math.round(diff * 10) / 10);
    if (n++ < 15) console.log(o.trip, o.lineId, o.directionId, 'idx', o.stopIndex, 'delay', o.delay, 'patrón-perfil', diff, 'start', trip.startTime, 'stops', JSON.stringify(trip.stops.slice(0, 3)));
  }
}
diffs.sort((a, b) => a - b);
console.log('casados con perfil', diffs.length, 'diferencias patrón-perfil min/med/max', diffs[0], diffs[diffs.length >> 1], diffs[diffs.length - 1]);
