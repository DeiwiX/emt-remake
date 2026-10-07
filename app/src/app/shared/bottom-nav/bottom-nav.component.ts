import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IonIcon } from '@ionic/angular';

import { SimpleModeService } from '../../core/settings/simple-mode.service';

/**
 * Barra inferior fija (05/10/2026): Inicio, Mapa, Cómo llegar y Favoritos, a un
 * toque desde cualquier pantalla. En modo sencillo (sin mapa) el Mapa se cambia
 * por Líneas.
 */
@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      flex: none;
      border-top: 1px solid var(--ion-border-color);
      background: var(--app-card, #fff);
      padding-bottom: env(safe-area-inset-bottom, 0px);
    }
    nav {
      display: flex;
      max-width: 760px;
      margin-inline: auto;
    }
    a {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      min-height: 56px;
      color: var(--app-muted, #5f6368);
      font-size: 0.75rem;
      text-decoration: none;
    }
    a ion-icon {
      font-size: 1.45rem;
    }
    a.active {
      color: var(--ion-color-primary);
      font-weight: 600;
    }
    a:focus-visible {
      outline: 3px solid var(--ion-color-primary);
      outline-offset: -3px;
    }
  `,
  template: `
    <nav [attr.aria-label]="'nav.label' | transloco">
      <a
        routerLink="/"
        routerLinkActive="active"
        ariaCurrentWhenActive="page"
        [routerLinkActiveOptions]="{ exact: true }"
      >
        <ion-icon name="home-outline" aria-hidden="true" />{{ 'nav.home' | transloco }}
      </a>
      @if (simpleMode()) {
        <a routerLink="/lines" routerLinkActive="active" ariaCurrentWhenActive="page">
          <ion-icon name="bus-outline" aria-hidden="true" />{{ 'home.linesTile' | transloco }}
        </a>
      } @else {
        <a routerLink="/map" routerLinkActive="active" ariaCurrentWhenActive="page">
          <ion-icon name="map-outline" aria-hidden="true" />{{ 'map.title' | transloco }}
        </a>
      }
      <a routerLink="/plan" routerLinkActive="active" ariaCurrentWhenActive="page">
        <ion-icon name="trail-sign-outline" aria-hidden="true" />{{ 'plan.title' | transloco }}
      </a>
      <a routerLink="/favorites" routerLinkActive="active" ariaCurrentWhenActive="page">
        <ion-icon name="star-outline" aria-hidden="true" />{{ 'nav.favorites' | transloco }}
      </a>
    </nav>
  `,
})
export class BottomNavComponent {
  protected readonly simpleMode = inject(SimpleModeService).active;
}
