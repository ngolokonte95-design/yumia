/**
 * Nom d'un rayon de la boutique dans la langue active.
 *
 * La base ne stocke que `nameFr` (apps/api/src/modules/shop/shop-categories.ts).
 * Les traductions vivent ici, sous `shop_catname_<slug>` (tirets → soulignés).
 * Un rayon ajouté côté serveur sans traduction s'affiche en français plutôt
 * qu'avec le nom de sa clé.
 */
import type { TranslationKey } from './translations';

export function shopCategoryName(
  t: (key: TranslationKey) => string,
  slug: string | null | undefined,
  nameFr: string,
): string {
  if (!slug) return nameFr;
  const key = `shop_catname_${slug.replace(/-/g, '_')}` as TranslationKey;
  const translated = t(key);
  return translated && translated !== key ? translated : nameFr;
}
