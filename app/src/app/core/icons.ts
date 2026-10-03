import { addIcons } from 'ionicons';
import {
  busOutline,
  layersOutline,
  locationOutline,
  mapOutline,
  navigateOutline,
  settingsOutline,
  starOutline,
  timeOutline,
} from 'ionicons/icons';

/**
 * Registra solo los iconos que usa la app: se incluyen en el paquete por
 * importación explícita en vez de descargarse sueltos.
 */
export function registerAppIcons(): void {
  addIcons({
    busOutline,
    layersOutline,
    locationOutline,
    mapOutline,
    navigateOutline,
    settingsOutline,
    starOutline,
    timeOutline,
  });
}
