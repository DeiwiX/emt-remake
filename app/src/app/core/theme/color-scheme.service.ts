import { Injectable, computed, inject, signal } from '@angular/core';

import { SettingsService } from '../settings/settings.service';

export type ColorScheme = 'light' | 'dark';

/**
 * Esquema de color efectivo: el elegido en Ajustes o, con "según el sistema",
 * la preferencia del sistema operativo (RNF-05).
 */
@Injectable({ providedIn: 'root' })
export class ColorSchemeService {
  private readonly settings = inject(SettingsService).settings;
  private readonly query =
    typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  private readonly systemScheme = signal<ColorScheme>(this.query?.matches ? 'dark' : 'light');

  readonly scheme = computed<ColorScheme>(() => {
    const theme = this.settings().theme;
    return theme === 'system' ? this.systemScheme() : theme;
  });
  readonly highContrast = computed(() => this.settings().highContrast);

  constructor() {
    this.query?.addEventListener('change', (event) =>
      this.systemScheme.set(event.matches ? 'dark' : 'light'),
    );
  }
}

/** true si el sistema pide reducir animaciones (RNF-05). */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
