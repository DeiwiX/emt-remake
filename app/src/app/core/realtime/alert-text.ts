/**
 * Textos de "Avísame" según el transporte (17/10/2026): en el metro se habla
 * de trenes y no hay tiempo real. Los textos que cambian están en "alertMetro";
 * el resto son los de "alert".
 */
const METRO_KEYS = new Set([
  'notifyForBus',
  'notifyMeLine',
  'chooseBus',
  'chooseMinutesFor',
  'activeToday',
  'activeTomorrow',
  'activeLater',
  'title',
  'trackingTitle',
  'trackingWaiting',
  'strip',
]);

/** Clave de traducción de un texto de aviso ("alert.chooseBus" o "alertMetro.chooseBus"). */
export function alertKey(key: string, metro: boolean): string {
  return metro && METRO_KEYS.has(key) ? `alertMetro.${key}` : `alert.${key}`;
}
