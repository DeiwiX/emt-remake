import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** Marcador temporal para pantallas cuyo contenido llega en incrementos posteriores. */
@Component({
  selector: 'app-coming-soon',
  imports: [TranslocoPipe],
  template: `<p class="ion-padding">
    {{ 'common.comingSoon' | transloco: { increment: increment() } }}
  </p>`,
})
export class ComingSoonComponent {
  readonly increment = input.required<number>();
}
