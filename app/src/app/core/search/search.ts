import { Line, Stop } from '../models/network.model';

/**
 * Búsqueda de líneas y paradas (RF-05). Lógica pura, sin Angular, para poder
 * probarla de forma aislada (RNF-08).
 */

/** Minúsculas, sin tildes ni diéresis y con espacios normalizados: "Málaga " -> "malaga". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

/** Puntuación de una coincidencia: menor es mejor; null si no coincide. */
type Score = number | null;

const RANK = {
  exactCode: 0,
  codePrefix: 1,
  namePrefix: 2,
  nameContains: 3,
} as const;

function scoreText(query: string, code: string, name: string): Score {
  const normalizedCode = normalize(code);
  if (normalizedCode === query) return RANK.exactCode;
  if (normalizedCode.startsWith(query)) return RANK.codePrefix;

  const normalizedName = normalize(name);
  const tokens = query.split(' ');
  // Todas las palabras de la búsqueda deben aparecer en el nombre, en cualquier orden.
  if (!tokens.every((token) => normalizedName.includes(token))) return null;
  return normalizedName.startsWith(query) ? RANK.namePrefix : RANK.nameContains;
}

function rank<T>(items: readonly T[], score: (item: T) => Score, limit: number): T[] {
  return (
    items
      .map((item, index) => ({ item, index, score: score(item) }))
      .filter((r): r is { item: T; index: number; score: number } => r.score !== null)
      // A igual puntuación se respeta el orden original (las listas ya vienen ordenadas).
      .sort((a, b) => a.score - b.score || a.index - b.index)
      .slice(0, limit)
      .map((r) => r.item)
  );
}

/** Líneas por código ("C1", "1") o por nombre ("alameda"). */
export function searchLines(lines: readonly Line[], rawQuery: string, limit = 20): Line[] {
  const query = normalize(rawQuery);
  if (!query) return [];
  return rank(lines, (line) => scoreText(query, line.id, line.name), limit);
}

/** Paradas por código ("152") o por nombre ("postas lorenza"). */
export function searchStops(stops: readonly Stop[], rawQuery: string, limit = 20): Stop[] {
  const query = normalize(rawQuery);
  if (!query) return [];
  return rank(stops, (stop) => scoreText(query, stop.id, stop.name), limit);
}
