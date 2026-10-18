import {
  ValidationError,
  isRecord,
  requireMalagaCoordinate,
  requireNumber,
  requireString,
} from '../validation.ts';

export interface EmtStop {
  code: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
}

export interface EmtDirection {
  /** 1 = ida, 2 = vuelta, según la fuente. */
  sentido: number;
  stops: EmtStop[];
}

export interface EmtLine {
  code: string;
  name: string;
  notes: string;
  /**
   * Cabecera donde empieza el sentido 1. Deducido de los datos del 03/10/2026:
   * en las líneas 3, 5 y 7 la primera parada del sentido 1 está en "cabeceraIda".
   */
  originHead: string;
  /** Cabecera donde termina el sentido 1; vacía en líneas de un solo sentido. */
  returnHead: string;
  directions: EmtDirection[];
}

/** Valida y normaliza el JSON de "Líneas y paradas autobuses EMT". */
export function parseEmtLines(json: unknown): EmtLine[] {
  if (!Array.isArray(json)) throw new ValidationError('Líneas EMT: se esperaba una lista');
  return json.map((raw: unknown, index) => parseLine(raw, `Líneas EMT[${index}]`));
}

function parseLine(raw: unknown, where: string): EmtLine {
  if (!isRecord(raw)) throw new ValidationError(`${where}: se esperaba un objeto`);
  const code = requireString(raw['userCodLinea'], `${where}.userCodLinea`);
  if (!code) throw new ValidationError(`${where}: línea sin código`);
  const lineWhere = `Línea ${code}`;

  const entries = raw['paradas'];
  if (!Array.isArray(entries)) throw new ValidationError(`${lineWhere}: falta la lista de paradas`);

  const bySentido = new Map<number, { order: number; stop: EmtStop }[]>();
  entries.forEach((entry: unknown, i) => {
    const entryWhere = `${lineWhere}.paradas[${i}]`;
    if (!isRecord(entry) || !isRecord(entry['parada'])) {
      throw new ValidationError(`${entryWhere}: formato inesperado`);
    }
    const sentido = requireNumber(entry['sentido'], `${entryWhere}.sentido`);
    const order = requireNumber(entry['orden'], `${entryWhere}.orden`);
    const list = bySentido.get(sentido) ?? [];
    list.push({ order, stop: parseStop(entry['parada'], entryWhere) });
    bySentido.set(sentido, list);
  });
  if (bySentido.size === 0) throw new ValidationError(`${lineWhere}: no tiene paradas`);

  const directions = [...bySentido.entries()]
    .sort(([a], [b]) => a - b)
    .map(([sentido, list]) => ({
      sentido,
      stops: list.sort((a, b) => a.order - b.order).map((e) => e.stop),
    }));

  return {
    code,
    name: requireString(raw['nombreLinea'], `${lineWhere}.nombreLinea`),
    notes: optionalString(raw['observaciones']),
    originHead: optionalString(raw['cabeceraIda']),
    returnHead: optionalString(raw['cabeceraVuelta']),
    directions,
  };
}

function parseStop(raw: Record<string, unknown>, where: string): EmtStop {
  const code = String(requireNumber(raw['codParada'], `${where}.codParada`));
  const lat = requireNumber(raw['latitud'], `${where}.latitud`);
  const lon = requireNumber(raw['longitud'], `${where}.longitud`);
  requireMalagaCoordinate(lat, lon, `${where} (parada ${code})`);
  return {
    code,
    name: requireString(raw['nombreParada'], `${where}.nombreParada`),
    address: optionalString(raw['direccion']),
    lat,
    lon,
  };
}

function optionalString(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}
