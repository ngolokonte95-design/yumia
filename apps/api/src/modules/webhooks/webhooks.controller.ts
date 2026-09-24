import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';

/** Endpoint de webhooks pour les providers externes (RevenueCat, Stripe…). */
@ApiTags('webhooks')
@SkipThrottle()
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooks: WebhooksService) {}

  /**
   * POST /api/webhooks/revenuecat
   *
   * Reçoit les événements RevenueCat et met à jour le plan utilisateur.
   * L'authentification se fait par le header `X-RevenueCat-Webhook-Token`
   * comparé à la variable d'environnement REVENUECAT_WEBHOOK_SECRET.
   *
   * Événements traités (détail dans WebhooksService) :
   *   INITIAL_PURCHASE, RENEWAL, UNCANCELLATION…  → plan du palier acheté
   *   PRODUCT_CHANGE                               → montée immédiate, descente au renouvellement
   *   EXPIRATION, CANCELLATION pour remboursement  → plan = 'free'
   *   CANCELLATION simple                          → rien (accès jusqu'à l'EXPIRATION)
   *   TRANSFER                                     → le plan suit les achats transférés
   *
   * Documentation : https://www.revenuecat.com/docs/integrations/webhooks/event-flows
   */
  @Post('revenuecat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook RevenueCat — mises à jour des abonnements' })
  async revenueCat(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: unknown,
  ): Promise<{ received: boolean }> {
    const secret = process.env.REVENUECAT_WEBHOOK_SECRET;

    if (!secret) {
      // Fail-closed en production : sans secret configuré, l'endpoint upgraderait
      // n'importe quel utilisateur sur simple POST. On refuse plutôt que d'ouvrir
      // une faille. En dev/test, on laisse passer pour faciliter les essais locaux.
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(
          'REVENUECAT_WEBHOOK_SECRET absent en production — webhook rejeté (fail-closed).',
        );
        throw new UnauthorizedException('Webhook non configuré.');
      }
    } else {
      // RevenueCat envoie le token dans l'en-tête Authorization: Bearer <secret>
      const token = authHeader?.replace('Bearer ', '').trim();
      if (!token || !safeEqual(token, secret)) {
        this.logger.warn('Webhook RevenueCat — token invalide');
        throw new UnauthorizedException('Webhook token invalide.');
      }
    }

    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Payload invalide.');
    }

    await this.webhooks.handleRevenueCat(body as Record<string, unknown>);
    return { received: true };
  }
}

/**
 * Comparaison à temps constant : `===` s'arrête au premier caractère
 * différent, ce qui laisse deviner le secret par mesure du temps de réponse.
 * Les deux valeurs sont d'abord hachées pour obtenir des tampons de même
 * longueur (exigé par timingSafeEqual) sans révéler la longueur du secret.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
