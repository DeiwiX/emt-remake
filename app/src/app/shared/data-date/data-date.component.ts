import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { DataStatusService } from '../../core/data/repositories';
import { shortDate } from './short-date';

/**
 * Fecha de los datos en la cabecera, corta ("05/10/2026"), para que no ocupe
 * sitio en el contenido. Los avisos (sin datos, desactualizados) siguen en el
 * banner de estado.
 */
@Component({
  selector: 'app-data-date',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      padding: 0 12px;
      font-size: 0.75rem;
      opacity: 0.85;
      white-space: nowrap;
    }
  `,
  template: `
    @if (date(); as date) {
      <span [attr.aria-label]="'data.updatedOn' | transloco: { date }">{{ date }}</span>
    }
  `,
})
export class DataDateComponent {
  private readonly status = inject(DataStatusService).status;

  protected readonly date = computed(() => {
    const status = this.status();
    return status.state === 'loading' || status.state === 'unavailable'
      ? null
      : shortDate(status.generatedAt);
  });
}
