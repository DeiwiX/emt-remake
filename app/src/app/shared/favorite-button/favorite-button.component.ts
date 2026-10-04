import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IonIcon } from '@ionic/angular';

import { Favorite } from '../../core/favorites/favorites';
import { FavoritesService } from '../../core/favorites/favorites.service';

/**
 * Estrella para guardar o quitar un favorito. Es un botón con aria-pressed y un
 * nombre que dice qué se guarda ("Guardar la parada Alameda en favoritos").
 */
@Component({
  selector: 'app-favorite-button',
  imports: [TranslocoPipe, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-width: 44px;
      min-height: 44px;
      padding: 0 10px;
      border: 1px solid var(--ion-color-step-250, #c8c8c8);
      border-radius: 999px;
      background: transparent;
      color: var(--ion-text-color);
      font: inherit;
      font-size: 0.9rem;
      cursor: pointer;
    }
    button[aria-pressed='true'] {
      border-color: #b06a00;
      color: #8a5300;
      background: #fff4e0;
    }
    :host-context(.ion-palette-dark) button[aria-pressed='true'] {
      border-color: #ffc56e;
      color: #ffd28f;
      background: rgba(255, 180, 60, 0.14);
    }
    ion-icon {
      font-size: 1.3rem;
    }
    button:focus-visible {
      outline: 3px solid var(--ion-color-primary);
      outline-offset: 2px;
    }
  `,
  template: `
    <button
      type="button"
      [attr.aria-pressed]="saved()"
      [attr.aria-label]="name() | transloco: { name: label() }"
      (click)="favorites.toggle(favorite())"
    >
      <ion-icon [name]="saved() ? 'star' : 'star-outline'" aria-hidden="true" />
      @if (showText()) {
        <span aria-hidden="true">{{
          (saved() ? 'favorites.saved' : 'favorites.save') | transloco
        }}</span>
      }
    </button>
  `,
})
export class FavoriteButtonComponent {
  protected readonly favorites = inject(FavoritesService);

  readonly favorite = input.required<Favorite>();
  /** Lo que se guarda, para el nombre accesible: "la parada Alameda", "la línea 1"... */
  readonly label = input.required<string>();
  /** Muestra "Guardar" / "Guardado" junto a la estrella. */
  readonly showText = input(false);

  protected readonly saved = computed(() => this.favorites.has(this.favorite()));
  protected readonly name = computed(() =>
    this.saved() ? 'favorites.removeLabel' : 'favorites.addLabel',
  );
}
