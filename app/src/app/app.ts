import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

import { registerAppIcons } from './core/icons';
import { BottomNavComponent } from './shared/bottom-nav/bottom-nav.component';

@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet, BottomNavComponent],
  styles: `
    /* Las pantallas ocupan el alto que deja la barra inferior. */
    .outlet {
      position: relative;
      flex: 1;
      min-height: 0;
    }
  `,
  template: `
    <ion-app>
      <div class="outlet"><ion-router-outlet /></div>
      <app-bottom-nav />
    </ion-app>
  `,
})
export class App {
  constructor() {
    registerAppIcons();
  }
}
