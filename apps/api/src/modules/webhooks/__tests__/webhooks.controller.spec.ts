import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { WebhooksController } from '../webhooks.controller';

// ── Mock service ────────────────────────────────────────────────────────────────

const makeService = () => ({
  handleRevenueCat: jest.fn().mockResolvedValue(undefined),
});

const validBody = { event: { type: 'INITIAL_PURCHASE', app_user_id: 'user-1' } };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WebhooksController — auth RevenueCat', () => {
  let controller: WebhooksController;
  let service: ReturnType<typeof makeService>;
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    service = makeService();
    controller = new WebhooksController(service as never);
    jest.spyOn(controller['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(controller['logger'], 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.clearAllMocks();
  });

  describe('secret configuré', () => {
    beforeEach(() => {
      process.env.REVENUECAT_WEBHOOK_SECRET = 'super-secret';
    });

    it('accepte la requête avec le bon Bearer token', async () => {
      const res = await controller.revenueCat('Bearer super-secret', validBody);

      expect(res).toEqual({ received: true });
      expect(service.handleRevenueCat).toHaveBeenCalledWith(validBody);
    });

    it('rejette un token invalide', async () => {
      await expect(controller.revenueCat('Bearer wrong', validBody)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(service.handleRevenueCat).not.toHaveBeenCalled();
    });

    it('rejette l\'absence de header Authorization', async () => {
      await expect(controller.revenueCat(undefined, validBody)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(service.handleRevenueCat).not.toHaveBeenCalled();
    });
  });

  describe('secret absent', () => {
    beforeEach(() => {
      delete process.env.REVENUECAT_WEBHOOK_SECRET;
    });

    it('FAIL-CLOSED en production : rejette même sans secret configuré', async () => {
      process.env.NODE_ENV = 'production';

      await expect(controller.revenueCat(undefined, validBody)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(service.handleRevenueCat).not.toHaveBeenCalled();
    });

    it('laisse passer en développement (confort local)', async () => {
      process.env.NODE_ENV = 'development';

      const res = await controller.revenueCat(undefined, validBody);

      expect(res).toEqual({ received: true });
      expect(service.handleRevenueCat).toHaveBeenCalledWith(validBody);
    });
  });

  describe('validation du payload', () => {
    beforeEach(() => {
      delete process.env.REVENUECAT_WEBHOOK_SECRET;
      process.env.NODE_ENV = 'test';
    });

    it('rejette un payload non-objet', async () => {
      await expect(controller.revenueCat(undefined, 'pas un objet')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejette un payload null', async () => {
      await expect(controller.revenueCat(undefined, null)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
