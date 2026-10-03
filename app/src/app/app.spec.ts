import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';

import { App } from './app';

describe('App', () => {
  it('se crea con el contenedor de Ionic', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideIonicAngular()],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    const element = fixture.nativeElement as HTMLElement;

    expect(fixture.componentInstance).toBeTruthy();
    expect(element.querySelector('ion-app')).not.toBeNull();
  });
});
