import { Directive, ElementRef, effect, inject, input } from '@angular/core';

/**
 * Nombre accesible del campo de un ion-searchbar (Fase 9). Ionic copia el
 * aria-label del componente a su campo solo al crearse, antes de que llegue
 * la traducción, así que TalkBack anunciaba "search text". Aquí se pone en el
 * campo cada vez que cambia el texto, y también en el componente.
 */
@Directive({
  selector: 'ion-searchbar[appSearchbarLabel]',
  // El componente es una región de búsqueda: también lleva el nombre, para distinguir
  // dos en la misma pantalla (Origen y Destino en "Cómo llegar").
  host: { '[attr.aria-label]': 'appSearchbarLabel()' },
})
export class SearchbarLabelDirective {
  readonly appSearchbarLabel = input.required<string>();
  private readonly host = inject<ElementRef<HTMLIonSearchbarElement>>(ElementRef);

  constructor() {
    effect(() => {
      const label = this.appSearchbarLabel();
      const searchbar = this.host.nativeElement;
      // En las pruebas no hay componente de Ionic: entonces no hay campo que nombrar.
      void searchbar.getInputElement?.().then((field) => field.setAttribute('aria-label', label));
    });
  }
}
