import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { ComingSoonComponent } from '../../shared/coming-soon/coming-soon.component';

@Component({
  selector: 'app-settings',
  imports: [
    RouterLink,
    TranslocoPipe,
    ComingSoonComponent,
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonTitle,
    IonToolbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/" [text]="'common.back' | transloco" />
        </ion-buttons>
        <ion-title>{{ 'settings.title' | transloco }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <app-coming-soon [increment]="7" />
      <ion-list>
        <ion-item routerLink="/about" detail>
          <ion-label>{{ 'about.title' | transloco }}</ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  `,
})
export class SettingsPage {}
