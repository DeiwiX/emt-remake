/**
 * Uso: node src/main.ts --out <carpeta> [--previous <manifest.json anterior>]
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

import { LICENSE, SCHEMA_VERSION, SOURCES } from './config.ts';
import { buildDataset } from './build/build-dataset.ts';
import { checkPlausibility } from './build/sanity.ts';
import type { FileEntry, Manifest } from './output-schema.ts';
import { parseEmtLines } from './sources/emt-lines.ts';
import { download } from './sources/fetch.ts';
import { parseGtfsZip } from './sources/gtfs.ts';
import { parseZonesCsv } from './sources/zones.ts';
import { buildZones } from './build/build-zones.ts';
import { buildTimetables, countDepartures } from './build/build-timetables.ts';
import { ValidationError } from './validation.ts';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { out: { type: 'string' }, previous: { type: 'string' } },
  });
  if (!values.out) throw new Error('Falta --out <carpeta>');

  const [emtRaw, gtfsRaw, neighbourhoodsRaw, districtsRaw] = await Promise.all([
    download(SOURCES.emtLines.url),
    download(SOURCES.gtfs.url),
    download(SOURCES.neighbourhoods.url),
    download(SOURCES.districts.url),
  ]);
  const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

  const emtLines = parseEmtLines(JSON.parse(new TextDecoder().decode(emtRaw.bytes)));
  const gtfs = parseGtfsZip(gtfsRaw.bytes);
  const dataset = buildDataset(emtLines, gtfs);
  const zones = buildZones(
    [
      ...parseZonesCsv(decode(districtsRaw.bytes), 'district'),
      ...parseZonesCsv(decode(neighbourhoodsRaw.bytes), 'neighbourhood'),
    ],
    dataset.network.stops,
  );
  const timetables = buildTimetables(dataset.network, gtfs.trips, gtfs.serviceDates);

  const counts: Manifest['counts'] = {
    lines: dataset.network.lines.length,
    stops: dataset.network.stops.length,
    shapes: Object.keys(dataset.shapesDetail.shapes).length,
    approximateShapes: dataset.report.approximateDirections.length,
    zones: zones.zones.length,
    departures: countDepartures(timetables),
  };
  checkPlausibility(counts, await readPreviousCounts(values.previous));

  const contents = {
    network: JSON.stringify(dataset.network),
    shapesOverview: JSON.stringify(dataset.shapesOverview),
    shapesDetail: JSON.stringify(dataset.shapesDetail),
    zones: JSON.stringify(zones),
    timetables: JSON.stringify(timetables),
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
  };

  const manifest: Manifest = {
    schemaVersion: SCHEMA_VERSION,
    dataVersion: sha256(
      Object.values(files)
        .map((f) => f.sha256)
        .join(''),
    ).slice(0, 16),
    generatedAt: new Date().toISOString(),
    counts,
    files,
    sources: [
      { ...SOURCES.emtLines, lastModified: emtRaw.lastModified },
      { ...SOURCES.gtfs, lastModified: gtfsRaw.lastModified },
      { ...SOURCES.neighbourhoods, lastModified: neighbourhoodsRaw.lastModified },
      { ...SOURCES.districts, lastModified: districtsRaw.lastModified },
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
    writeFile(join(values.out, 'report.json'), JSON.stringify(dataset.report, null, 2)),
  ]);
  // El manifest se escribe el último: solo existe si todo lo anterior ha ido bien.
  await writeFile(join(values.out, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(
    `Datos ${manifest.dataVersion}: ${counts.lines} líneas, ${counts.stops} paradas, ` +
      `${counts.shapes} trazados (${counts.approximateShapes} aproximados), ${counts.zones} zonas, ${counts.departures} salidas, ` +
      `${dataset.report.stopConflicts.length} conflictos de paradas.`,
  );
}

async function readPreviousCounts(
  path: string | undefined,
): Promise<Partial<Manifest['counts']> | null> {
  if (!path || !existsSync(path)) return null;
  const previous = JSON.parse(await readFile(path, 'utf8')) as Partial<Manifest>;
  return previous.counts ?? null;
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

main().catch((error: unknown) => {
  const prefix = error instanceof ValidationError ? 'Datos no válidos, no se publica' : 'Error';
  console.error(`${prefix}:`, error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
