import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { FavoritesService } from '../../core/favorites/favorites.service';
import { DataDateComponent } from '../../shared/data-date/data-date.component';
import { FavoritesSectionComponent } from '../home/favorites-section.component';

/** "Favoritos" de la barra inferior: paradas, trayectos y líneas guardados. */
@Component({
  selector: 'app-favorites',
  imports: [
    TranslocoPipe,
    DataDateComponent,
    FavoritesSectionComponent,
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      --card: var(--app-card);
      --muted: var(--app-muted);
    }
    .page {
      max-width: 760px;
      margin-inline: auto;
      padding: 16px;
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/" [text]="'common.back' | transloco" />
        </ion-buttons>
        <ion-title>{{ 'favorites.title' | transloco }}</ion-title>
        <app-data-date slot="end" />
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="page">
        @if (hasFavorites()) {
          <app-favorites-section />
        } @else {
          <p>{{ 'favorites.empty' | transloco }}</p>
        }
      </div>
    </ion-content>
  `,
})
export class FavoritesPage {
  private readonly favorites = inject(FavoritesService).favorites;
  protected readonly hasFavorites = computed(() => this.favorites().length > 0);
}
