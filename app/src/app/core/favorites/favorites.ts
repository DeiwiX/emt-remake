import { Place } from '../planner/planner';
import { Stop, Zone } from '../models/network.model';

/**
 * Favoritos (Fase 2): paradas, líneas y trayectos de "Cómo llegar". Lógica
 * pura, sin Angular, para poder probarla de forma aislada.
 */

/** Referencia a un lugar de "Cómo llegar": parada, barrio o distrito. */
export interface PlaceRef {
  readonly kind: 'stop' | 'neighbourhood' | 'district';
  readonly id: string;
  /** Nombre en el momento de guardarlo; se muestra si el lugar ya no existe. */
  readonly name: string;
}

export type Favorite =
  | { readonly kind: 'stop'; readonly stopId: string }
  | { readonly kind: 'line'; readonly lineId: string }
  | { readonly kind: 'trip'; readonly origin: PlaceRef; readonly destination: PlaceRef };

/** Clave única de un favorito: sirve para saber si ya está guardado. */
export function favoriteKey(favorite: Favorite): string {
  switch (favorite.kind) {
    case 'stop':
      return `stop:${favorite.stopId}`;
    case 'line':
      return `line:${favorite.lineId}`;
    case 'trip':
      return `trip:${favorite.origin.kind}:${favorite.origin.id}>${favorite.destination.kind}:${favorite.destination.id}`;
  }
}

const PLACE_KINDS: readonly string[] = ['stop', 'neighbourhood', 'district'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parsePlace(value: unknown): PlaceRef | null {
  if (!isRecord(value)) return null;
  const { kind, id, name } = value;
  if (typeof kind !== 'string' || !PLACE_KINDS.includes(kind)) return null;
  if (typeof id !== 'string' || typeof name !== 'string') return null;
  return { kind: kind as PlaceRef['kind'], id, name };
}

function parseFavorite(value: unknown): Favorite | null {
  if (!isRecord(value)) return null;
  switch (value['kind']) {
    case 'stop':
      return typeof value['stopId'] === 'string' ? { kind: 'stop', stopId: value['stopId'] } : null;
    case 'line':
      return typeof value['lineId'] === 'string' ? { kind: 'line', lineId: value['lineId'] } : null;
    case 'trip': {
      const origin = parsePlace(value['origin']);
      const destination = parsePlace(value['destination']);
      return origin && destination ? { kind: 'trip', origin, destination } : null;
    }
    default:
      return null;
  }
}

/** Lee la lista guardada descartando entradas dañadas, desconocidas o repetidas. */
export function parseFavorites(raw: string | null): Favorite[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const favorites: Favorite[] = [];
  for (const item of parsed) {
    const favorite = parseFavorite(item);
    if (!favorite || seen.has(favoriteKey(favorite))) continue;
    seen.add(favoriteKey(favorite));
    favorites.push(favorite);
  }
  return favorites;
}

/** Lugar guardado -> referencia: lo que se guarda de un origen o destino. */
export function toPlaceRef(place: Place): PlaceRef {
  return { kind: place.kind, id: place.id, name: place.name };
}

/** "stop:152" o "neighbourhood:b12": así viajan los lugares en la URL de "Cómo llegar". */
export function placeParam(place: PlaceRef): string {
  return `${place.kind}:${place.id}`;
}

/**
 * Referencia ("stop:152") -> lugar con sus paradas, con los datos actuales.
 * null si el texto no es válido o el lugar ya no existe.
 */
export function resolvePlace(
  param: string | undefined,
  getStop: (id: string) => Stop | undefined,
  zones: readonly Zone[],
): Place | null {
  const separator = param?.indexOf(':') ?? -1;
  if (!param || separator < 1) return null;
  const kind = param.slice(0, separator);
  const id = param.slice(separator + 1);
  if (kind === 'stop') {
    const stop = getStop(id);
    return stop ? { kind: 'stop', id, name: stop.name, stopIds: [id] } : null;
  }
  const zone = zones.find((z) => z.kind === kind && z.id === id);
  return zone ? { kind: zone.kind, id, name: zone.name, stopIds: zone.stopIds } : null;
}
