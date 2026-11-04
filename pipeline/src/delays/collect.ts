/**
 * Uso: node src/delays/collect.ts --history <carpeta> [--rounds 11] [--interval 300]
 *
 * Recogida de retrasos (Fase 10, ADR 0016 y 0024): cada `interval` segundos,
 * `rounds` veces, descarga las previsiones del GTFS-RT de la EMT, calcula
 * cuánto va tarde cada viaje en su próxima parada frente al horario publicado y
 * añade lo nuevo al fichero del día (<carpeta>/AAAAMMDD.csv). Si una vuelta
 * falla, sigue con la siguiente.
 */
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { PUBLISHED_BASE_URL, SOURCES } from '../config.ts';
import type { NetworkFile, TimetablesFile } from '../output-schema.ts';
import { download } from '../sources/fetch.ts';
import { formatObservation, measureDelays, observationKey, parseObservations } from './delays.ts';
import { decodeTripUpdates } from './trip-updates.ts';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      history: { type: 'string' },
      rounds: { type: 'string', default: '11' },
      interval: { type: 'string', default: '300' },
    },
  });
  if (!values.history) throw new Error('Falta --history <carpeta>');
  const rounds = Number(values.rounds);
  const intervalMs = Number(values.interval) * 1000;
  await mkdir(values.history, { recursive: true });

  const json = async <T>(url: string) =>
    JSON.parse(new TextDecoder().decode((await download(url)).bytes)) as T;
  const network = await json<NetworkFile>(`${PUBLISHED_BASE_URL}network.json`);
  const timetables = await json<TimetablesFile>(`${PUBLISHED_BASE_URL}timetables.json`);

  const seen = new Map<string, Set<string>>();
  let saved = 0;
  let failed = 0;
  for (let round = 0; round < rounds; round++) {
    if (round > 0) await new Promise((resolve) => setTimeout(resolve, intervalMs));
    try {
      const trips = decodeTripUpdates((await download(SOURCES.emtTripUpdates.url)).bytes);
      const observations = measureDelays(trips, network, timetables, Date.now() / 1000);
      const byDay = new Map<string, string[]>();
      for (const observation of observations) {
        const day = await seenFor(seen, values.history, observation.dateKey);
        const key = observationKey(observation);
        if (day.has(key)) continue;
        day.add(key);
        const rows = byDay.get(observation.dateKey) ?? [];
        rows.push(formatObservation(observation));
        byDay.set(observation.dateKey, rows);
      }
      for (const [dateKey, rows] of byDay) {
        await appendFile(join(values.history, `${dateKey}.csv`), rows.join('\n') + '\n');
        saved += rows.length;
      }
    } catch (error) {
      failed++;
      console.warn(`Vuelta ${round + 1}:`, error instanceof Error ? error.message : error);
    }
  }
  console.log(`Retrasos: ${saved} datos nuevos en ${rounds} vueltas.`);
  // Si no ha funcionado ninguna vuelta (p. ej. la EMT no responde), que se vea en Actions.
  if (failed === rounds) process.exitCode = 1;
}

/** Datos ya guardados de un día (para no repetirlos), leídos la primera vez que se piden. */
async function seenFor(
  seen: Map<string, Set<string>>,
  folder: string,
  dateKey: string,
): Promise<Set<string>> {
  let day = seen.get(dateKey);
  if (!day) {
    const path = join(folder, `${dateKey}.csv`);
    const rows = existsSync(path) ? parseObservations(dateKey, await readFile(path, 'utf8')) : [];
    day = new Set(rows.map(observationKey));
    seen.set(dateKey, day);
  }
  return day;
}

main().catch((error: unknown) => {
  console.error('Error:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
