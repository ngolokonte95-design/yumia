/**
 * Assistant Idées cadeaux.
 *
 * Ne stocke rien et n'interroge aucun partenaire : il traduit trois réponses
 * (pour qui / quelle occasion / quel budget) en un filtre sur le catalogue de
 * la boutique, puis délègue à `CatalogService.listProducts` — donc même tri,
 * même pagination, et même masquage du prix d'achat aux non-admins.
 */
import { Injectable } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import {
  GIFT_BUDGETS,
  GIFT_OCCASIONS,
  GIFT_RECIPIENTS,
  categoriesFor,
  timingOf,
  type GiftBudget,
  type GiftOccasion,
  type GiftRecipient,
} from './gift-guide';

@Injectable()
export class GiftService {
  constructor(private readonly catalog: CatalogService) {}

  /**
   * Les trois listes de choix, occasions triées par imminence.
   *
   * L'ordre n'est pas cosmétique : le 10 octobre, Halloween doit arriver en
   * tête, et Noël début décembre. Une liste figée obligerait l'utilisateur à
   * chercher l'occasion qui le concerne au moment même où elle est évidente.
   */
  options(now: Date = new Date()) {
    const occasions = GIFT_OCCASIONS.map((o) => {
      const t = timingOf(o, now);
      return {
        slug: o.slug,
        label: o.label,
        emoji: o.emoji,
        date: t.date ? t.date.toISOString().slice(0, 10) : null,
        daysUntil: t.daysUntil,
        isNow: t.isNow,
      };
    }).sort((a, b) => {
      // Les occasions en cours d'abord, de la plus proche à la plus lointaine.
      // Les permanentes (anniversaire, « juste pour offrir ») ferment la
      // marche : elles sont toujours valables, jamais urgentes.
      if (a.isNow !== b.isNow) return a.isNow ? -1 : 1;
      if (a.daysUntil === null) return b.daysUntil === null ? 0 : 1;
      if (b.daysUntil === null) return -1;
      return a.daysUntil - b.daysUntil;
    });

    return {
      occasions,
      recipients: GIFT_RECIPIENTS.map(({ slug, label, emoji }) => ({ slug, label, emoji })),
      budgets: GIFT_BUDGETS.map(({ slug, label, minCents, maxCents }) => ({ slug, label, minCents, maxCents })),
    };
  }

  /**
   * Les idées correspondant aux réponses. Chaque critère est facultatif —
   * l'utilisateur qui ne sait rien de plus que « c'est pour un enfant » doit
   * quand même obtenir une sélection.
   */
  async suggest(
    params: { recipient?: string; occasion?: string; budget?: string; page?: number; pageSize?: number },
    isAdmin = false,
  ) {
    const recipient = this.find(GIFT_RECIPIENTS, params.recipient);
    const occasion = this.find(GIFT_OCCASIONS, params.occasion);
    const budget = this.find(GIFT_BUDGETS, params.budget);

    const categorySlugs = categoriesFor(recipient, occasion);

    const result = await this.catalog.listProducts(
      {
        categorySlugs: categorySlugs.length ? categorySlugs : undefined,
        minPriceCents: budget?.minCents || undefined,
        maxPriceCents: budget?.maxCents ?? undefined,
        // Tri par défaut : mis en avant, puis meilleures ventes, puis note.
        // C'est exactement ce qu'on veut pour un cadeau — les valeurs sûres
        // d'abord, pas les derniers imports non éprouvés.
        page: params.page,
        pageSize: params.pageSize,
      },
      isAdmin,
    );

    return {
      ...result,
      criteria: {
        recipient: recipient ? { slug: recipient.slug, label: recipient.label, emoji: recipient.emoji } : null,
        occasion: occasion ? { slug: occasion.slug, label: occasion.label, emoji: occasion.emoji } : null,
        budget: budget ? { slug: budget.slug, label: budget.label } : null,
        categorySlugs,
      },
    };
  }

  /** Retrouve une entrée par slug, en ignorant un slug inconnu plutôt qu'en échouant. */
  private find<T extends { slug: string }>(list: readonly T[], slug?: string): T | undefined {
    return slug ? list.find((x) => x.slug === slug) : undefined;
  }
}
