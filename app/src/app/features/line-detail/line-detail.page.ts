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
  selector: 'app-line-detail',
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
          <ion-back-button defaultHref="/lines" [text]="'common.back' | transloco" />
        </ion-buttons>
        <ion-title>{{ 'lineDetail.title' | transloco: { id: lineId() } }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <app-coming-soon [increment]="6" />
    </ion-content>
  `,
})
export class LineDetailPage {
  /** Recibido desde la ruta gracias a withComponentInputBinding. */
  readonly lineId = input.required<string>();
}
