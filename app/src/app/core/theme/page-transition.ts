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
 * anterior se aparta y se desvanece. Si el sistema pide reducir el movimiento,
 * Ionic no anima (provideIonicAngular con animated: false).
 */
export function pageTransition(_: HTMLElement, opts: TransitionOptions): Animation {
  const back = opts.direction === 'back';
  const entering = createAnimation()
    .addElement(opts.enteringEl)
    .beforeRemoveClass('ion-page-invisible')
    .fromTo('transform', `translateX(${back ? '-30%' : '30%'})`, 'translateX(0)')
    .fromTo('opacity', '0', '1');
  const root = createAnimation().duration(DURATION_MS).easing(EASING).addAnimation(entering);
  if (opts.leavingEl) {
    root.addAnimation(
      createAnimation()
        .addElement(opts.leavingEl)
        .fromTo('transform', 'translateX(0)', `translateX(${back ? '20%' : '-20%'})`)
        .fromTo('opacity', '1', '0'),
    );
  }
  return root;
}
