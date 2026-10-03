import { Component } from '@angular/core';
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
  selector: 'app-lines',
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
          <ion-back-button defaultHref="/" [text]="'common.back' | transloco" />
        </ion-buttons>
        <ion-title>{{ 'lines.title' | transloco }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <app-coming-soon [increment]="4" />
    </ion-content>
  `,
})
export class LinesPage {}
