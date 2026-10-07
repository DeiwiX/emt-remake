import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { NetworkRepository } from '../../core/data/repositories';
import { DataDateComponent } from '../../shared/data-date/data-date.component';
import { DataStatusBannerComponent } from '../../shared/data-status-banner/data-status-banner.component';
import { LineListComponent } from '../../shared/line-list/line-list.component';

/** Todas las líneas, navegables sin mapa (RF-06). */
@Component({
  selector: 'app-lines',
  imports: [
    DataDateComponent,
    TranslocoPipe,
    DataStatusBannerComponent,
    LineListComponent,
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/" [text]="'common.back' | transloco" />
        </ion-buttons>
        <ion-title>{{ 'lines.title' | transloco }}</ion-title>
        <app-data-date slot="end" />
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <app-data-status-banner />
      @if (lines().length > 0) {
        <app-line-list [lines]="lines()" [label]="'lines.title' | transloco" />
      }
    </ion-content>
  `,
})
export class LinesPage {
  protected readonly lines = inject(NetworkRepository).lines;
}
