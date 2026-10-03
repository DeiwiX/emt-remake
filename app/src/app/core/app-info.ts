/** Datos fijos de la app que se muestran en "Acerca de". */
export const APP_INFO = {
  version: '0.1.0',
  sourceUrl: 'https://github.com/DeiwiX/emt-remake',
  dataPortalName: 'datosabiertos.malaga.eu',
  dataPortalUrl: 'https://datosabiertos.malaga.eu/group/transporte',
  // La ficha del portal es contradictoria (BY frente a BY-SA); se asume la más restrictiva (ADR 0002).
  dataLicense: 'CC BY-SA 4.0',
  dataLicenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/deed.es',
} as const;
