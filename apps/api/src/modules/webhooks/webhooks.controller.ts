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
   * Événements traités :
   *   INITIAL_PURCHASE, RENEWAL, PRODUCT_CHANGE  → plan = 'plus'
   *   EXPIRATION, CANCELLATION, REFUND           → plan = 'free'
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
      if (!token || token !== secret) {
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
