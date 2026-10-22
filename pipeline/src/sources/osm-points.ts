import type { LatLon } from '../build/geometry.ts';
import type { Bbox } from './osm-walk.ts';

/** Nodo de OpenStreetMap que interesa a las capas del mapa. */
export interface OsmPoint {
  id: string;
  point: LatLon;
  kind: 'signal' | 'shelter';
  /** Etiqueta "ref" de la parada (a veces es el código de la EMT). */
  ref?: string;
}

/**
 * Consulta Overpass de los semáforos y de las paradas de autobús con
 * marquesina (`shelter=yes`, en el nodo de la parada o en el andén).
 */
export function osmPointsQuery(bbox: Bbox): string {
  const box = bbox.join(',');
  return (
    `[out:json][timeout:120];(` +
    `node["highway"="traffic_signals"](${box});` +
    `node["highway"="bus_stop"]["shelter"="yes"](${box});` +
    `node["public_transport"="platform"]["bus"="yes"]["shelter"="yes"](${box});` +
    `);out body qt;`
  );
}

interface OsmElement {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  tags?: Record<string, unknown>;
}

/** Lee la respuesta de Overpass (formato JSON). Ignora elementos incompletos. */
export function parseOsmPoints(json: unknown): OsmPoint[] {
  const elements = (json as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) throw new Error('Respuesta de Overpass sin "elements"');
  return (elements as OsmElement[]).flatMap((element): OsmPoint[] => {
    const lat = Number(element.lat);
    const lon = Number(element.lon);
    if (element.type !== 'node' || !Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const tags = element.tags ?? {};
    const id = String(element.id);
    if (tags['highway'] === 'traffic_signals') {
      return [{ id, point: [lat, lon], kind: 'signal' }];
    }
    if (tags['shelter'] === 'yes') {
      const ref = typeof tags['ref'] === 'string' ? tags['ref'].trim() : '';
      return [{ id, point: [lat, lon], kind: 'shelter', ...(ref ? { ref } : {}) }];
    }
    return [];
  });
}
