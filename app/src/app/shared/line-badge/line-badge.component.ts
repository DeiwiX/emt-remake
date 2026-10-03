import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Número de línea siempre visible. El color propio de cada línea llega con la
 * paleta validada del incremento 5; nunca será la única forma de identificarla.
 */
@Component({
  selector: 'app-line-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 2.75rem;
      min-height: 2rem;
      padding: 0 0.5rem;
      border-radius: 0.5rem;
      background: var(--ion-color-primary);
      color: var(--ion-color-primary-contrast);
      font-weight: 700;
      font-size: 1rem;
      line-height: 1;
      white-space: nowrap;
    }
  `,
  template: `{{ code() }}`,
})
export class LineBadgeComponent {
  readonly code = input.required<string>();
}
