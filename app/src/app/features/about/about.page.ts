import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { DataDateComponent } from '../../shared/data-date/data-date.component';

import { APP_INFO } from '../../core/app-info';
import { DataStatusService } from '../../core/data/repositories';

/** Acerca de (RF-11): aviso de app no oficial, origen y licencia de los datos, mapa y privacidad. */
@Component({
  selector: 'app-about',
  imports: [
    DataDateComponent,
    TranslocoPipe,
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    section {
      padding: 0 16px;
    }
    h2 {
      font-size: 1.15rem;
      margin-top: 24px;
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/settings" [text]="'common.back' | transloco" />
        </ion-buttons>
        <ion-title>{{ 'about.title' | transloco }}</ion-title>
        <app-data-date slot="end" />
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <section>
        <h1>{{ 'app.name' | transloco }}</h1>
        <p>{{ 'about.version' | transloco: { version: info.version } }}</p>
        <p>
          <strong>{{ 'app.unofficialNotice' | transloco }}</strong>
        </p>
        <p>{{ 'about.unofficialDetail' | transloco }}</p>
      </section>

      <section>
        <h2>{{ 'about.dataTitle' | transloco }}</h2>
        <p>{{ 'about.dataSource' | transloco }}</p>
        <p>
          <a [href]="info.dataPortalUrl" target="_blank" rel="noopener">{{
            info.dataPortalName
          }}</a>
        </p>
        <p>
          {{ 'about.dataLicense' | transloco }}
          <a [href]="info.dataLicenseUrl" target="_blank" rel="noopener">{{ info.dataLicense }}</a>
        </p>
        @if (dataDate(); as date) {
          <p>{{ 'about.dataDate' | transloco: { date } }}</p>
        }
        <p>{{ 'about.dataDisclaimer' | transloco }}</p>
      </section>

      <section>
        <h2>{{ 'about.mapTitle' | transloco }}</h2>
        <p>
          {{ 'about.mapData' | transloco }}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener"
            >© OpenStreetMap contributors</a
          >
          (ODbL).
        </p>
        <p>
          {{ 'about.mapTiles' | transloco }}
          <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>
          ·
          <a href="https://openmaptiles.org" target="_blank" rel="noopener">© OpenMapTiles</a>
        </p>
        <p>
          {{ 'about.mapSatellite' | transloco }}
          <a href="https://www.ign.es" target="_blank" rel="noopener"
            >PNOA cedido por © Instituto Geográfico Nacional</a
          >
          (CC BY 4.0 scne.es).
        </p>
      </section>

      <section>
        <h2>{{ 'about.privacyTitle' | transloco }}</h2>
        <p>{{ 'about.privacy' | transloco }}</p>
      </section>

      <section>
        <h2>{{ 'about.codeTitle' | transloco }}</h2>
        <p>
          <a [href]="info.sourceUrl" target="_blank" rel="noopener">{{ info.sourceUrl }}</a>
        </p>
      </section>
    </ion-content>
  `,
})
export class AboutPage {
  protected readonly info = APP_INFO;
  private readonly status = inject(DataStatusService).status;
  private readonly lang = toSignal(inject(TranslocoService).langChanges$, { requireSync: true });

  protected readonly dataDate = computed(() => {
    const status = this.status();
    return status.state === 'ready'
      ? new Intl.DateTimeFormat(this.lang(), { dateStyle: 'long' }).format(status.generatedAt)
      : null;
  });
}
