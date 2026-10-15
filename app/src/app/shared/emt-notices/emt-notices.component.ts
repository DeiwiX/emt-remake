import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IonIcon } from '@ionic/angular';

import { NoticesService } from '../../core/notices/notices.service';

const DATE_FORMAT = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Madrid',
});

/**
 * Avisos de la EMT (Fase 7) que afectan a unas líneas: desvíos, paradas
 * trasladadas, cortes. Cada uno abre su página en la web de la EMT. Sin
 * avisos no se muestra nada.
 */
@Component({
  selector: 'app-emt-notices',
  imports: [TranslocoPipe, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
    section {
      margin: 8px 0;
      padding: 10px 12px;
      border: 1px solid color-mix(in srgb, var(--app-accent) 35%, transparent);
      border-radius: 16px;
      background: var(--app-accent-soft);
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .close-all,
    .close {
      flex: none;
      min-width: 44px;
      min-height: 44px;
      border: 0;
      border-radius: 12px;
      background: transparent;
      color: var(--ion-text-color);
      font: inherit;
      cursor: pointer;
    }
    .close-all {
      padding: 0 8px;
      font-size: 0.85rem;
      font-weight: 600;
      text-decoration: underline;
    }
    .close {
      display: grid;
      place-items: center;
      font-size: 1.3rem;
    }
    .close-all:focus-visible,
    .close:focus-visible {
      outline: 3px solid var(--ion-color-primary);
      outline-offset: 2px;
    }
    li {
      display: flex;
      align-items: flex-start;
      gap: 4px;
    }
    li a {
      flex: 1;
    }
    h2 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 4px;
      font-size: 1rem;
    }
    h2 ion-icon {
      color: var(--app-accent);
      font-size: 1.25rem;
    }
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li + li {
      border-top: 1px solid color-mix(in srgb, var(--app-accent) 20%, transparent);
    }
    a {
      display: block;
      padding: 8px 0;
      color: var(--ion-text-color);
      text-decoration: none;
    }
    a:focus-visible {
      outline: 3px solid var(--ion-color-primary);
      outline-offset: 2px;
      border-radius: 8px;
    }
    .title {
      display: block;
      font-weight: 600;
    }
    .summary {
      display: -webkit-box;
      overflow: hidden;
      margin-top: 2px;
      font-size: 0.85rem;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 10px;
      margin-top: 4px;
      font-size: 0.8rem;
      color: var(--muted);
    }
    /* Texto del color normal (el coral sobre el fondo del aviso no llega a 4,5:1); el icono, en coral. */
    .open {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      color: var(--ion-text-color);
      font-weight: 600;
      text-decoration: underline;
    }
    .open ion-icon {
      color: var(--app-accent);
    }
  `,
  template: `
    @if (shown().length > 0) {
      <section [attr.aria-label]="'notices.title' | transloco">
        <div class="head">
          <h2>
            <ion-icon name="warning-outline" aria-hidden="true" />
            {{ 'notices.title' | transloco }}
          </h2>
          @if (dismissible() && shown().length > 1) {
            <button type="button" class="close-all" (click)="dismissAll()">
              {{ 'notices.closeAll' | transloco }}
            </button>
          }
        </div>
        <ul>
          @for (notice of shown(); track notice.id) {
            <li>
              <a [href]="notice.url" target="_blank" rel="noopener">
                <span class="title">{{ notice.title }}</span>
                @if (!compact() && notice.summary && notice.summary !== notice.title) {
                  <span class="summary">{{ notice.summary }}</span>
                }
                <span class="meta">
                  <span>{{
                    'notices.published' | transloco: { date: date(notice.publishedAt) }
                  }}</span>
                  <span class="open">
                    {{ 'notices.open' | transloco }}
                    <ion-icon name="open-outline" aria-hidden="true" />
                  </span>
                </span>
              </a>
              @if (dismissible()) {
                <button
                  type="button"
                  class="close"
                  [attr.aria-label]="'notices.close' | transloco: { title: notice.title }"
                  (click)="dismiss(notice.id)"
                >
                  <ion-icon name="close" aria-hidden="true" />
                </button>
              }
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class EmtNoticesComponent {
  private readonly notices = inject(NoticesService);

  /** Líneas de la pantalla (una línea, las de una parada o las de tus favoritas). */
  readonly lines = input.required<readonly string[]>();
  /** Si también se ven los avisos generales (sin líneas, p. ej. un evento). */
  readonly includeGeneral = input(true);
  /** Solo títulos (en el inicio, para no empujar hacia abajo tus favoritas). */
  readonly compact = input(false);
  /** Se pueden cerrar (en el inicio); cerrados no vuelven a salir ahí. */
  readonly dismissible = input(false);

  protected readonly shown = computed(() =>
    this.notices.forLines(this.lines(), this.includeGeneral(), this.dismissible()),
  );

  protected dismiss(id: string): void {
    this.notices.dismiss([id]);
  }

  protected dismissAll(): void {
    this.notices.dismiss(this.shown().map((n) => n.id));
  }

  constructor() {
    void this.notices.refresh();
  }

  protected date(at: number): string {
    return DATE_FORMAT.format(at);
  }
}
