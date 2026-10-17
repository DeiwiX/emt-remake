import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test as base } from '@playwright/test';

const REMOTE = 'https://deiwix.github.io/emt-remake/data/v1/';
const SNAPSHOT = join(__dirname, '..', 'public', 'data-snapshot', 'v1');

/**
 * Página con los datos publicados sustituidos por la copia incluida en la app y
 * sin tiempo real ni avisos de la EMT (solo los hay en la app del móvil).
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(`${REMOTE}**`, async (route) => {
      const file = route.request().url().slice(REMOTE.length).split('?')[0]!;
      try {
        const body = await readFile(join(SNAPSHOT, file), 'utf8');
        await route.fulfill({ body, contentType: 'application/json' });
      } catch {
        await route.fulfill({ status: 404, body: '' });
      }
    });
    // Mapa base de OpenFreeMap: fuera de las pruebas.
    await page.route('https://tiles.openfreemap.org/**', (route) => route.abort());
    await use(page);
  },
});

export { expect } from '@playwright/test';
