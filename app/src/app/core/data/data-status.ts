/** De dónde vienen los datos que se están mostrando. */
export type DataOrigin =
  /** Descargados ahora mismo. */
  | 'network'
  /** Guardados en el dispositivo en una sesión anterior. */
  | 'cache'
  /** Copia incluida en la app, para el primer arranque sin conexión. */
  | 'bundled';

export type DataStatus =
  | { readonly state: 'loading' }
  /** No hay ningún dato que mostrar (ni descargado, ni guardado, ni incluido). */
  | { readonly state: 'unavailable' }
  | {
      readonly state: 'ready';
      readonly origin: DataOrigin;
      /** Fecha en que se generaron los datos a partir de las fuentes oficiales. */
      readonly generatedAt: Date;
      /** true si la última comprobación de actualizaciones falló (sin conexión o fuente caída). */
      readonly updateFailed: boolean;
      readonly checking: boolean;
    };
