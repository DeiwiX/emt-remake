import { Injectable, signal } from '@angular/core';

import { AVAILABLE_LANGS, AppLang, DEFAULT_LANG } from '../i18n/i18n.config';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface AppSettings {
  readonly language: AppLang;
  readonly theme: ThemePreference;
  readonly highContrast: boolean;
  /** Modo sencillo (RF-07): solo listas, sin mapa. Se aplica en el incremento 8. */
  readonly simpleMode: boolean;
}

const STORAGE_KEY = 'emt-remake.settings.v1';
const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark'];

/**
 * Ajustes del usuario (RF-10), guardados solo en este dispositivo. Son unos
 * pocos valores, así que basta localStorage; si no está disponible (modo
 * privado, almacenamiento lleno) la app funciona igual con los valores por defecto.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly settingsSignal = signal<AppSettings>(loadSettings());
  readonly settings = this.settingsSignal.asReadonly();

  update(changes: Partial<AppSettings>): void {
    this.settingsSignal.update((current) => ({ ...current, ...changes }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settingsSignal()));
    } catch {
      // Sin almacenamiento: el ajuste vale para esta sesión.
    }
  }
}

function defaultSettings(): AppSettings {
  const browserLang = typeof navigator === 'undefined' ? '' : navigator.language.toLowerCase();
  return {
    language: browserLang.startsWith('en') ? 'en' : DEFAULT_LANG,
    theme: 'system',
    highContrast: false,
    simpleMode: false,
  };
}

/** Lee los ajustes guardados descartando valores desconocidos o dañados. */
export function loadSettings(): AppSettings {
  const defaults = defaultSettings();
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (typeof parsed === 'object' && parsed !== null) stored = parsed as Record<string, unknown>;
  } catch {
    return defaults;
  }
  const language = stored['language'];
  const theme = stored['theme'];
  return {
    language: (AVAILABLE_LANGS as readonly unknown[]).includes(language)
      ? (language as AppLang)
      : defaults.language,
    theme: (THEMES as readonly unknown[]).includes(theme)
      ? (theme as ThemePreference)
      : defaults.theme,
    highContrast:
      typeof stored['highContrast'] === 'boolean' ? stored['highContrast'] : defaults.highContrast,
    simpleMode:
      typeof stored['simpleMode'] === 'boolean' ? stored['simpleMode'] : defaults.simpleMode,
  };
}
