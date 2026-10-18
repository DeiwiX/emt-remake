import { SCHEMA_VERSION } from '../config.ts';
import type { TrafficFile } from '../output-schema.ts';
import type { RawTrafficItem } from '../sources/traffic.ts';
import { encodePolyline } from './geometry.ts';

/**
 * Cortes e incidencias vigentes o próximos: se descartan los que ya
 * terminaron (`now` en hora de Madrid, "AAAA-MM-DDTHH:mm").
 */
export function buildTraffic(items: RawTrafficItem[], now: string): TrafficFile {
  const published = items
    .filter((item) => !item.to || item.to >= now)
    .map((item) => ({ ...item, points: encodePolyline(item.points) }))
    .sort((a, b) => (a.from ?? '').localeCompare(b.from ?? '') || a.id.localeCompare(b.id));
  return { schemaVersion: SCHEMA_VERSION, items: published };
}
