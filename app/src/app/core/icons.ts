import { addIcons } from 'ionicons';
import {
  arrowForward,
  busOutline,
  chevronDown,
  chevronForward,
  createOutline,
  layersOutline,
  locateOutline,
  locationOutline,
  mapOutline,
  navigateOutline,
  notifications,
  notificationsOutline,
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
    chevronDown,
    chevronForward,
    createOutline,
    layersOutline,
    locateOutline,
    locationOutline,
    mapOutline,
    navigateOutline,
    notifications,
    notificationsOutline,
    settingsOutline,
    star,
    starOutline,
    swapVerticalOutline,
    timeOutline,
    trailSignOutline,
  });
}
