import { addIcons } from 'ionicons';
import {
  arrowForward,
  busOutline,
  layersOutline,
  locateOutline,
  locationOutline,
  mapOutline,
  navigateOutline,
  settingsOutline,
  star,
  starOutline,
  swapVerticalOutline,
  timeOutline,
  trailSignOutline,
} from 'ionicons/icons';

/**
 * Registra solo los iconos que usa la app: se incluyen en el paquete por
 * importación explícita en vez de descargarse sueltos.
 */
export function registerAppIcons(): void {
  addIcons({
    arrowForward,
    busOutline,
    layersOutline,
    locateOutline,
    locationOutline,
    mapOutline,
    navigateOutline,
    settingsOutline,
    star,
    starOutline,
    swapVerticalOutline,
    timeOutline,
    trailSignOutline,
  });
}
