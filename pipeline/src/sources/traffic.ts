import type { LatLon } from '../build/geometry.ts';

/**
 * Cortes de tráfico del Ayuntamiento e incidencias de la DGT (DATEX II), para
 * mostrarlos en el mapa (Fase 3, opción 5A). Las fechas se publican en hora de
 * Madrid sin zona ("2026-10-06T15:30"), como el resto de horarios de la app.
 */
export interface RawTrafficItem {
  id: string;
  source: 'ayto' | 'dgt';
  /** Tipo: "Obras", "Mudanza"... (Ayuntamiento) o la causa de la DGT. */
  kind: string;
  /** Afectación: "Corte", "Ocupación de calzada"... o la carretera (DGT). */
  effect: string;
  description: string;
  address: string;
  from: string | null;
  to: string | null;
  points: LatLon[];
}

/** Zona de Málaga capital y sus accesos para filtrar las incidencias de la DGT. */
export const MALAGA_AREA = {
  minLat: 36.62,
  maxLat: 36.82,
  minLon: -4.62,
  maxLon: -4.25,
};

function clean(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/** "06/10/2026 15:30" -> "2026-10-06T15:30". */
export function localDate(text: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(text.trim());
  if (!match) return null;
  const [, d, m, y, h = '0', mi = '00'] = match;
  return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}T${h.padStart(2, '0')}:${mi}`;
}

const madridFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Instante ISO con zona ("2026-02-03T16:45:05.000+01:00") -> hora de Madrid sin zona. */
export function madridLocal(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const p = Object.fromEntries(madridFormat.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p['year']}-${p['month']}-${p['day']}T${p['hour']}:${p['minute']}`;
}

/** GeoJSON "da_cortesTrafico-4326" del Ayuntamiento (puntos). */
export function parseMunicipalCuts(geojson: unknown): RawTrafficItem[] {
  const features =
    typeof geojson === 'object' &&
    geojson !== null &&
    Array.isArray((geojson as { features?: unknown }).features)
      ? (geojson as { features: unknown[] }).features
      : [];
  return features.flatMap((feature): RawTrafficItem[] => {
    if (typeof feature !== 'object' || feature === null) return [];
    const { properties, geometry } = feature as {
      properties?: Record<string, unknown>;
      geometry?: { type?: string; coordinates?: unknown };
    };
    if (!properties || geometry?.type !== 'Point' || !Array.isArray(geometry.coordinates))
      return [];
    const [lon, lat] = geometry.coordinates.map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    return [
      {
        id: `ayto-${String(properties['ID'] ?? '')}`,
        source: 'ayto',
        kind: clean(properties['TIPOCORTE']),
        effect: clean(properties['TIPOAFECTACION']),
        description: clean(properties['DESCRIPCION']),
        address: clean(properties['DIRECCION']),
        from: localDate(clean(properties['DESDE'])),
        to: localDate(clean(properties['HASTA'])),
        points: [[lat!, lon!]],
      },
    ];
  });
}

/**
 * Incidencias DATEX II de la DGT dentro de la zona de Málaga. Lectura con
 * expresiones regulares (solo los campos necesarios), sin un analizador XML.
 */
export function parseDgtSituations(xml: string, area = MALAGA_AREA): RawTrafficItem[] {
  const records = xml.match(/<sit:situationRecord [\s\S]*?<\/sit:situationRecord>/g) ?? [];
  return records.flatMap((record): RawTrafficItem[] => {
    const points = [
      ...record.matchAll(
        /<loc:latitude>([-\d.]+)<\/loc:latitude>\s*<loc:longitude>([-\d.]+)<\/loc:longitude>/g,
      ),
    ].map((m): LatLon => [Number(m[1]), Number(m[2])]);
    const inside = points.some(
      ([lat, lon]) =>
        lat >= area.minLat && lat <= area.maxLat && lon >= area.minLon && lon <= area.maxLon,
    );
    if (!inside) return [];
    const first = (pattern: RegExp) => clean(pattern.exec(record)?.[1]);
    const start = first(/<com:overallStartTime>(.*?)</);
    const end = first(/<com:overallEndTime>(.*?)</);
    const road = first(/<loc:roadName>(.*?)</);
    const municipality = first(/<lse:municipality>(.*?)</);
    return [
      {
        id: `dgt-${first(/<sit:situationRecord [^>]*id="([^"]+)"/)}`,
        source: 'dgt',
        kind: first(/<sit:causeType>(.*?)</) || first(/xsi:type="sit:(\w+)"/),
        effect: road,
        description: first(/<com:value lang="es">([\s\S]*?)<\/com:value>/),
        address: [road, municipality].filter(Boolean).join(', '),
        from: start ? madridLocal(start) : null,
        to: end ? madridLocal(end) : null,
        points,
      },
    ];
  });
}
