import { defineConfig } from '@playwright/test';

/**
 * Pruebas de extremo a extremo (17/10/2026): recorren las pantallas principales
 * en Chrome con la app servida por `ng serve`. Los datos publicados se sirven
 * desde la copia incluida (public/data-snapshot), así no dependen de internet
 * ni de que cambien los datos. Se usa el Chrome instalado (no se descargan
 * navegadores).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4300',
    channel: 'chrome',
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: 'npx ng serve --port 4300',
    url: 'http://localhost:4300',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
