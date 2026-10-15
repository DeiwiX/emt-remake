import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SearchbarLabelDirective } from './searchbar-label.directive';

@Component({
  imports: [SearchbarLabelDirective],
  template: `<ion-searchbar [appSearchbarLabel]="label()" />`,
})
class HostComponent {
  readonly label = signal('Origen');
}

describe('SearchbarLabelDirective', () => {
  it('pone el nombre en el campo de Ionic y en el componente, y lo cambia con el idioma', async () => {
    const field = document.createElement('input');
    const fixture = TestBed.configureTestingModule({ imports: [HostComponent] }).createComponent(
      HostComponent,
    );
    const searchbar = fixture.nativeElement.querySelector('ion-searchbar');
    searchbar.getInputElement = () => Promise.resolve(field);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(searchbar.getAttribute('aria-label')).toBe('Origen');
    expect(field.getAttribute('aria-label')).toBe('Origen');

    fixture.componentInstance.label.set('From');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(field.getAttribute('aria-label')).toBe('From');
  });
});
