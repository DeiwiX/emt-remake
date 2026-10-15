/**
 * Avisos de la EMT (Fase 7): desvíos, paradas trasladadas e incidencias que la
 * EMT publica en las noticias de su web (canal RSS). El canal solo trae los 6
 * últimos y sin fecha de fin, así que la app los guarda en el dispositivo y
 * los muestra un tiempo fijo desde que se publican (decisión del
 * desarrollador, 15/10/2026). ADR 0014.
 */
export interface EmtNotice {
  /** Número de la noticia en la web de la EMT. */
  readonly id: string;
  readonly title: string;
  /** Texto del aviso, sin formato. */
  readonly summary: string;
  /** Instante de publicación (ms desde 1970). */
  readonly publishedAt: number;
  /** Página del aviso en la web de la EMT. */
  readonly url: string;
  /** Líneas que nombra el título ("L-15-18-N2: ..."); vacío si es general. */
  readonly lines: readonly string[];
}

export const EMT_SITE = 'https://www.emtmalaga.es';
const DAY_MS = 24 * 60 * 60_000;
/** Un aviso de una línea se ve 60 días desde que se publica. */
export const LINE_NOTICE_DAYS = 60;
/** Uno general (sin líneas en el título, p. ej. un evento) solo 7 días. */
export const GENERAL_NOTICE_DAYS = 7;

/**
 * Líneas del título: "L-15-18-N2: ..." → 15, 18, N2; "L-C5: ..." → C5. Solo se
 * mira el principio del título, que es como la EMT las nombra; un título sin
 * ese prefijo es un aviso general.
 */
export function noticeLines(title: string): string[] {
  const prefix = /^\s*L-\s*([^:]+):/i.exec(title)?.[1];
  if (!prefix) return [];
  const codes = prefix
    .split(/\s*(?:-|,|\/|\by\b)\s*|\s+/i)
    .map((code) => code.replace(/^L-?/i, '').trim().toUpperCase())
    .filter((code) => /^[A-Z]{0,2}\d{0,3}[A-Z]?$/.test(code) && code !== '');
  return [...new Set(codes)];
}

/** true mientras el aviso se debe ver. */
export function isVisible(notice: EmtNotice, now: number): boolean {
  const days = notice.lines.length > 0 ? LINE_NOTICE_DAYS : GENERAL_NOTICE_DAYS;
  return now - notice.publishedAt <= days * DAY_MS;
}

/**
 * Interpreta el canal RSS de la EMT. Los enlaces del canal apuntan a una IP
 * interna de la EMT: se rehacen con la dirección pública de la web. Se quedan
 * fuera las entradas que no son noticias (la portada) y las mal formadas.
 */
export function parseNoticeFeed(xml: string): EmtNotice[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const notices: EmtNotice[] = [];
  for (const item of Array.from(doc.getElementsByTagName('item'))) {
    const text = (tag: string) => item.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';
    const title = text('title');
    const node = /\/node\/(\d+)/.exec(text('link'));
    const publishedAt = Date.parse(text('pubDate'));
    if (!title || !node || Number.isNaN(publishedAt)) continue;
    const [path, id] = node;
    notices.push({
      id,
      title,
      summary: summaryOf(text('description')),
      publishedAt,
      url: `${EMT_SITE}/es${path}`,
      lines: noticeLines(title),
    });
  }
  return notices;
}

/** Texto del cuerpo de la noticia (la descripción es HTML con título, autor y cuerpo). */
function summaryOf(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.querySelector('.field--name-body') ?? doc.body;
  return (body?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Junta lo guardado con lo recién descargado (lo nuevo manda si se repite) y
 * quita lo que ya no se debe ver. Ordenados del más reciente al más antiguo.
 */
export function mergeNotices(
  stored: readonly EmtNotice[],
  fresh: readonly EmtNotice[],
  now: number,
): EmtNotice[] {
  const byId = new Map(stored.map((n) => [n.id, n]));
  for (const notice of fresh) byId.set(notice.id, notice);
  return [...byId.values()]
    .filter((n) => isVisible(n, now))
    .sort((a, b) => b.publishedAt - a.publishedAt);
}

/** Avisos que afectan a alguna de estas líneas; con includeGeneral, también los generales. */
export function noticesFor(
  notices: readonly EmtNotice[],
  lineIds: readonly string[],
  includeGeneral: boolean,
): EmtNotice[] {
  const wanted = new Set(lineIds.map((id) => id.toUpperCase()));
  return notices.filter((n) =>
    n.lines.length === 0 ? includeGeneral : n.lines.some((line) => wanted.has(line)),
  );
}

/** Lee lo guardado en el dispositivo, descartando lo que no tenga la forma esperada. */
export function parseStoredNotices(raw: string | null): EmtNotice[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isNotice) : [];
  } catch {
    return [];
  }
}

function isNotice(value: unknown): value is EmtNotice {
  const n = value as Partial<EmtNotice> | null;
  return (
    typeof n?.id === 'string' &&
    typeof n.title === 'string' &&
    typeof n.summary === 'string' &&
    typeof n.publishedAt === 'number' &&
    typeof n.url === 'string' &&
    n.url.startsWith(EMT_SITE) &&
    Array.isArray(n.lines) &&
    n.lines.every((line) => typeof line === 'string')
  );
}
