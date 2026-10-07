import { Injectable, computed, inject } from '@angular/core';

import { LiveContextService } from './live-context.service';
import { LiveContext } from './live-estimate';
import { VehicleTrackerService } from './vehicle-tracker.service';

/**
 * Contexto para calcular llegadas en las pantallas: el de LiveContextService
 * (viajes del horario y ritmo) más, mientras se dibujan autobuses en un mapa, su
 * avance actual. Así "llega en 1 min" y la posición en el mapa no se contradicen.
 */
@Injectable({ providedIn: 'root' })
export class ArrivalContextService {
  private readonly live = inject(LiveContextService);
  private readonly tracker = inject(VehicleTrackerService);

  readonly context = computed<LiveContext>(() => {
    const base = this.live.context();
    if (!this.tracker.active()) return base;
    const progress = this.tracker.progress();
    return { ...base, progressOf: (vehicleId) => progress.get(vehicleId) };
  });
}
