import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IonIcon, NavController } from '@ionic/angular';

import { SimpleModeService } from '../../core/settings/simple-mode.service';
import { swipeDirection, swipeTarget } from './swipe';

/**
 * Barra inferior fija (05/10/2026): Inicio, Mapa, Cómo llegar y Favoritos, a un
 * toque desde cualquier pantalla. En modo sencillo (sin mapa) el Mapa se cambia
 * por Líneas. También se pasa de una a otra deslizando el dedo en horizontal
 * (07/10/2026), salvo sobre el mapa (que se arrastra) o sobre algo que se
 * desplaza en horizontal.
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
  private readonly router = inject(Router);
  private readonly nav = inject(NavController);
  /** Pantallas de la barra, en su orden. */
  private readonly tabs = computed(() => [
    '/',
    this.simpleMode() ? '/lines' : '/map',
    '/plan',
    '/favorites',
  ]);
  private start: { x: number; y: number; t: number } | null = null;

  constructor() {
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      this.start =
        event.touches.length === 1 && touch && !ignoresSwipe(event.target)
          ? { x: touch.clientX, y: touch.clientY, t: Date.now() }
          : null;
    };
    const onEnd = (event: TouchEvent) => {
      const start = this.start;
      const touch = event.changedTouches[0];
      this.start = null;
      if (!start || !touch) return;
      const direction = swipeDirection({
        dx: touch.clientX - start.x,
        dy: touch.clientY - start.y,
        ms: Date.now() - start.t,
      });
      const target = swipeTarget(this.router.url, this.tabs(), direction);
      if (!target) return;
      // Con la animación en el sentido del gesto.
      if (direction > 0) void this.nav.navigateForward(target);
      else void this.nav.navigateBack(target);
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    });
  }
}

/** Sobre el mapa, campos de texto o listas que se desplazan en horizontal no se cambia de pantalla. */
function ignoresSwipe(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('app-map-view, input, textarea, ion-searchbar, ion-range')) return true;
  for (let el: Element | null = target; el; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 4) {
      const overflow = getComputedStyle(el).overflowX;
      if (overflow === 'auto' || overflow === 'scroll') return true;
    }
  }
  return false;
}
