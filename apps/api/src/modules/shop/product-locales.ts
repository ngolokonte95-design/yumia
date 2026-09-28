/**
 * Langues de la boutique et correspondance vers les langues d'AliExpress.
 *
 * Le catalogue est importé en français : c'est la langue de référence,
 * stockée sur `Product`. Les autres langues viennent d'AliExpress
 * (`target_language`) et sont gardées dans `ProductTranslation`.
 */

/** Les 13 langues de l'app (apps/mobile/lib/locales.ts — SUPPORTED_LOCALES). */
export const SHOP_LOCALES = [
  'fr', 'en', 'es', 'pt', 'ar', 'nl', 'it', 'de', 'pl', 'sv', 'zh', 'ru', 'hi',
] as const;
export type ShopLocale = (typeof SHOP_LOCALES)[number];

/**
 * `?locale=` arrive du client tel quel : toute valeur hors des 13 langues
 * (absente, 'en-US', injection…) retombe sur le français plutôt que de
 * provoquer une erreur ou un appel AliExpress inutile.
 */
export function normalizeShopLocale(value?: string | null): ShopLocale {
  const v = String(value ?? '').trim().toLowerCase();
  return (SHOP_LOCALES as readonly string[]).includes(v) ? (v as ShopLocale) : 'fr';
}

/** Où chercher/stocker la traduction, et quelle langue demander à AliExpress. */
export interface TranslationTarget {
  /** Locale sous laquelle la traduction est stockée dans `ProductTranslation`. */
  storeLocale: string;
  /** Valeur de `target_language` envoyée à AliExpress. */
  aliexpressLanguage: string;
}

/**
 * Langues qu'AliExpress traduit de façon fiable, sous leur code AliExpress.
 * Le suédois, le chinois et le hindi n'en font pas partie : les réponses sont
 * incomplètes ou restent en anglais selon les fiches.
 */
const ALIEXPRESS_LANGUAGES: Partial<Record<ShopLocale, string>> = {
  en: 'EN', es: 'ES', pt: 'PT', ar: 'AR', nl: 'NL', it: 'IT', de: 'DE', pl: 'PL', ru: 'RU',
};

/**
 * Cible de traduction pour une locale de l'app, ou `null` pour le français
 * (aucun appel : le texte d'origine est déjà sur `Product`).
 *
 * sv/zh/hi reçoivent l'anglais, stocké sous 'en' : une seule traduction sert
 * alors à quatre langues, et l'anglais reste plus lisible qu'un français que
 * ces utilisateurs ne lisent pas.
 */
export function translationTarget(locale: string): TranslationTarget | null {
  const l = normalizeShopLocale(locale);
  if (l === 'fr') return null;
  const ae = ALIEXPRESS_LANGUAGES[l];
  if (ae) return { storeLocale: l, aliexpressLanguage: ae };
  return { storeLocale: 'en', aliexpressLanguage: 'EN' };
}
