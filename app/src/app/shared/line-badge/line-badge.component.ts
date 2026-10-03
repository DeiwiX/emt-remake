import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { LineColorsService } from '../../core/map/line-colors.service';

/**
 * Número de línea siempre visible, con el color de la línea en el mapa. El
 * color nunca es la única forma de identificarla: el número lo es.
 */
@Component({
  selector: 'app-line-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[style.background]': 'color().line',
    '[style.color]': 'color().text',
  },
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 2.75rem;
      min-height: 2rem;
      padding: 0 0.5rem;
      border-radius: 0.5rem;
      font-weight: 700;
      font-size: 1rem;
      line-height: 1;
      white-space: nowrap;
    }
  `,
  template: `{{ code() }}`,
})
export class LineBadgeComponent {
  private readonly colors = inject(LineColorsService);
  readonly code = input.required<string>();
  protected readonly color = computed(() => this.colors.colorFor(this.code()));
}
