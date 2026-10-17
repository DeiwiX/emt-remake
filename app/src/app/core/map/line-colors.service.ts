import { Injectable, computed, inject } from '@angular/core';

import { NetworkRepository } from '../data/repositories';
import { ColorSchemeService } from '../theme/color-scheme.service';
import { LineColor, assignLineColors } from './line-palette';

/** Color en reserva para una línea desconocida (no debería ocurrir con datos válidos). */
const FALLBACK: LineColor = { line: '#5A5A5A', text: '#FFFFFF' };

/** Color de cada línea según el tema activo. Lo usan las insignias y el mapa. */
@Injectable({ providedIn: 'root' })
export class LineColorsService {
  private readonly scheme = inject(ColorSchemeService).scheme;
  private readonly lines = inject(NetworkRepository).lines;
  /**
   * Las líneas con color oficial (el metro: L1 rojo, L2 azul) lo conservan; al
   * resto se les reparte la paleta propia.
   */
  private readonly assignment = computed(() => {
    const lines = this.lines();
    const map = assignLineColors(lines.filter((l) => !l.color));
    for (const line of lines) {
      if (line.color) {
        const official: LineColor = { line: line.color, text: '#FFFFFF' };
        map.set(line.id, { light: official, dark: official });
      }
    }
    return map;
  });

  colorFor(lineId: string): LineColor {
    return this.assignment().get(lineId)?.[this.scheme()] ?? FALLBACK;
  }
}
