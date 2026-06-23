"use strict";
/**
 * Internationalisation native (jour 1) : multi-langues (dont RTL), multi-devises.
 * 5 langues au MVP ; l'ensemble est extensible vers 30+.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLocale = exports.DEFAULT_CURRENCY = exports.CURRENCIES = exports.DEFAULT_LOCALE = exports.LOCALE_META = exports.MVP_LOCALES = void 0;
exports.MVP_LOCALES = ['fr', 'en', 'es', 'pt', 'ar'];
exports.LOCALE_META = {
    fr: { code: 'fr', nameFr: 'Français', rtl: false },
    en: { code: 'en', nameFr: 'Anglais', rtl: false },
    es: { code: 'es', nameFr: 'Espagnol', rtl: false },
    pt: { code: 'pt', nameFr: 'Portugais', rtl: false },
    ar: { code: 'ar', nameFr: 'Arabe', rtl: true },
};
exports.DEFAULT_LOCALE = 'fr';
/** Devises supportées pour YUMIA Plus (prix adapté au pouvoir d'achat local). */
exports.CURRENCIES = ['EUR', 'USD', 'GBP', 'BRL', 'AED', 'CAD', 'JPY'];
exports.DEFAULT_CURRENCY = 'EUR';
const isLocale = (v) => exports.MVP_LOCALES.includes(v);
exports.isLocale = isLocale;
