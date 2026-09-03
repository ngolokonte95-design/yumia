/**
 * Internationalisation native (jour 1) : multi-langues (dont RTL), multi-devises.
 * 5 langues au MVP ; l'ensemble est extensible vers 30+.
 */

export const MVP_LOCALES = [
  'fr', 'en', 'es', 'pt', 'ar',
  'nl', 'it', 'zh', 'ru', 'hi', 'de', 'pl', 'sv',
] as const;
export type Locale = (typeof MVP_LOCALES)[number];

export interface LocaleMeta {
  code: Locale;
  nameFr: string;
  rtl: boolean;
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  fr: { code: 'fr', nameFr: 'Français', rtl: false },
  en: { code: 'en', nameFr: 'Anglais', rtl: false },
  es: { code: 'es', nameFr: 'Espagnol', rtl: false },
  pt: { code: 'pt', nameFr: 'Portugais', rtl: false },
  ar: { code: 'ar', nameFr: 'Arabe', rtl: true },
  nl: { code: 'nl', nameFr: 'Néerlandais', rtl: false },
  it: { code: 'it', nameFr: 'Italien', rtl: false },
  zh: { code: 'zh', nameFr: 'Chinois', rtl: false },
  ru: { code: 'ru', nameFr: 'Russe', rtl: false },
  hi: { code: 'hi', nameFr: 'Hindi', rtl: false },
  de: { code: 'de', nameFr: 'Allemand', rtl: false },
  pl: { code: 'pl', nameFr: 'Polonais', rtl: false },
  sv: { code: 'sv', nameFr: 'Suédois', rtl: false },
};

export const DEFAULT_LOCALE: Locale = 'fr';

/** Devises supportées pour YUMIA Plus (prix adapté au pouvoir d'achat local). */
export const CURRENCIES = ['EUR', 'USD', 'GBP', 'BRL', 'AED', 'CAD', 'JPY'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const DEFAULT_CURRENCY: Currency = 'EUR';

export const isLocale = (v: string): v is Locale => (MVP_LOCALES as readonly string[]).includes(v);
