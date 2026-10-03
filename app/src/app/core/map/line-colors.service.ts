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
  private readonly assignment = computed(() => assignLineColors(this.lines()));

  colorFor(lineId: string): LineColor {
    return this.assignment().get(lineId)?.[this.scheme()] ?? FALLBACK;
  }
}
