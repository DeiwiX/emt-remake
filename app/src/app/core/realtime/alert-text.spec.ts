import es from '../../../../public/i18n/es.json';
import { alertKey } from './alert-text';

describe('Textos de "Avísame" en el metro', () => {
  it('en el metro usa los textos de tren donde los hay', () => {
    expect(alertKey('chooseBus', true)).toBe('alertMetro.chooseBus');
    expect(alertKey('chooseBus', false)).toBe('alert.chooseBus');
    // Los que son iguales para los dos, de "alert".
    expect(alertKey('option', true)).toBe('alert.option');
  });

  it('cada texto de metro existe en las traducciones', () => {
    const metro = es.alertMetro as Record<string, string>;
    for (const key of [
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
    ]) {
      expect(alertKey(key, true)).toBe(`alertMetro.${key}`);
      expect(metro[key]).toBeTruthy();
    }
  });
});
