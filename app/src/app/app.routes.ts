import { Routes } from '@angular/router';

/**
 * Todas las pantallas se cargan de forma diferida para mantener pequeño
 * el paquete inicial (RNF-02).
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'lines',
    loadComponent: () => import('./features/lines/lines.page').then((m) => m.LinesPage),
  },
  {
    path: 'lines/:lineId',
    loadComponent: () =>
      import('./features/line-detail/line-detail.page').then((m) => m.LineDetailPage),
  },
  {
    path: 'stops',
    loadComponent: () => import('./features/stops/stops.page').then((m) => m.StopsPage),
  },
  {
    path: 'stops/:stopId',
    loadComponent: () =>
      import('./features/stop-detail/stop-detail.page').then((m) => m.StopDetailPage),
  },
  {
    path: 'map',
    loadComponent: () => import('./features/map/map.page').then((m) => m.MapPage),
  },
  {
    path: 'near',
    loadComponent: () => import('./features/near/near.page').then((m) => m.NearPage),
  },
  {
    path: 'plan',
    loadComponent: () => import('./features/plan/plan.page').then((m) => m.PlanPage),
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage),
  },
  {
    path: 'about',
    loadComponent: () => import('./features/about/about.page').then((m) => m.AboutPage),
  },
  { path: '**', redirectTo: '' },
];
