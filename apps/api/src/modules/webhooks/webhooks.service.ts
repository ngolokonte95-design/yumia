import { Injectable, Logger } from '@nestjs/common';
import type { Plan } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * Événements RevenueCat qui donnent ou prolongent l'accès à un plan payant.
 *
 * PRODUCT_CHANGE n'y figure pas : il est traité à part (voir
 * handleProductChange), car un changement vers un palier INFÉRIEUR ne prend
 * effet qu'au renouvellement suivant.
 */
const UPGRADE_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_EXTENDED',
  'REFUND_REVERSED',
]);

/**
 * Événements qui mettent FIN à l'accès.
 *
 * CANCELLATION n'y figure pas : il signifie seulement que le renouvellement
 * automatique est coupé — l'abonné garde son accès jusqu'à la fin de la
 * période payée, et c'est EXPIRATION qui arrive alors. Seule exception, le
 * remboursement, que RevenueCat signale par un CANCELLATION de motif
 * CUSTOMER_SUPPORT (voir isRefund). REFUND n'est pas un type RevenueCat
 * documenté ; il reste accepté par prudence.
 *
 * SUBSCRIBER_ALIAS (événement déprécié) ne touche à aucun accès : il
 * signale seulement que deux identifiants désignent le même client.
 */
const DOWNGRADE_EVENTS = new Set(['EXPIRATION', 'REFUND']);

/** Rang des paliers, pour comparer « au-dessus » / « en dessous ». */
const PLAN_RANK: Record<Plan, number> = { free: 0, plus: 1, gold: 2, diamond: 3 };

/**
 * Identifiants d'entitlement RevenueCat, du plus élevé au plus bas — à créer
 * dans le dashboard RevenueCat (Entitlements) avec exactement ces noms.
 * Un utilisateur ne peut avoir qu'un abonnement actif à la fois : on prend
 * le premier entitlement trouvé dans cet ordre de priorité.
 */
