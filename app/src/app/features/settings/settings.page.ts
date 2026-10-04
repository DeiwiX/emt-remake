import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonRadio,
  IonRadioGroup,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular';

import { AVAILABLE_LANGS, AppLang } from '../../core/i18n/i18n.config';
import { SettingsService, ThemePreference } from '../../core/settings/settings.service';
import { SimpleModeService } from '../../core/settings/simple-mode.service';

/** Nombre de cada idioma en su propio idioma, para que se reconozca aunque no se entienda el actual. */
const LANGUAGE_NAMES: Record<AppLang, string> = { es: 'Español', en: 'English' };
const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark'];

/** Ajustes (RF-10): idioma, tema, alto contraste y modo sencillo. Se aplican al momento. */
@Component({
  selector: 'app-settings',
  imports: [
    RouterLink,
    TranslocoPipe,
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonNote,
    IonRadio,
    IonRadioGroup,
    IonTitle,
    IonToggle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/" [text]="'common.back' | transloco" />
        </ion-buttons>
        <ion-title>{{ 'settings.title' | transloco }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <!-- El grupo de radios envuelve la lista, y la lista no se anuncia como tal
           (role="none"): ARIA no admite radios como hijos de una lista. -->
      <ion-radio-group
        aria-labelledby="language-label"
        [value]="settings().language"
        (ionChange)="setLanguage($event.detail.value)"
      >
        <ion-list role="none">
          <ion-list-header>
            <ion-label id="language-label">{{ 'settings.language' | transloco }}</ion-label>
          </ion-list-header>
          @for (lang of languages; track lang) {
            <ion-item>
              <ion-radio [value]="lang" [attr.lang]="lang">{{ languageNames[lang] }}</ion-radio>
            </ion-item>
          }
        </ion-list>
      </ion-radio-group>

      <ion-radio-group
        aria-labelledby="theme-label"
        [value]="settings().theme"
        (ionChange)="setTheme($event.detail.value)"
      >
        <ion-list role="none">
          <ion-list-header>
            <ion-label id="theme-label">{{ 'settings.theme' | transloco }}</ion-label>
          </ion-list-header>
          <!-- ion-radio solo detecta su texto cuando se pinta por primera vez y aquí llega
               después (traducción): por eso el texto va en ion-label y el radio usa aria-label.
               ion-item reenvía el toque al radio, así que toda la fila es pulsable. Se recrean al
               cambiar el texto porque Ionic copia aria-label solo al crear el radio. -->
          @if (themeLabels(); as labels) {
            @for (theme of themes; track theme + themeLabels()?.[theme]) {
              <ion-item>
                <ion-label aria-hidden="true">{{ labels[theme] }}</ion-label>
                <ion-radio slot="end" [value]="theme" [attr.aria-label]="labels[theme]" />
              </ion-item>
            }
          }
        </ion-list>
      </ion-radio-group>

      <ion-list>
        <ion-item>
          <ion-toggle
            [checked]="settings().highContrast"
            (ionChange)="service.update({ highContrast: $event.detail.checked })"
          >
            {{ 'settings.highContrast' | transloco }}
          </ion-toggle>
        </ion-item>
        <ion-item lines="none">
          <ion-note>{{ 'settings.highContrastHint' | transloco }}</ion-note>
        </ion-item>
      </ion-list>

      <ion-list>
        <ion-item>
          <ion-toggle
            [checked]="simpleMode.active()"
            [disabled]="simpleMode.forced"
            (ionChange)="service.update({ simpleMode: $event.detail.checked })"
          >
            {{ 'settings.simpleMode' | transloco }}
          </ion-toggle>
        </ion-item>
        <ion-item lines="none">
          <ion-note>{{
            (simpleMode.forced ? 'settings.simpleModeForced' : 'settings.simpleModeHint')
              | transloco
          }}</ion-note>
        </ion-item>
      </ion-list>

      <ion-list>
        <ion-item routerLink="/about" detail>
          <ion-label>{{ 'about.title' | transloco }}</ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  `,
})
export class SettingsPage {
  protected readonly service = inject(SettingsService);
  protected readonly settings = this.service.settings;
  protected readonly simpleMode = inject(SimpleModeService);
  protected readonly languages = AVAILABLE_LANGS;
  protected readonly languageNames = LANGUAGE_NAMES;
  protected readonly themes = THEMES;

  protected readonly themeLabels = toSignal(
    inject(TranslocoService).selectTranslateObject<Record<ThemePreference, string>>(
      'settings.themes',
    ),
  );

  protected setLanguage(value: unknown): void {
    if ((AVAILABLE_LANGS as readonly unknown[]).includes(value)) {
      this.service.update({ language: value as AppLang });
    }
  }

  protected setTheme(value: unknown): void {
    if ((THEMES as readonly unknown[]).includes(value)) {
      this.service.update({ theme: value as ThemePreference });
    }
  }
}
