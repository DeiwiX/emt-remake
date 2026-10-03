import { Injectable, computed, inject } from '@angular/core';

import { NetworkRepository } from '../data/repositories';
import { ColorSchemeService } from '../theme/color-scheme.service';
import { LINE_PALETTE, LineColor, assignLineColors } from './line-palette';

/** Color de cada línea según el tema activo. Lo usan las insignias y el mapa. */
@Injectable({ providedIn: 'root' })
export class LineColorsService {
  private readonly scheme = inject(ColorSchemeService).scheme;
  private readonly lines = inject(NetworkRepository).lines;
  private readonly assignment = computed(() => assignLineColors(this.lines()));

  colorFor(lineId: string): LineColor {
    const index = this.assignment().get(lineId) ?? 0;
    return LINE_PALETTE[index]![this.scheme()];
  }
}
