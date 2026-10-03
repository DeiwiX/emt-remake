import { Injectable, signal } from '@angular/core';

export type ColorScheme = 'light' | 'dark';

/**
 * Esquema de color efectivo. De momento sigue la preferencia del sistema; en el
 * incremento 7 se añadirá la elección del usuario en Ajustes.
 */
@Injectable({ providedIn: 'root' })
export class ColorSchemeService {
  private readonly query =
    typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  private readonly schemeSignal = signal<ColorScheme>(this.query?.matches ? 'dark' : 'light');
  readonly scheme = this.schemeSignal.asReadonly();

  constructor() {
    this.query?.addEventListener('change', (event) =>
      this.schemeSignal.set(event.matches ? 'dark' : 'light'),
    );
  }
}
