/**
 * Internationalisation native (jour 1) : multi-langues (dont RTL), multi-devises.
 * 5 langues au MVP ; l'ensemble est extensible vers 30+.
 */
export declare const MVP_LOCALES: readonly ["fr", "en", "es", "pt", "ar"];
export type Locale = (typeof MVP_LOCALES)[number];
export interface LocaleMeta {
    code: Locale;
    nameFr: string;
    rtl: boolean;
}
export declare const LOCALE_META: Record<Locale, LocaleMeta>;
export declare const DEFAULT_LOCALE: Locale;
/** Devises supportées pour YUMIA Plus (prix adapté au pouvoir d'achat local). */
export declare const CURRENCIES: readonly ["EUR", "USD", "GBP", "BRL", "AED", "CAD", "JPY"];
export type Currency = (typeof CURRENCIES)[number];
export declare const DEFAULT_CURRENCY: Currency;
export declare const isLocale: (v: string) => v is Locale;