const ENTITLEMENT_TO_PLAN: Array<[string, Plan]> = [
  ['diamond', 'diamond'],
  ['gold', 'gold'],
  ['plus', 'plus'],
];

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Traite un événement RevenueCat et met à jour le plan utilisateur.
   *
   * Champs lus (https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields) :
   * {
   *   event: {
   *     type: string,                    // ex: "INITIAL_PURCHASE"
   *     app_user_id: string,             // UUID de l'utilisateur YUMIA
   *     original_app_user_id?: string,   // repli si app_user_id absent
   *     entitlement_ids?: string[],      // ex: ["gold"] — palier concerné
   *     product_id?: string,             // ex: "yumia_gold_monthly" (repli)
   *     new_product_id?: string,         // PRODUCT_CHANGE : produit visé
   *     cancel_reason?: string,          // CANCELLATION : CUSTOMER_SUPPORT = remboursement
   *     transferred_from?: string[],     // TRANSFER : anciens propriétaires
   *     transferred_to?: string[],       // TRANSFER : nouveaux propriétaires
   *   }
   * }
   */
  async handleRevenueCat(payload: Record<string, unknown>): Promise<void> {
    const event = payload['event'] as Record<string, unknown> | undefined;
    if (!event) {
      this.logger.warn('Payload RevenueCat sans clé "event" — ignoré');
      return;
    }

    const type = String(event['type'] ?? '');

    // TRANSFER ne porte pas forcément d'app_user_id : il désigne ses
    // utilisateurs par transferred_from / transferred_to.
    if (type === 'TRANSFER') {
      await this.handleTransfer(event);
      return;
    }

    const userId =
      String(event['app_user_id'] ?? event['original_app_user_id'] ?? '');

    if (!userId) {
      this.logger.warn(`Événement ${type} sans app_user_id — ignoré`);
      return;
    }

    if (UPGRADE_EVENTS.has(type)) {
      await this.setPlan(userId, this.resolvePlan(event), type);
      return;
    }

    if (type === 'PRODUCT_CHANGE') {
      await this.handleProductChange(userId, event);
      return;
    }

    if (DOWNGRADE_EVENTS.has(type) || (type === 'CANCELLATION' && this.isRefund(event))) {
      await this.handleEndOfAccess(userId, event, type);
      return;
    }

    this.logger.debug(`Événement RevenueCat ${type} — aucun changement de plan`);
  }

  /**
   * Un CANCELLATION est un remboursement quand RevenueCat l'attribue au
   * support client (App Store / Google Play) : l'accès est alors retiré
   * immédiatement. Tout autre motif (UNSUBSCRIBE, BILLING_ERROR…) laisse
   * courir la période payée jusqu'à l'EXPIRATION.
   */
  private isRefund(event: Record<string, unknown>): boolean {
    return String(event['cancel_reason'] ?? '').toUpperCase() === 'CUSTOMER_SUPPORT';
  }

  /**
   * Fin d'accès (expiration, remboursement) → retour au gratuit.
   *
   * Garde-fou : si l'abonnement qui prend fin est d'un palier INFÉRIEUR au
   * plan actuel (ancien Gold qui expire après un passage à Diamond), il ne
   * doit pas faire redescendre l'abonné.
   */
  private async handleEndOfAccess(
    userId: string,
    event: Record<string, unknown>,
    type: string,
  ): Promise<void> {
    const endedPlan = this.planFromEvent(event);
    if (endedPlan) {
      const current = await this.currentPlan(userId);
      if (current && PLAN_RANK[endedPlan] < PLAN_RANK[current]) {
        this.logger.log(
          `Événement ${type} sur un palier "${endedPlan}" inférieur au plan actuel "${current}" de ${userId} — ignoré`,
        );
        return;
      }
    }
    await this.setPlan(userId, 'free', type);
  }

  /**
   * Changement de produit. Une MONTÉE de palier est immédiate dans les deux
   * boutiques ; une DESCENTE ne prend effet qu'au renouvellement, qui
   * enverra un RENEWAL portant le nouveau produit — l'appliquer ici retirerait
   * à l'abonné une période qu'il a déjà payée.
   */
  private async handleProductChange(userId: string, event: Record<string, unknown>): Promise<void> {
    const target =
      this.planFromProduct(String(event['new_product_id'] ?? '')) ?? this.resolvePlan(event);
    const current = await this.currentPlan(userId);
    if (current && PLAN_RANK[target] <= PLAN_RANK[current]) {
      this.logger.log(
        `PRODUCT_CHANGE ${current} → ${target} pour ${userId} — appliqué au prochain renouvellement`,
      );
      return;
    }
    await this.setPlan(userId, target, 'PRODUCT_CHANGE');
  }

  /**
   * TRANSFER : les achats d'un ou plusieurs identifiants (transferred_from)
   * passent à d'autres (transferred_to) — typiquement une restauration
   * d'achats depuis un autre compte YUMIA sur le même identifiant Apple /
   * Google.
   *
   * Le palier transféré vient de l'événement quand il le précise
   * (entitlement_ids / product_id), sinon du plan que portaient les anciens
   * propriétaires chez nous. Sans l'un ni l'autre (achats d'un identifiant
   * anonyme), on n'invente pas de palier : le prochain RENEWAL le posera.
   * Les anciens propriétaires, eux, perdent l'accès.
   */
  private async handleTransfer(event: Record<string, unknown>): Promise<void> {
    const from = this.idList(event['transferred_from']);
    const to = this.idList(event['transferred_to']);
    if (to.length === 0) {
      this.logger.warn('TRANSFER sans transferred_to — ignoré');
      return;
    }
    const sources = from.filter((id) => !to.includes(id));

    let plan = this.planFromEvent(event);
    if (!plan && sources.length > 0) {
      const previous = await this.prisma.user.findMany({
        where: { id: { in: sources } },
        select: { plan: true },
      });
      plan =
        previous
          .map((u) => u.plan)
          .filter((p) => p !== 'free')
          .sort((a, b) => PLAN_RANK[b] - PLAN_RANK[a])[0] ?? null;
    }

    for (const id of sources) {
      await this.setPlan(id, 'free', 'TRANSFER (source)');
    }
    if (!plan) {
      this.logger.warn(
        `TRANSFER vers ${to.join(', ')} sans palier identifiable — plan inchangé jusqu'au prochain événement`,
      );
      return;
    }
    for (const id of to) {
      await this.setPlan(id, plan, 'TRANSFER');
    }
  }

  private idList(value: unknown): string[] {
    return Array.isArray(value) ? value.map((v) => String(v)).filter(Boolean) : [];
  }

  private async currentPlan(userId: string): Promise<Plan | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { plan: true },
      });
      return user?.plan ?? null;
    } catch {
      return null;
    }
  }

  private async setPlan(userId: string, plan: Plan, type: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        // `isPremium` reste synchro avec `plan` (tout sauf free = premium) —
        // gardé pour compatibilité avec le code existant qui teste ce booléen.
        data: { plan, isPremium: plan !== 'free' },
      });
      this.logger.log(`Utilisateur ${userId} → plan "${plan}" (événement ${type})`);
    } catch (err) {
      // L'utilisateur peut ne pas exister (achat avant inscription, identifiant
      // anonyme RevenueCat) : rien à mettre à jour.
      this.logger.warn(
        `Impossible de mettre à jour le plan de ${userId} (${type}): ${(err as Error).message}`,
      );
    }
  }

  /** Palier désigné par l'événement (entitlement puis produit), sans valeur par défaut. */
  private planFromEvent(event: Record<string, unknown>): Plan | null {
    const entitlementIds = Array.isArray(event['entitlement_ids'])
      ? (event['entitlement_ids'] as unknown[]).map((v) => String(v).toLowerCase())
      : [];
    for (const [entitlement, plan] of ENTITLEMENT_TO_PLAN) {
      if (entitlementIds.includes(entitlement)) return plan;
    }
    return this.planFromProduct(String(event['product_id'] ?? ''));
  }

  private planFromProduct(productId: string): Plan | null {
    const id = productId.toLowerCase();
    if (!id) return null;
    for (const [key, plan] of ENTITLEMENT_TO_PLAN) {
      if (id.includes(key)) return plan;
    }
    return null;
  }

  /**
   * Plan à appliquer pour un événement d'accès : entitlement (le plus élevé
   * si plusieurs), puis `product_id`. Retourne 'gold' par défaut si rien
   * n'est reconnu : Plus n'est plus vendu, Gold est le forfait d'entrée.
   */
  private resolvePlan(event: Record<string, unknown>): Plan {
    return this.planFromEvent(event) ?? 'gold';
  }
}
