import { Test } from '@nestjs/testing';
import { WebhooksService } from '../webhooks.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';

// ── Mock factory ──────────────────────────────────────────────────────────────

const makePrisma = () => ({
  user: {
    update: jest.fn().mockResolvedValue({}),
  },
});

// ── Payload helpers ───────────────────────────────────────────────────────────

const makePayload = (type: string, userId = 'user-1') => ({
  event: { type, app_user_id: userId, product_id: 'yumia_plus_monthly' },
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WebhooksService', () => {
  let service: WebhooksService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();

    const module = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(WebhooksService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── Upgrade events ────────────────────────────────────────────────────────

  describe('upgrade events', () => {
    const upgradeEvents = [
      'INITIAL_PURCHASE',
      'RENEWAL',
      'PRODUCT_CHANGE',
      'UNCANCELLATION',
      'NON_RENEWING_PURCHASE',
    ];

    it.each(upgradeEvents)('"%s" → plan "plus"', async (type) => {
      await service.handleRevenueCat(makePayload(type));

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { plan: 'plus' },
      });
    });
  });

  // ── Downgrade events ──────────────────────────────────────────────────────

  describe('downgrade events', () => {
    const downgradeEvents = [
      'EXPIRATION',
      'CANCELLATION',
      'REFUND',
      'SUBSCRIBER_ALIAS',
    ];

    it.each(downgradeEvents)('"%s" → plan "free"', async (type) => {
      await service.handleRevenueCat(makePayload(type));

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { plan: 'free' },
      });
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it('ignore les événements inconnus sans mise à jour DB', async () => {
    await service.handleRevenueCat(makePayload('BILLING_ISSUE'));

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('ignore le payload si la clé "event" est absente', async () => {
    await service.handleRevenueCat({ unrelated: 'data' });

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('ignore si app_user_id est absent', async () => {
    await service.handleRevenueCat({ event: { type: 'RENEWAL' } });

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('utilise original_app_user_id en fallback si app_user_id est absent', async () => {
    await service.handleRevenueCat({
      event: { type: 'INITIAL_PURCHASE', original_app_user_id: 'user-fallback' },
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-fallback' },
      data: { plan: 'plus' },
    });
  });

  it('ne plante pas si Prisma lève une exception (utilisateur introuvable)', async () => {
    prisma.user.update.mockRejectedValue(new Error('Record not found'));

    await expect(
      service.handleRevenueCat(makePayload('INITIAL_PURCHASE')),
    ).resolves.toBeUndefined();
  });
});
