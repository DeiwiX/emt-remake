import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IonIcon, NavController } from '@ionic/angular';
import { filter, map } from 'rxjs';

import { SimpleModeService } from '../../core/settings/simple-mode.service';
import { swipeDirection, swipeTarget } from './swipe';

interface Tab {
  readonly path: string;
  readonly icon: string;
  readonly label: string;
}

/**
 * Barra inferior fija (05/10/2026): Inicio, Mapa, Cómo llegar y Favoritos, a un
 * toque desde cualquier pantalla. En modo sencillo (sin mapa) el Mapa se cambia
 * por Líneas.
 *
 * Estilo "ola" como la cabecera (07/10/2026): borde superior ondulado en azul
 * noche, la pestaña activa sobre un círculo azul mar que se desliza hasta la
 * nueva al cambiar y suelta unas ondas. También se pasa de una pantalla a otra
 * deslizando el dedo en horizontal, salvo sobre el mapa (que se arrastra) o
 * sobre algo que se desplaza en horizontal.
 */
@Component({
  selector: 'app-bottom-nav',
  imports: [TranslocoPipe, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      position: relative;
      display: block;
      flex: none;
      background: var(--app-header, #1c2b4a);
      color: #fff;
      padding-bottom: env(safe-area-inset-bottom, 0px);
    }
    /* Borde superior en ola, del fondo de la pantalla al azul noche. */
    .edge {
      position: absolute;
      top: -11px;
      left: 0;
      width: 100%;
      height: 12px;
      pointer-events: none;
    }
    nav {
      position: relative;
      display: flex;
      max-width: 760px;
      margin-inline: auto;
    }
    /* Círculo de la pestaña activa: se desliza hasta la nueva. */
    .bubble {
      position: absolute;
      top: 5px;
      left: calc(var(--index) * 25% + 12.5%);
      width: 40px;
      height: 40px;
      margin-left: -20px;
      border-radius: 50%;
      background: var(--ion-color-primary);
      transition: left 420ms cubic-bezier(0.34, 1.4, 0.64, 1);
      pointer-events: none;
    }
    /* Ondas que salen del círculo al llegar a una pestaña nueva. */
    .ripple {
      position: absolute;
      inset: 0;
      border: 2px solid var(--ion-color-primary);
      border-radius: 50%;
      opacity: 0;
      animation: wave 900ms ease-out 260ms;
    }
    .ripple.second {
      animation-delay: 420ms;
    }
    @keyframes wave {
      from {
        opacity: 0.8;
        transform: scale(1);
      }
      to {
        opacity: 0;
        transform: scale(1.9);
      }
    }
    a {
      position: relative;
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      gap: 2px;
      min-height: 66px;
      padding: 13px 2px 6px;
      color: rgba(255, 255, 255, 0.78);
      font-size: 0.72rem;
      text-align: center;
      text-decoration: none;
    }
    a ion-icon {
      font-size: 1.4rem;
      margin-bottom: 10px;
      transition: transform 300ms ease;
    }
    a.active {
      color: #fff;
      font-weight: 600;
    }
    a.active ion-icon {
      color: var(--ion-color-primary-contrast);
    }
    a:focus-visible {
      outline: 3px solid #fff;
      outline-offset: -3px;
    }
    @media (prefers-reduced-motion: reduce) {
      .bubble,
      a ion-icon {
        transition: none;
      }
      .ripple {
        animation: none;
      }
    }
  `,
  template: `
    <svg class="edge" viewBox="0 0 390 12" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M0 6 C 48 0, 97 0, 146 6 S 244 12, 292 6 S 365 0, 390 4 V12 H0Z"
        fill="var(--app-header, #1c2b4a)"
      />
    </svg>
    <nav [attr.aria-label]="'nav.label' | transloco">
      @if (activeIndex() !== -1) {
        <span class="bubble" [style.--index]="activeIndex()" aria-hidden="true">
          @for (k of [activeIndex()]; track k) {
            <span class="ripple"></span><span class="ripple second"></span>
          }
        </span>
      }
      @for (tab of tabs(); track tab.path; let i = $index) {
        <a
          [attr.href]="tab.path"
          [class.active]="i === activeIndex()"
          [attr.aria-current]="i === activeIndex() ? 'page' : null"
          (click)="go($event, i)"
        >
          <ion-icon [name]="tab.icon" aria-hidden="true" />{{ tab.label | transloco }}
        </a>
      }
    </nav>
  `,
})
export class BottomNavComponent {
  protected readonly simpleMode = inject(SimpleModeService).active;
  private readonly router = inject(Router);
  private readonly nav = inject(NavController);

  /** Pantallas de la barra, en su orden. */
  protected readonly tabs = computed<readonly Tab[]>(() => [
    { path: '/', icon: 'home-outline', label: 'nav.home' },
    this.simpleMode()
      ? { path: '/lines', icon: 'bus-outline', label: 'home.linesTile' }
      : { path: '/map', icon: 'map-outline', label: 'map.title' },
    { path: '/plan', icon: 'trail-sign-outline', label: 'plan.title' },
    { path: '/favorites', icon: 'star-outline', label: 'nav.favorites' },
  ]);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  /** Pestaña de la pantalla actual (-1 si es otra, p. ej. el detalle de una parada). */
  protected readonly activeIndex = computed(() => {
    const path = this.url().split(/[?#]/)[0] || '/';
    return this.tabs().findIndex((t) => t.path === path);
  });
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
      const target = swipeTarget(
        this.router.url,
        this.tabs().map((t) => t.path),
        direction,
      );
      if (target) this.navigate(target, direction > 0);
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    });
  }

  /** Toque en una pestaña: la animación va hacia el lado de la pestaña elegida. */
  protected go(event: MouseEvent, index: number): void {
    event.preventDefault();
    const tab = this.tabs()[index];
    if (!tab || index === this.activeIndex()) return;
    this.navigate(tab.path, index > this.activeIndex());
  }

  private navigate(path: string, forward: boolean): void {
    if (forward) void this.nav.navigateForward(path);
    else void this.nav.navigateBack(path);
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
