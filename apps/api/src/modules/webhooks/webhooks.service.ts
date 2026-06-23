import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** Événements RevenueCat qui donnent accès au plan Plus. */
const UPGRADE_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
]);

/** Événements RevenueCat qui révoquent le plan Plus. */
const DOWNGRADE_EVENTS = new Set([
  'EXPIRATION',
  'CANCELLATION',
  'REFUND',
  'SUBSCRIBER_ALIAS',
]);

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
   *     product_id?: string,             // ex: "yumia_plus_monthly"
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

    const newPlan = UPGRADE_EVENTS.has(type)
      ? 'plus'
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
        data: { plan: newPlan },
      });
      this.logger.log(`Utilisateur ${userId} → plan "${newPlan}" (événement ${type})`);
    } catch (err) {
      // L'utilisateur peut ne pas encore exister si l'achat a précédé l'inscription.
      this.logger.warn(
        `Impossible de mettre à jour le plan de ${userId} (${type}): ${(err as Error).message}`,
      );
    }
  }
}
