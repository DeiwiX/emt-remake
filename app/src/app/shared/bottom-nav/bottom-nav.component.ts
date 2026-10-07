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
 * Estilo (07/10/2026, mezcla A + B elegida por el desarrollador): píldora azul
 * noche flotante y la pestaña activa en un "sol" coral que sale por arriba,
 * viaja hasta la nueva con un rebote y suelta unas ondas. También se pasa de una pantalla a otra
 * deslizando el dedo en horizontal, salvo sobre el mapa (que se arrastra) o
 * sobre algo que se desplaza en horizontal.
 */
@Component({
  selector: 'app-bottom-nav',
  imports: [TranslocoPipe, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    /*
     * Píldora azul noche que flota sobre el fondo de la app; la pestaña activa sale
     * hacia arriba en un "sol" coral (mezcla A + B, 07/10/2026). La barra ocupa su
     * propio hueco: no tapa lo último de cada pantalla.
     */
    :host {
      display: block;
      flex: none;
      padding: 28px 14px calc(12px + env(safe-area-inset-bottom, 0px));
      background: var(--ion-background-color);
    }
    .pill {
      position: relative;
      max-width: 560px;
      margin-inline: auto;
      border-radius: 32px;
      background: var(--app-header, #1c2b4a);
      box-shadow: 0 10px 22px rgba(28, 43, 74, 0.35);
    }
    :host-context(.ion-palette-dark) .pill {
      background: #22355c;
      box-shadow: 0 10px 22px rgba(0, 0, 0, 0.45);
    }
    nav {
      position: relative;
      display: flex;
    }
    /* El sol de la pestaña activa: viaja hasta la nueva con un rebote. */
    .sun {
      position: absolute;
      top: -26px;
      left: calc(var(--index) * 25% + 12.5%);
      display: grid;
      place-items: center;
      width: 54px;
      height: 54px;
      margin-left: -27px;
      border-radius: 50%;
      background: var(--app-sun, #f08a5d);
      color: #1c2b4a;
      font-size: 1.45rem;
      box-shadow: 0 6px 14px rgba(240, 138, 93, 0.45);
      transition: left 460ms cubic-bezier(0.34, 1.4, 0.64, 1);
      pointer-events: none;
    }
    /* Onda que suelta el sol al llegar a una pestaña nueva. */
    .ripple {
      position: absolute;
      inset: 0;
      border: 2px solid var(--app-sun, #f08a5d);
      border-radius: 50%;
      opacity: 0;
      animation: wave 900ms ease-out 300ms;
    }
    .ripple.second {
      animation-delay: 460ms;
    }
    @keyframes wave {
      from {
        opacity: 0.85;
        transform: scale(1);
      }
      to {
        opacity: 0;
        transform: scale(1.7);
      }
    }
    a {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      min-height: 62px;
      padding: 4px 2px;
      color: rgba(255, 255, 255, 0.78);
      font-size: 0.72rem;
      text-align: center;
      text-decoration: none;
    }
    a ion-icon {
      font-size: 1.4rem;
    }
    /* La activa: el icono va en el sol; abajo queda su nombre. */
    a.active {
      justify-content: flex-end;
      padding-bottom: 10px;
      color: #fff;
      font-weight: 600;
    }
    a.active ion-icon {
      display: none;
    }
    a:focus-visible {
      outline: 3px solid #fff;
      outline-offset: -3px;
      border-radius: 28px;
    }
    @media (prefers-reduced-motion: reduce) {
      .sun {
        transition: none;
      }
      .ripple {
        animation: none;
      }
    }
  `,
  template: `
    <div class="pill">
      <nav [attr.aria-label]="'nav.label' | transloco">
        @if (activeTab(); as active) {
          <span class="sun" [style.--index]="activeIndex()" aria-hidden="true">
            <ion-icon [name]="active.icon" />
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
    </div>
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
  protected readonly activeTab = computed(() => this.tabs()[this.activeIndex()] ?? null);
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
