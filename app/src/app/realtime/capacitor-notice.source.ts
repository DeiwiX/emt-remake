import { Injectable } from '@angular/core';

import { NoticeSource } from '../core/notices/notices.service';
import { EMT_SITE } from '../core/notices/notices';

/** Noticias de la web de la EMT, donde publica desvíos e incidencias. */
export const NOTICES_URL = `${EMT_SITE}/rss.xml`;

/**
 * Descarga con el cliente HTTP nativo de Capacitor, como el tiempo real: la
 * web de la EMT no envía cabeceras CORS. En la web no hay avisos (ADR 0014).
 */
@Injectable()
export class CapacitorNoticeSource extends NoticeSource {
  readonly available =
    (
      globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }
    ).Capacitor?.isNativePlatform?.() ?? false;

  async fetchFeed(): Promise<string> {
    const { CapacitorHttp } = await import('@capacitor/core');
    const response = await CapacitorHttp.get({ url: NOTICES_URL, responseType: 'text' });
    if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
    return String(response.data);
  }
}
