/**
 * Libellés de l'assistant Idées cadeaux dans la langue active.
 *
 * Le serveur (apps/api/src/modules/shop/gift-guide.ts) renvoie destinataires,
 * occasions et budgets avec un `slug` stable et un libellé français. Les
 * traductions vivent ici : `shop_giftr_<slug>` (destinataire), `shop_gifto_`
 * (occasion), `shop_giftb_` (budget), tirets → soulignés. Un choix ajouté côté
 * serveur sans traduction s'affiche en français.
 */
import type { TranslationKey } from './translations';

export type GiftChoiceKind = 'recipient' | 'occasion' | 'budget';

const PREFIX: Record<GiftChoiceKind, string> = {
  recipient: 'shop_giftr_',
  occasion: 'shop_gifto_',
  budget: 'shop_giftb_',
};

export function giftChoiceLabel(
  t: (key: TranslationKey) => string,
  kind: GiftChoiceKind,
  slug: string,
  labelFr: string,
): string {
  const key = `${PREFIX[kind]}${slug.replace(/-/g, '_')}` as TranslationKey;
  const translated = t(key);
  return translated && translated !== key ? translated : labelFr;
}
