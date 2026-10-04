import { placeForStreet } from '../location/street-place';
import { Place } from '../planner/planner';
import { Stop, Street, Zone } from '../models/network.model';

/**
 * Favoritos (Fase 2): paradas, líneas y trayectos de "Cómo llegar". Lógica
 * pura, sin Angular, para poder probarla de forma aislada.
 */

/** Referencia a un lugar de "Cómo llegar": parada, barrio, distrito o calle (con o sin número). */
export interface PlaceRef {
  readonly kind: 'stop' | 'neighbourhood' | 'district' | 'street' | 'address';
  readonly id: string;
  /** Nombre en el momento de guardarlo; se muestra si el lugar ya no existe. */
  readonly name: string;
}

export type Favorite =
  /** `alias`: nombre propio que le pone el usuario ("Casa", "Trabajo"). */
  | { readonly kind: 'stop'; readonly stopId: string; readonly alias?: string }
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

const PLACE_KINDS: readonly string[] = ['stop', 'neighbourhood', 'district', 'street', 'address'];
/** Longitud máxima del nombre propio de una parada. */
export const MAX_ALIAS_LENGTH = 30;

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
    case 'stop': {
      if (typeof value['stopId'] !== 'string') return null;
      const alias = cleanAlias(value['alias']);
      return alias
        ? { kind: 'stop', stopId: value['stopId'], alias }
        : { kind: 'stop', stopId: value['stopId'] };
    }
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

/** Nombre propio válido (recortado y sin exceder el máximo) o undefined. */
export function cleanAlias(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const alias = value.trim().replace(/\s+/g, ' ').slice(0, MAX_ALIAS_LENGTH);
  return alias || undefined;
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

/**
 * Lugar -> referencia: lo que se guarda de un origen o destino. "Mi ubicación"
 * no se guarda (cambia cada vez y no debe quedar registrada): devuelve null.
 */
export function toPlaceRef(place: Place): PlaceRef | null {
  return place.kind === 'location' ? null : { kind: place.kind, id: place.id, name: place.name };
}

/** "stop:152" o "neighbourhood:b12": así viajan los lugares en la URL de "Cómo llegar". */
export function placeParam(place: PlaceRef): string {
  return `${place.kind}:${place.id}`;
}

/** Datos con los que se resuelve una referencia guardada o de la URL. */
export interface PlaceData {
  readonly stops: readonly Stop[];
  readonly getStop: (id: string) => Stop | undefined;
  readonly zones: readonly Zone[];
  readonly streets: readonly Street[];
}

/**
 * Referencia ("stop:152", "street:6300", "address:6300#5") -> lugar con sus
 * paradas, con los datos actuales. null si el texto no es válido o el lugar ya
 * no existe (o aún no se han cargado sus datos).
 */
export function resolvePlace(param: string | undefined, data: PlaceData): Place | null {
  const separator = param?.indexOf(':') ?? -1;
  if (!param || separator < 1) return null;
  const kind = param.slice(0, separator);
  const id = param.slice(separator + 1);
  if (kind === 'stop') {
    const stop = data.getStop(id);
    return stop ? { kind: 'stop', id, name: stop.name, stopIds: [id] } : null;
  }
  if (kind === 'street' || kind === 'address') {
    const [streetId, numberText] = id.split('#');
    const street = data.streets.find((s) => s.id === streetId);
    if (!street) return null;
    const number = kind === 'address' ? Number(numberText) : null;
    if (number !== null && !Number.isInteger(number)) return null;
    return placeForStreet(street, number, data.stops);
  }
  const zone = data.zones.find((z) => z.kind === kind && z.id === id);
  return zone ? { kind: zone.kind, id, name: zone.name, stopIds: zone.stopIds } : null;
}

/** true si la referencia necesita las calles para resolverse. */
export function needsStreets(param: string | undefined): boolean {
  return !!param && (param.startsWith('street:') || param.startsWith('address:'));
}
