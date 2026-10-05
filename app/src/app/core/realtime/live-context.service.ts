import { Injectable, computed, inject } from '@angular/core';

import { ScheduleClockService } from '../schedule/schedule-clock.service';
import { ScheduledTrip, scheduledTrips } from '../schedule/schedule';
import { LiveContext } from './live-estimate';
import { RealtimeService } from './realtime.service';

/**
 * Contexto para afinar el tiempo real (Fase 6): los viajes del horario y el
 * dato anterior de cada autobús. Lo comparten la llegada estimada, los avisos
 * y los autobuses del mapa.
 */
@Injectable({ providedIn: 'root' })
export class LiveContextService {
  private readonly schedule = inject(ScheduleClockService);
  private readonly realtime = inject(RealtimeService);

  readonly context = computed<LiveContext>(() => {
    const timetables = this.schedule.timetables();
    const previous = this.realtime.previous();
    const cache = new Map<string, readonly ScheduledTrip[]>();
    return {
      trips: timetables
        ? (lineId, directionId, dateKey) => {
            const key = `${lineId}|${directionId}|${dateKey}`;
            let trips = cache.get(key);
            if (!trips) {
              trips = scheduledTrips(timetables, lineId, directionId, dateKey);
              cache.set(key, trips);
            }
            return trips;
          }
        : undefined,
      previous: (vehicleId) => previous.get(vehicleId),
    };
  });

  constructor() {
    if (this.realtime.available) void this.schedule.load();
  }
}
