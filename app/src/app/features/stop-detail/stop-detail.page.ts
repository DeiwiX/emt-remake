import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { ComingSoonComponent } from '../../shared/coming-soon/coming-soon.component';

@Component({
  selector: 'app-stop-detail',
  imports: [
    TranslocoPipe,
    ComingSoonComponent,
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/stops" [text]="'common.back' | transloco" />
        </ion-buttons>
        <ion-title>{{ 'stopDetail.title' | transloco: { id: stopId() } }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <app-coming-soon [increment]="6" />
    </ion-content>
  `,
})
export class StopDetailPage {
  /** Recibido desde la ruta gracias a withComponentInputBinding. */
  readonly stopId = input.required<string>();
}
