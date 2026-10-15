import { Injectable, computed, inject, signal } from '@angular/core';

import {
  EmtNotice,
  mergeNotices,
  noticesFor,
  parseNoticeFeed,
  parseStoredNotices,
} from './notices';

/**
 * Origen del canal de avisos. Abstracto como el del tiempo real: en la web el
 * servidor de la EMT no permite leerlo (CORS), y en las pruebas se falsea.
 */
@Injectable({ providedIn: 'root', useFactory: () => new NoNoticeSource() })
export abstract class NoticeSource {
  abstract readonly available: boolean;
  /** Descarga el canal RSS tal cual. */
  abstract fetchFeed(): Promise<string>;
}

class NoNoticeSource extends NoticeSource {
  readonly available = false;
  fetchFeed(): Promise<string> {
    return Promise.resolve('');
  }
}

const STORAGE_KEY = 'emt-remake.notices.v1';
/** Avisos cerrados en el inicio (petición del desarrollador, 15/10/2026). */
const DISMISSED_KEY = 'emt-remake.notices-dismissed.v1';
/** Como mucho una descarga cada 15 min: la EMT publica pocos avisos al día. */
const REFRESH_MS = 15 * 60_000;

/**
 * Avisos de la EMT guardados en el dispositivo (Fase 7). Se descargan al
 * abrir una pantalla que los muestra si hace más de 15 min de la última vez;
 * sin conexión se siguen viendo los guardados.
 */
@Injectable({ providedIn: 'root' })
export class NoticesService {
  private readonly source = inject(NoticeSource);
  private readonly noticesSignal = signal<readonly EmtNotice[]>(
    mergeNotices(load(), [], Date.now()),
  );
  private lastFetch = 0;
  private pending: Promise<void> | null = null;

  readonly available = this.source.available;
  /** Avisos que se deben ver, del más reciente al más antiguo. */
  readonly notices = this.noticesSignal.asReadonly();
  private readonly dismissedSignal = signal<ReadonlySet<string>>(loadDismissed());
  /** Avisos que el usuario ha cerrado en el inicio (siguen en el detalle de línea y parada). */
  readonly dismissed = this.dismissedSignal.asReadonly();
  /** Los que se ven en el inicio: los no cerrados. */
  private readonly open = computed(() =>
    this.notices().filter((n) => !this.dismissedSignal().has(n.id)),
  );

  /** Descarga los avisos si hace rato que no se hace. */
  refresh(): Promise<void> {
    if (!this.available || Date.now() - this.lastFetch < REFRESH_MS) return Promise.resolve();
    this.pending ??= this.download().finally(() => (this.pending = null));
    return this.pending;
  }

  /** Los que afectan a estas líneas (y los generales, si se piden). */
  forLines(lineIds: readonly string[], includeGeneral = true, hideDismissed = false): EmtNotice[] {
    return noticesFor(hideDismissed ? this.open() : this.notices(), lineIds, includeGeneral);
  }

  /** Cierra unos avisos en el inicio. Se recuerda solo mientras el aviso se siga viendo. */
  dismiss(ids: readonly string[]): void {
    const visible = new Set(this.notices().map((n) => n.id));
    const next = new Set([...this.dismissedSignal(), ...ids].filter((id) => visible.has(id)));
    this.dismissedSignal.set(next);
    saveDismissed(next);
  }

  private async download(): Promise<void> {
    try {
      const fresh = parseNoticeFeed(await this.source.fetchFeed());
      this.lastFetch = Date.now();
      const merged = mergeNotices(this.noticesSignal(), fresh, this.lastFetch);
      this.noticesSignal.set(merged);
      save(merged);
    } catch {
      // Sin conexión o canal caído: se siguen viendo los guardados.
    }
  }
}

function load(): EmtNotice[] {
  try {
    return parseStoredNotices(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

function loadDismissed(): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    // Sin almacenamiento: vale para esta sesión.
  }
}

function save(notices: readonly EmtNotice[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notices));
  } catch {
    // Sin almacenamiento: los avisos valen para esta sesión.
  }
}
