import { Injectable, Logger } from '@nestjs/common';
import type { Plan } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** Événements RevenueCat qui donnent/renouvellent l'accès à un plan payant. */
const UPGRADE_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
]);

/** Événements RevenueCat qui révoquent le plan payant (retour à free). */
const DOWNGRADE_EVENTS = new Set([
  'EXPIRATION',
  'CANCELLATION',
  'REFUND',
  'SUBSCRIBER_ALIAS',
]);

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
   * Structure du payload :
   * {
   *   event: {
   *     type: string,                    // ex: "INITIAL_PURCHASE"
   *     app_user_id: string,             // UUID de l'utilisateur YUMIA
   *     original_app_user_id?: string,   // fallback si alias
   *     entitlement_ids?: string[],      // ex: ["gold"] — quel plan est actif
   *     product_id?: string,             // ex: "yumia_gold_monthly" (repli si entitlement_ids absent)
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
    const userId =
      String(event['app_user_id'] ?? event['original_app_user_id'] ?? '');

    if (!userId) {
      this.logger.warn(`Événement ${type} sans app_user_id — ignoré`);
      return;
    }

    const newPlan: Plan | null = UPGRADE_EVENTS.has(type)
      ? this.resolvePlan(event)
      : DOWNGRADE_EVENTS.has(type)
        ? 'free'
        : null;

    if (!newPlan) {
      this.logger.debug(`Événement RevenueCat ${type} — aucun changement de plan`);
      return;
    }

    try {
      await this.prisma.user.update({
        where: { id: userId },
        // `isPremium` reste synchro avec `plan` (tout sauf free = premium) —
        // gardé pour compatibilité avec le code existant qui teste ce booléen.
        data: { plan: newPlan, isPremium: newPlan !== 'free' },
      });
      this.logger.log(`Utilisateur ${userId} → plan "${newPlan}" (événement ${type})`);
    } catch (err) {
      // L'utilisateur peut ne pas encore exister si l'achat a précédé l'inscription.
      this.logger.warn(
        `Impossible de mettre à jour le plan de ${userId} (${type}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * Détermine le plan à partir des entitlements actifs de l'événement
   * (le plus élevé si plusieurs), avec repli sur `product_id` si
   * `entitlement_ids` est absent (anciens événements / config RevenueCat
   * minimale). Retourne 'plus' par défaut si rien n'est reconnu — préserve
   * le comportement d'avant l'ajout de Gold/Diamond.
   */
  private resolvePlan(event: Record<string, unknown>): Plan {
    const entitlementIds = Array.isArray(event['entitlement_ids'])
      ? (event['entitlement_ids'] as unknown[]).map((v) => String(v).toLowerCase())
      : [];
    for (const [entitlement, plan] of ENTITLEMENT_TO_PLAN) {
      if (entitlementIds.includes(entitlement)) return plan;
    }

    const productId = String(event['product_id'] ?? '').toLowerCase();
    for (const [key, plan] of ENTITLEMENT_TO_PLAN) {
      if (productId.includes(key)) return plan;
    }

    return 'plus';
  }
}
