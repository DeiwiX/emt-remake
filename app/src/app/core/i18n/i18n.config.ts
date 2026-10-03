export const AVAILABLE_LANGS = ['es', 'en'] as const;
export type AppLang = (typeof AVAILABLE_LANGS)[number];
export const DEFAULT_LANG: AppLang = 'es';
