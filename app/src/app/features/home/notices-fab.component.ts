import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IonIcon } from '@ionic/angular';

/** Lo que hay que mover el dedo para que un toque pase a ser arrastrar. */
const DRAG_THRESHOLD_PX = 8;
/** Margen con los bordes de la pantalla al soltarlo. */
const EDGE_PX = 8;
/** Dónde se dejó el triángulo (solo en este dispositivo). */
const POSITION_KEY = 'emt-remake.notices-fab-position.v1';

interface Position {
  readonly left: number;
  readonly top: number;
}

/**
 * Triángulo rojo de los avisos de la EMT cerrados (17/10/2026). Un toque lleva a
 * ellos; se puede arrastrar por la pantalla y, mientras se arrastra, aparece
 * abajo una papelera atenuada: si se suelta encima, se quita.
 */
@Component({
  selector: 'app-notices-fab',
  imports: [TranslocoPipe, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .fab {
      position: fixed;
      right: 14px;
      bottom: calc(118px + env(safe-area-inset-bottom, 0px));
      z-index: 10;
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
      cursor: grab;
      touch-action: none;
      animation: notices-pulse 1.8s ease-in-out infinite;
    }
    .fab.placed {
      right: auto;
      bottom: auto;
    }
    .fab.dragging {
      cursor: grabbing;
      animation: none;
      transform: scale(1.1);
      box-shadow: 0 8px 22px rgba(0, 0, 0, 0.3);
    }
    .fab svg {
      display: block;
      width: 28px;
      height: 28px;
    }
    .fab:focus-visible {
      outline: 3px solid var(--ion-color-primary);
      outline-offset: 3px;
    }
    /* Papelera: atenuada mientras se arrastra; se marca al pasar por encima. */
    .trash {
      position: fixed;
      left: 50%;
      bottom: calc(110px + env(safe-area-inset-bottom, 0px));
      z-index: 9;
      display: grid;
      place-items: center;
      width: 60px;
      height: 60px;
      margin-left: -30px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.45);
      color: #fff;
      font-size: 28px;
      opacity: 0.6;
      pointer-events: none;
      transition:
        transform 0.15s ease,
        opacity 0.15s ease,
        background-color 0.15s ease;
    }
    .trash.over {
      opacity: 1;
      transform: scale(1.18);
      background: #d32f2f;
    }
    @keyframes notices-pulse {
      0%,
      100% {
        transform: scale(1);
        box-shadow:
          0 4px 14px rgba(0, 0, 0, 0.25),
          0 0 0 0 rgba(211, 47, 47, 0.45);
      }
      50% {
        transform: scale(1.08);
        box-shadow:
          0 4px 14px rgba(0, 0, 0, 0.25),
          0 0 0 10px rgba(211, 47, 47, 0);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .fab {
        animation: none;
      }
    }
  `,
  template: `
    @if (dragging()) {
      <div class="trash" [class.over]="overTrash()" aria-hidden="true" #trash>
        <ion-icon name="trash-outline" />
      </div>
    }
    <button
      #fab
      type="button"
      class="fab"
      [class.placed]="position() !== null"
      [class.dragging]="dragging()"
      [style.left.px]="position()?.left"
      [style.top.px]="position()?.top"
      [attr.aria-label]="'notices.goToClosed' | transloco: { count: count() }"
      [title]="'notices.fabHint' | transloco"
      (pointerdown)="down($event)"
      (pointermove)="move($event)"
      (pointerup)="up($event)"
      (pointercancel)="cancel()"
      (click)="click()"
    >
      <!-- Triángulo centrado en el círculo (por su centro visual, no por su caja). -->
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 2 22.5 20H1.5z"
          fill="#d32f2f"
          stroke="#fff"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
        <path d="M12 8.2v5.6" stroke="#fff" stroke-width="2.4" stroke-linecap="round" />
        <circle cx="12" cy="16.8" r="1.4" fill="#fff" />
      </svg>
    </button>
  `,
})
export class NoticesFabComponent implements AfterViewInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Avisos cerrados (para el lector de pantalla). */
  readonly count = input.required<number>();
  /** Un toque: ir a los avisos cerrados. */
  readonly opened = output<void>();
  /** Soltado en la papelera. */
  readonly removed = output<void>();

  private readonly fab = viewChild.required<ElementRef<HTMLButtonElement>>('fab');
  private readonly trash = viewChild<ElementRef<HTMLElement>>('trash');

  protected readonly position = signal<Position | null>(loadPosition());
  protected readonly dragging = signal(false);
  protected readonly overTrash = signal(false);

  private start: { x: number; y: number; left: number; top: number } | null = null;
  /** El click que llega tras soltar un arrastre no debe abrir los avisos. */
  private justDragged = false;

  /**
   * Se lleva al final del documento: dentro de la página, "position: fixed" va
   * con su animación de entrada (transform) y no con la pantalla, y la papelera
   * no quedaría abajo.
   */
  ngAfterViewInit(): void {
    document.body.appendChild(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.host.nativeElement.remove();
  }

  protected down(event: PointerEvent): void {
    if (event.button !== 0) return;
    const rect = this.fab().nativeElement.getBoundingClientRect();
    this.start = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    this.fab().nativeElement.setPointerCapture?.(event.pointerId);
  }

  protected move(event: PointerEvent): void {
    const start = this.start;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!this.dragging() && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    this.dragging.set(true);
    this.position.set({ left: start.left + dx, top: start.top + dy });
    this.overTrash.set(this.isOverTrash(event));
  }

  protected up(event: PointerEvent): void {
    if (!this.start) return;
    this.start = null;
    if (!this.dragging()) return;
    this.justDragged = true;
    const remove = this.isOverTrash(event);
    this.dragging.set(false);
    this.overTrash.set(false);
    if (remove) {
      this.position.set(null);
      savePosition(null);
      this.removed.emit();
      return;
    }
    const placed = clampToViewport(this.position());
    this.position.set(placed);
    savePosition(placed);
  }

  protected cancel(): void {
    this.start = null;
    this.dragging.set(false);
    this.overTrash.set(false);
  }

  protected click(): void {
    if (this.justDragged) {
      this.justDragged = false;
      return;
    }
    this.opened.emit();
  }

  private isOverTrash(event: PointerEvent): boolean {
    const trash = this.trash()?.nativeElement.getBoundingClientRect();
    if (!trash) return false;
    // Algo de holgura alrededor: con el dedo no se acierta al píxel.
    const slack = 24;
    return (
      event.clientX >= trash.left - slack &&
      event.clientX <= trash.right + slack &&
      event.clientY >= trash.top - slack &&
      event.clientY <= trash.bottom + slack
    );
  }
}

function clampToViewport(position: Position | null): Position | null {
  if (!position || typeof window === 'undefined') return position;
  const size = 44;
  return {
    left: Math.min(Math.max(position.left, EDGE_PX), window.innerWidth - size - EDGE_PX),
    top: Math.min(Math.max(position.top, EDGE_PX), window.innerHeight - size - EDGE_PX),
  };
}

function loadPosition(): Position | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(POSITION_KEY) ?? 'null');
    if (
      value &&
      typeof value === 'object' &&
      typeof (value as Position).left === 'number' &&
      typeof (value as Position).top === 'number'
    ) {
      // La pantalla puede haber cambiado (giro, otro tamaño): que siga a la vista.
      return clampToViewport(value as Position);
    }
  } catch {
    // Sin almacenamiento o dato roto: en su sitio de siempre.
  }
  return null;
}

function savePosition(position: Position | null): void {
  try {
    if (position) localStorage.setItem(POSITION_KEY, JSON.stringify(position));
    else localStorage.removeItem(POSITION_KEY);
  } catch {
    // Sin almacenamiento: vale para esta sesión.
  }
}
