/**
 * Uso: node src/main.ts --out <carpeta> [--previous <manifest.json anterior>]
 *        [--previous-data <carpeta con network, shapes-* y timetables anteriores>]
 *
 * Descarga las fuentes, las valida y cruza, y escribe en <carpeta> los ficheros
 * para la app. Si algo no es válido termina con código 1 sin escribir nada, de
 * modo que la publicación anterior se mantiene.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { LICENSE, SCHEMA_VERSION, SIMPLIFY_TOLERANCE_M, SOURCES } from './config.ts';
import { resolveWalkGraph } from './build/walk-graph-source.ts';
import { buildDataset, encodeShapes } from './build/build-dataset.ts';
import { buildMetro, mergeTimetables } from './build/build-metro.ts';
import {
  type PreviousData,
  type PublishedMetro,
  metroFromPrevious,
} from './build/previous-metro.ts';
import { checkPlausibility } from './build/sanity.ts';
import type { FileEntry, Manifest } from './output-schema.ts';
import { parseEmtLines } from './sources/emt-lines.ts';
import { download } from './sources/fetch.ts';
import { parseGtfsZip } from './sources/gtfs.ts';
import { parseZonesCsv } from './sources/zones.ts';
import { buildZones } from './build/build-zones.ts';
import { buildStreets } from './build/build-streets.ts';
import { parseStreets } from './sources/streets.ts';
import { buildTraffic } from './build/build-traffic.ts';
import {
  type RawTrafficItem,
  madridLocal,
  parseDgtSituations,
  parseMunicipalCuts,
} from './sources/traffic.ts';
import { buildTimetables, countDepartures } from './build/build-timetables.ts';
import { ValidationError } from './validation.ts';
import { aggregateDelays, historyDays, parseObservations } from './delays/delays.ts';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      out: { type: 'string' },
      previous: { type: 'string' },
      'previous-walk': { type: 'string' },
      'delays-history': { type: 'string' },
      'previous-data': { type: 'string' },
    },
  });
  if (!values.out) throw new Error('Falta --out <carpeta>');

  const [
    emtRaw,
    gtfsRaw,
    neighbourhoodsRaw,
    districtsRaw,
    streetsRaw,
    streetTypesRaw,
    streetNumbersRaw,
  ] = await Promise.all([
    download(SOURCES.emtLines.url),
    download(SOURCES.gtfs.url),
    download(SOURCES.neighbourhoods.url),
    download(SOURCES.districts.url),
    download(SOURCES.streets.url),
    download(SOURCES.streetTypes.url),
    download(SOURCES.streetNumbers.url),
  ]);
  const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

  const emtLines = parseEmtLines(JSON.parse(new TextDecoder().decode(emtRaw.bytes)));
  const gtfs = parseGtfsZip(gtfsRaw.bytes);
  const dataset = buildDataset(emtLines, gtfs);
  // Metro de Málaga (Fase 11): opcional. Si su GTFS falla se mantiene el metro de la
  // publicación anterior (--previous-data) y, si tampoco lo hay, se publica sin metro.
  // Va antes de las zonas para que sus estaciones cuenten en barrios y distritos.
  let metro: PublishedMetro | null = null;
  const metroSources: Manifest['sources'] = [];
  try {
    const raw = await download(SOURCES.metro.url);
    const built = buildMetro(raw.bytes);
    metro = {
      lines: built.lines,
      stops: built.stops,
      shapesOverview: encodeShapes(built.geometries, SIMPLIFY_TOLERANCE_M.overview).shapes,
      shapesDetail: encodeShapes(built.geometries, SIMPLIFY_TOLERANCE_M.detail).shapes,
      timetables: built.timetables,
    };
    metroSources.push({ ...SOURCES.metro, lastModified: raw.lastModified });
  } catch (error) {
    console.warn('Sin metro nuevo:', error instanceof Error ? error.message : error);
    const previous = await readPreviousData(values['previous-data']);
    metro = previous ? metroFromPrevious(previous) : null;
    if (metro) {
      const previousSource = (await readPreviousManifest(values.previous))?.sources?.find(
        (source) => source.url === SOURCES.metro.url,
      );
      metroSources.push({
        ...SOURCES.metro,
        lastModified: previousSource?.lastModified ?? null,
      });
      console.warn('Se mantiene el metro de la publicación anterior.');
    }
  }
  if (metro) {
    dataset.network.lines.push(...metro.lines);
    dataset.network.stops.push(...metro.stops);
    Object.assign(dataset.shapesOverview.shapes, metro.shapesOverview);
    Object.assign(dataset.shapesDetail.shapes, metro.shapesDetail);
    console.log(`Metro: ${metro.lines.length} líneas y ${metro.stops.length} estaciones.`);
  }

  const zones = buildZones(
    [
      ...parseZonesCsv(decode(districtsRaw.bytes), 'district'),
      ...parseZonesCsv(decode(neighbourhoodsRaw.bytes), 'neighbourhood'),
    ],
    dataset.network.stops,
  );
  let timetables = buildTimetables(dataset.network, gtfs.trips, gtfs.serviceDates);
  if (metro) timetables = mergeTimetables(timetables, metro.timetables);

  const streets = buildStreets(
    parseStreets(
      decode(streetsRaw.bytes),
      decode(streetTypesRaw.bytes),
      decode(streetNumbersRaw.bytes),
    ),
  );

  // Tráfico: opcional. Si alguna fuente falla se publica sin ella (y sin tráfico si fallan las dos).
  const trafficItems: RawTrafficItem[] = [];
  const trafficSources: Manifest['sources'] = [];
  try {
    const raw = await download(SOURCES.trafficCuts.url);
    trafficItems.push(...parseMunicipalCuts(JSON.parse(decode(raw.bytes))));
    trafficSources.push({
      ...SOURCES.trafficCuts,
      lastModified: raw.lastModified,
    });
  } catch (error) {
    console.warn(
      'Sin cortes de tráfico del Ayuntamiento:',
      error instanceof Error ? error.message : error,
    );
  }
  try {
    const raw = await download(SOURCES.dgtSituations.url);
    trafficItems.push(...parseDgtSituations(decode(raw.bytes)));
    trafficSources.push({
      ...SOURCES.dgtSituations,
      lastModified: raw.lastModified,
    });
  } catch (error) {
    console.warn('Sin incidencias de la DGT:', error instanceof Error ? error.message : error);
  }
  const traffic =
    trafficSources.length > 0
      ? buildTraffic(trafficItems, madridLocal(new Date().toISOString())!)
      : null;

  // Red peatonal: opcional, se reutiliza la publicada si tiene menos de una semana.
  const walk = await resolveWalkGraph(
    values['previous-walk'] && existsSync(values['previous-walk'])
      ? await readFile(values['previous-walk'], 'utf8')
      : null,
    dataset.network.stops,
    new Date(),
  );

  // Retrasos habituales (Fase 10): opcional, del histórico de la rama historico-retrasos.
  const delays = values['delays-history'] ? await buildDelays(values['delays-history']) : null;

  const counts: Manifest['counts'] = {
    lines: dataset.network.lines.length,
    stops: dataset.network.stops.length,
    shapes: Object.keys(dataset.shapesDetail.shapes).length,
    approximateShapes: dataset.report.approximateDirections.length,
    zones: zones.zones.length,
    departures: countDepartures(timetables),
    streets: streets.streets.length,
  };
  checkPlausibility(counts, await readPreviousCounts(values.previous));

  const contents = {
    network: JSON.stringify(dataset.network),
    shapesOverview: JSON.stringify(dataset.shapesOverview),
    shapesDetail: JSON.stringify(dataset.shapesDetail),
    zones: JSON.stringify(zones),
    timetables: JSON.stringify(timetables),
    streets: JSON.stringify(streets),
    traffic: traffic ? JSON.stringify(traffic) : null,
  };
  const entry = (path: string, content: string): FileEntry => ({
    path,
    bytes: Buffer.byteLength(content),
    sha256: sha256(content),
  });
  const files = {
    network: entry('network.json', contents.network),
    shapesOverview: entry('shapes-overview.json', contents.shapesOverview),
    shapesDetail: entry('shapes-detail.json', contents.shapesDetail),
    zones: entry('zones.json', contents.zones),
    timetables: entry('timetables.json', contents.timetables),
    streets: entry('streets.json', contents.streets),
  };
  const trafficEntry = contents.traffic ? entry('traffic.json', contents.traffic) : null;
  const walkEntry = walk ? entry('walk-graph.json', walk.content) : null;
  const delaysEntry = delays ? entry('delays.json', delays) : null;

  const manifest: Manifest = {
    schemaVersion: SCHEMA_VERSION,
    dataVersion: sha256(
      Object.values(files)
        .map((f) => f.sha256)
        .join(''),
    ).slice(0, 16),
    generatedAt: new Date().toISOString(),
    counts,
    // El tráfico no cuenta en dataVersion: cambia cada hora y no debe obligar a la app
    // a descargar de nuevo la red.
    // Tampoco la red peatonal, que se renueva cada semana y la app descarga aparte,
    // ni los retrasos habituales, que cambian cada hora con el histórico.
    files: {
      ...files,
      ...(trafficEntry ? { traffic: trafficEntry } : {}),
      ...(walkEntry ? { walkGraph: walkEntry } : {}),
      ...(delaysEntry ? { delays: delaysEntry } : {}),
    },
    sources: [
      { ...SOURCES.emtLines, lastModified: emtRaw.lastModified },
      { ...SOURCES.gtfs, lastModified: gtfsRaw.lastModified },
      {
        ...SOURCES.neighbourhoods,
        lastModified: neighbourhoodsRaw.lastModified,
      },
      { ...SOURCES.districts, lastModified: districtsRaw.lastModified },
      { ...SOURCES.streets, lastModified: streetsRaw.lastModified },
      { ...SOURCES.streetTypes, lastModified: streetTypesRaw.lastModified },
      { ...SOURCES.streetNumbers, lastModified: streetNumbersRaw.lastModified },
      ...trafficSources,
      ...metroSources,
      ...(walk ? [{ ...SOURCES.osmWalk, lastModified: walk.builtAt }] : []),
    ],
    license: { ...LICENSE },
  };

  await mkdir(values.out, { recursive: true });
  await Promise.all([
    writeFile(join(values.out, files.network.path), contents.network),
    writeFile(join(values.out, files.shapesOverview.path), contents.shapesOverview),
    writeFile(join(values.out, files.shapesDetail.path), contents.shapesDetail),
    writeFile(join(values.out, files.zones.path), contents.zones),
    writeFile(join(values.out, files.timetables.path), contents.timetables),
    writeFile(join(values.out, files.streets.path), contents.streets),
    ...(trafficEntry && contents.traffic
      ? [writeFile(join(values.out, trafficEntry.path), contents.traffic)]
      : []),
    ...(walkEntry && walk ? [writeFile(join(values.out, walkEntry.path), walk.content)] : []),
    ...(delaysEntry && delays ? [writeFile(join(values.out, delaysEntry.path), delays)] : []),
    writeFile(join(values.out, 'report.json'), JSON.stringify(dataset.report, null, 2)),
  ]);
  // El manifest se escribe el último: solo existe si todo lo anterior ha ido bien.
  await writeFile(join(values.out, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(
    `Datos ${manifest.dataVersion}: ${counts.lines} líneas, ${counts.stops} paradas, ` +
      `${counts.shapes} trazados (${counts.approximateShapes} aproximados), ${counts.zones} zonas, ${counts.departures} salidas, ${counts.streets} calles, ${traffic?.items.length ?? 0} cortes e incidencias, ` +
      `red peatonal ${walk ? `${walk.edges} tramos (${walk.reused ? 'reutilizada' : 'nueva'})` : 'no disponible'}, ` +
      `${dataset.report.stopConflicts.length} conflictos de paradas.`,
  );
}

/** delays.json a partir de los ficheros del histórico de las últimas 8 semanas (null sin datos). */
async function buildDelays(folder: string): Promise<string | null> {
  const today = madridLocal(new Date().toISOString())!.slice(0, 10).replaceAll('-', '');
  const observations = [];
  let days = 0;
  for (const day of historyDays(today)) {
    const path = join(folder, `${day}.csv`);
    if (!existsSync(path)) continue;
    observations.push(...parseObservations(day, await readFile(path, 'utf8')));
    days++;
  }
  if (days === 0) return null;
  const file = aggregateDelays(observations, days, SCHEMA_VERSION);
  console.log(`Retrasos habituales: ${observations.length} datos de ${days} días.`);
  return JSON.stringify(file);
}

async function readPreviousManifest(path: string | undefined): Promise<Partial<Manifest> | null> {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8')) as Partial<Manifest>;
}

async function readPreviousCounts(
  path: string | undefined,
): Promise<Partial<Manifest['counts']> | null> {
  return (await readPreviousManifest(path))?.counts ?? null;
}

/** Ficheros de la publicación anterior (null si falta alguno o no se pueden leer). */
async function readPreviousData(folder: string | undefined): Promise<PreviousData | null> {
  if (!folder) return null;
  try {
    const read = async <T>(name: string) =>
      JSON.parse(await readFile(join(folder, name), 'utf8')) as T;
    return {
      network: await read('network.json'),
      shapesOverview: await read('shapes-overview.json'),
      shapesDetail: await read('shapes-detail.json'),
      timetables: await read('timetables.json'),
    };
  } catch {
    return null;
  }
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

main().catch((error: unknown) => {
  const prefix = error instanceof ValidationError ? 'Datos no válidos, no se publica' : 'Error';
  console.error(`${prefix}:`, error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
