import {
  DOCUMENT,
  EnvironmentProviders,
  effect,
  inject,
  provideAppInitializer,
} from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

import { ColorSchemeService } from '../theme/color-scheme.service';
import { SettingsService } from './settings.service';

/** Clases de las paletas de Ionic importadas en styles.scss. */
const DARK_CLASS = 'ion-palette-dark';
const HIGH_CONTRAST_CLASS = 'ion-palette-high-contrast';

/**
 * Aplica los ajustes a toda la app y los mantiene sincronizados: idioma
 * activo (y atributo lang del documento, para los lectores de pantalla),
 * tema claro u oscuro y alto contraste.
 */
export function provideSettings(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const document = inject(DOCUMENT);
    const settings = inject(SettingsService).settings;
    const colorScheme = inject(ColorSchemeService);
    const transloco = inject(TranslocoService);

    effect(() => {
      const language = settings().language;
      transloco.setActiveLang(language);
      document.documentElement.lang = language;
    });
    effect(() => {
      const root = document.documentElement.classList;
      root.toggle(DARK_CLASS, colorScheme.scheme() === 'dark');
      root.toggle(HIGH_CONTRAST_CLASS, colorScheme.highContrast());
    });
  });
}
