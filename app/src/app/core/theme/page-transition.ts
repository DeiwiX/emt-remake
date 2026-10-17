import { Animation, createAnimation } from '@ionic/angular';

/** Opciones que Ionic pasa a la animación de cambio de pantalla (las que se usan aquí). */
interface TransitionOptions {
  readonly enteringEl: HTMLElement;
  readonly leavingEl?: HTMLElement;
  readonly direction?: 'forward' | 'back' | 'root';
}

const DURATION_MS = 340;
/** Curva suave, como una ola que llega y se asienta. */
const EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';

/**
 * Transición entre pantallas (07/10/2026): la nueva entra deslizándose desde el
 * lado hacia el que se va (derecha al avanzar, izquierda al volver) mientras la
 * anterior se aparta. Si el sistema pide reducir el movimiento, Ionic no anima
 * (provideIonicAngular con animated: false).
 *
 * Sin parpadeos (17/10/2026), como las transiciones de Ionic:
 * - `fill('both')`: los fotogramas inicial y final se mantienen antes y después
 *   de animar. Sin él, al terminar la pantalla que se va volvía un instante a su
 *   sitio, visible, antes de ocultarse.
 * - Solo se desvanece la pantalla que queda encima (la nueva al avanzar, la que
 *   se va al volver). Si se desvanecían las dos a la vez, a mitad se veía el
 *   fondo a través de ambas.
 */
export function pageTransition(_: HTMLElement, opts: TransitionOptions): Animation {
  const back = opts.direction === 'back';
  const entering = createAnimation()
    .addElement(opts.enteringEl)
    .beforeRemoveClass('ion-page-invisible')
    .fromTo('transform', `translateX(${back ? '-30%' : '30%'})`, 'translateX(0)');
  // Al avanzar, la nueva va encima: aparece poco a poco.
  if (!back) entering.fromTo('opacity', '0.01', '1');
  const root = createAnimation()
    .duration(DURATION_MS)
    .easing(EASING)
    .fill('both')
    .addAnimation(entering);
  if (opts.leavingEl) {
    const leaving = createAnimation()
      .addElement(opts.leavingEl)
      .fromTo('transform', 'translateX(0)', `translateX(${back ? '20%' : '-20%'})`);
    if (back) {
      // Al volver, la que se va está encima: se desvanece y se oculta al terminar.
      leaving.fromTo('opacity', '1', '0.01').onFinish((step) => {
        if (step === 1) leaving.elements[0]?.style.setProperty('display', 'none');
      });
    }
    root.addAnimation(leaving);
  }
  return root;
}
