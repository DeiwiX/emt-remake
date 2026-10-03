import { InjectionToken } from '@angular/core';

export interface DataConfig {
  /** Datos publicados cada noche por pipeline/ en GitHub Pages (ADR 0002). */
  remoteBaseUrl: string;
  /** Copia incluida en la app (public/data-snapshot) para el primer arranque sin conexión. */
  bundledBaseUrl: string;
}

export const DATA_CONFIG = new InjectionToken<DataConfig>('DATA_CONFIG', {
  factory: () => ({
    remoteBaseUrl: 'https://deiwix.github.io/emt-remake/data/v1/',
    bundledBaseUrl: 'data-snapshot/v1/',
  }),
});
