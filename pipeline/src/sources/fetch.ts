import { FETCH } from '../config.ts';

export interface Downloaded {
  bytes: Uint8Array;
  lastModified: string | null;
}

/** Descarga un recurso con reintentos y tiempo máximo por intento. */
export async function download(url: string): Promise<Downloaded> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= FETCH.retries; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(FETCH.timeoutMs) });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} al descargar ${url}`);
      }
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        lastModified: response.headers.get('last-modified'),
      };
    } catch (error) {
      lastError = error;
      if (attempt < FETCH.retries) {
        await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
      }
    }
  }
  throw new Error(`No se pudo descargar ${url}`, { cause: lastError });
}
