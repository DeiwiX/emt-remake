import { EnvironmentProviders, Injectable, inject, isDevMode } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Translation, TranslocoLoader, provideTransloco } from '@jsverse/transloco';

import { AVAILABLE_LANGS, DEFAULT_LANG } from './i18n.config';

/** Carga los textos desde public/i18n/<idioma>.json solo cuando se necesitan. */
@Injectable({ providedIn: 'root' })
export class HttpTranslationLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string) {
    return this.http.get<Translation>(`i18n/${lang}.json`);
  }
}

export function provideI18n(): EnvironmentProviders[] {
  return provideTransloco({
    config: {
      availableLangs: [...AVAILABLE_LANGS],
      defaultLang: DEFAULT_LANG,
      fallbackLang: DEFAULT_LANG,
      reRenderOnLangChange: true,
      prodMode: !isDevMode(),
    },
    loader: HttpTranslationLoader,
  });
}
