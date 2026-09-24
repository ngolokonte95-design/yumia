import { Test } from '@nestjs/testing';
import { WebhooksService } from '../webhooks.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';

// ── Mock factory ──────────────────────────────────────────────────────────────

const makePrisma = () => ({
  user: {
    update: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  },
});

// ── Payload helpers ───────────────────────────────────────────────────────────

const makePayload = (type: string, userId = 'user-1', extra: Record<string, unknown> = {}) => ({
  event: { type, app_user_id: userId, product_id: 'yumia_gold_monthly', ...extra },
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

  describe('événements d\'accès', () => {
    const upgradeEvents = [
      'INITIAL_PURCHASE',
      'RENEWAL',
      'UNCANCELLATION',
      'NON_RENEWING_PURCHASE',
      'SUBSCRIPTION_EXTENDED',
      'REFUND_REVERSED',
    ];

    it.each(upgradeEvents)('"%s" → plan du produit ("gold")', async (type) => {
      await service.handleRevenueCat(makePayload(type));

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { plan: 'gold', isPremium: true },
      });
    });
  });

  // ── Fin d'accès ───────────────────────────────────────────────────────────

  describe('fin d\'accès', () => {
    it.each(['EXPIRATION', 'REFUND'])('"%s" → plan "free"', async (type) => {
      prisma.user.findUnique.mockResolvedValue({ plan: 'gold' });

      await service.handleRevenueCat(makePayload(type));

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { plan: 'free', isPremium: false },
      });
    });

    it('CANCELLATION simple (renouvellement coupé) ne rétrograde PAS', async () => {
      await service.handleRevenueCat(makePayload('CANCELLATION', 'user-1', { cancel_reason: 'UNSUBSCRIBE' }));

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('CANCELLATION sans motif ne rétrograde pas', async () => {
      await service.handleRevenueCat(makePayload('CANCELLATION'));

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('CANCELLATION pour remboursement (CUSTOMER_SUPPORT) → plan "free"', async () => {
      prisma.user.findUnique.mockResolvedValue({ plan: 'gold' });

      await service.handleRevenueCat(
        makePayload('CANCELLATION', 'user-1', { cancel_reason: 'CUSTOMER_SUPPORT' }),
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { plan: 'free', isPremium: false },
      });
    });

    it('SUBSCRIBER_ALIAS ne touche pas au plan', async () => {
      await service.handleRevenueCat(makePayload('SUBSCRIBER_ALIAS'));

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('EXPIRATION d\'un palier inférieur au plan actuel est ignorée', async () => {
      // Ancien Gold qui expire après un passage à Diamond.
      prisma.user.findUnique.mockResolvedValue({ plan: 'diamond' });

      await service.handleRevenueCat(makePayload('EXPIRATION'));

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('EXPIRATION sans produit identifiable rétrograde quand même', async () => {
      prisma.user.findUnique.mockResolvedValue({ plan: 'diamond' });

      await service.handleRevenueCat({ event: { type: 'EXPIRATION', app_user_id: 'user-1' } });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { plan: 'free', isPremium: false },
      });
    });
  });

  // ── PRODUCT_CHANGE ────────────────────────────────────────────────────────

  describe('PRODUCT_CHANGE', () => {
    it('montée de palier appliquée immédiatement', async () => {
      prisma.user.findUnique.mockResolvedValue({ plan: 'gold' });

      await service.handleRevenueCat(
        makePayload('PRODUCT_CHANGE', 'user-1', { new_product_id: 'yumia_diamond_monthly' }),
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { plan: 'diamond', isPremium: true },
      });
    });

    it('descente de palier reportée au renouvellement', async () => {
      prisma.user.findUnique.mockResolvedValue({ plan: 'diamond' });

      await service.handleRevenueCat(
        makePayload('PRODUCT_CHANGE', 'user-1', {
          product_id: 'yumia_diamond_monthly',
          new_product_id: 'yumia_gold_monthly',
        }),
      );

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  // ── TRANSFER ──────────────────────────────────────────────────────────────

  describe('TRANSFER', () => {
    it('transfère le plan de l\'ancien propriétaire et le rétrograde', async () => {
      prisma.user.findMany.mockResolvedValue([{ plan: 'diamond' }]);

      await service.handleRevenueCat({
        event: { type: 'TRANSFER', transferred_from: ['old-user'], transferred_to: ['new-user'] },
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['old-user'] } },
        select: { plan: true },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'old-user' },
        data: { plan: 'free', isPremium: false },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'new-user' },
        data: { plan: 'diamond', isPremium: true },
      });
    });

    it('utilise l\'entitlement de l\'événement quand il est présent', async () => {
      await service.handleRevenueCat({
        event: {
          type: 'TRANSFER',
          transferred_from: ['$RCAnonymousID:abc'],
          transferred_to: ['new-user'],
          entitlement_ids: ['gold'],
        },
      });

      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'new-user' },
        data: { plan: 'gold', isPremium: true },
      });
    });

    it('n\'invente pas de palier si rien ne l\'indique', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.handleRevenueCat({
        event: {
          type: 'TRANSFER',
          transferred_from: ['$RCAnonymousID:abc'],
          transferred_to: ['new-user'],
        },
      });

      expect(prisma.user.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'new-user' } }),
      );
    });

    it('ignore un TRANSFER sans destinataire', async () => {
      await service.handleRevenueCat({ event: { type: 'TRANSFER', transferred_from: ['old-user'] } });

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  // ── Résolution du palier (Plus/Gold/Diamond) ─────────────────────────────

  describe('résolution du palier', () => {
    it('utilise entitlement_ids en priorité (diamond > gold > plus)', async () => {
      await service.handleRevenueCat({
        event: { type: 'INITIAL_PURCHASE', app_user_id: 'user-1', entitlement_ids: ['gold'] },
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { plan: 'gold', isPremium: true },
      });
    });

    it('retient le plus élevé si plusieurs entitlements actifs', async () => {
      await service.handleRevenueCat({
        event: { type: 'INITIAL_PURCHASE', app_user_id: 'user-1', entitlement_ids: ['plus', 'diamond'] },
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { plan: 'diamond', isPremium: true },
      });
    });

    it('se rabat sur product_id si entitlement_ids est absent', async () => {
      await service.handleRevenueCat({
        event: { type: 'INITIAL_PURCHASE', app_user_id: 'user-1', product_id: 'yumia_diamond_monthly' },
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { plan: 'diamond', isPremium: true },
      });
    });

    it('retombe sur "gold" si rien n\'est reconnu (Plus n\'est plus vendu)', async () => {
      await service.handleRevenueCat({
        event: { type: 'INITIAL_PURCHASE', app_user_id: 'user-1' },
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { plan: 'gold', isPremium: true },
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
      data: { plan: 'gold', isPremium: true },
    });
  });

  it('ne plante pas si Prisma lève une exception (utilisateur introuvable)', async () => {
    prisma.user.update.mockRejectedValue(new Error('Record not found'));

    await expect(
      service.handleRevenueCat(makePayload('INITIAL_PURCHASE')),
    ).resolves.toBeUndefined();
  });
});
