import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IonIcon } from '@ionic/angular';

import { NetworkRepository } from '../../core/data/repositories';
import { ArrivalAlertService } from '../../core/realtime/arrival-alert.service';
import { RealtimeService } from '../../core/realtime/realtime.service';

/**
 * Franja del aviso activo en el inicio (05/10/2026): de qué bus y parada es,
 * cuánto le falta y un botón para quitarlo, sin tener que buscar la parada.
 */
@Component({
  selector: 'app-active-alert-strip',
  imports: [TranslocoPipe, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .strip {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid color-mix(in srgb, var(--app-accent) 35%, transparent);
      border-radius: 16px;
      background: var(--app-accent-soft);
      color: var(--ion-text-color);
    }
    .bell {
      display: grid;
      flex: none;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: var(--app-accent);
      color: #fff;
    }
    p {
      flex: 1;
      margin: 0;
      font-size: 0.9rem;
    }
    button {
      flex: none;
      min-height: 44px;
      padding: 0 12px;
      border: 1.5px solid var(--app-accent);
      border-radius: 12px;
      background: transparent;
      color: var(--app-accent);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    button:focus-visible {
      outline: 3px solid var(--ion-color-primary);
      outline-offset: 2px;
    }
  `,
  template: `
    @if (view(); as alert) {
      <div class="strip" role="status">
        <span class="bell" aria-hidden="true"><ion-icon name="notifications" /></span>
        <p>
          {{
            'alert.strip'
              | transloco: { minutes: alert.minutes, line: alert.lineId, stop: alert.stop }
          }}
          @if (alert.left !== null) {
            · {{ 'alert.stripLeft' | transloco: { minutes: alert.left } }}
          }
        </p>
        <button type="button" (click)="alerts.cancel()">{{ 'alert.cancel' | transloco }}</button>
      </div>
    }
  `,
})
export class ActiveAlertStripComponent {
  protected readonly alerts = inject(ArrivalAlertService);
  private readonly network = inject(NetworkRepository);
  /** Se recalcula con cada dato del tiempo real (y el reloj del servicio). */
  private readonly now = inject(RealtimeService).now;

  protected readonly view = computed(() => {
    const alert = this.alerts.alert();
    if (!alert) return null;
    this.now();
    const left = Math.round((alert.expectedAt - Date.now()) / 60_000);
    return {
      minutes: alert.minutes,
      lineId: alert.lineId,
      stop: this.network.getStop(alert.stopId)?.name ?? alert.stopId,
      left: left >= 0 && left < 120 ? left : null,
    };
  });
}
