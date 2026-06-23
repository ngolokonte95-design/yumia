import { Test } from '@nestjs/testing';
import { NotificationsService } from '../notifications.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';

// ── Mock factory ──────────────────────────────────────────────────────────────

const makePrisma = () => ({
  user: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(response: object, ok = true, status = 200) {
  const mockRes = {
    ok,
    status,
    json: jest.fn().mockResolvedValue(response),
  };
  global.fetch = jest.fn().mockResolvedValue(mockRes as unknown as Response);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();

    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── registerToken ─────────────────────────────────────────────────────────

  describe('registerToken', () => {
    it('persiste le push token de l\'utilisateur', async () => {
      await service.registerToken('user-1', 'ExponentPushToken[abc123]');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { expoPushToken: 'ExponentPushToken[abc123]' },
      });
    });
  });

  // ── sendToUser ────────────────────────────────────────────────────────────

  describe('sendToUser', () => {
    it('envoie la notification si le token est valide', async () => {
      prisma.user.findUnique.mockResolvedValue({ expoPushToken: 'ExponentPushToken[valid]' });
      mockFetch({ data: [{ status: 'ok', id: 'ticket-1' }] });

      await service.sendToUser('user-1', 'Titre', 'Corps');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://exp.host/--/api/v2/push/send',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('ne fait aucun appel si l\'utilisateur n\'a pas de token', async () => {
      prisma.user.findUnique.mockResolvedValue({ expoPushToken: null });

      await service.sendToUser('user-1', 'Titre', 'Corps');

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('ne fait aucun appel si le token n\'est pas un token Expo valide', async () => {
      prisma.user.findUnique.mockResolvedValue({ expoPushToken: 'invalid-token' });

      await service.sendToUser('user-1', 'Titre', 'Corps');

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ── send (via sendBatch) — DeviceNotRegistered cleanup ───────────────────

  describe('sendBatch', () => {
    it('supprime les tokens périmés signalés par Expo', async () => {
      const token = 'ExponentPushToken[stale]';
      mockFetch({
        data: [{ status: 'error', message: 'token invalid', details: { error: 'DeviceNotRegistered' } }],
      });

      await service.sendBatch([{ to: token, title: 'Test', body: 'Message', sound: 'default' }]);

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { expoPushToken: { in: [token] } },
        data: { expoPushToken: null },
      });
    });

    it('ne supprime rien si toutes les notifications sont acceptées', async () => {
      mockFetch({ data: [{ status: 'ok', id: 'ticket-1' }] });

      await service.sendBatch([{ to: 'ExponentPushToken[ok]', title: 'Test', body: 'Message', sound: 'default' }]);

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('tolère une erreur HTTP de l\'API Expo (pas de throw)', async () => {
      mockFetch({}, false, 500);

      await expect(
        service.sendBatch([{ to: 'ExponentPushToken[ok]', title: 'Test', body: 'Message', sound: 'default' }]),
      ).resolves.toBeUndefined();
    });

    it('tolère un rejet réseau (pas de throw)', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        service.sendBatch([{ to: 'ExponentPushToken[ok]', title: 'Test', body: 'Message', sound: 'default' }]),
      ).resolves.toBeUndefined();
    });

    it('envoie en lots de 100 pour de gros batches', async () => {
      mockFetch({ data: Array.from({ length: 100 }, () => ({ status: 'ok' })) });
      const messages = Array.from({ length: 150 }, (_, i) => ({
        to: `ExponentPushToken[token-${i}]`,
        title: 'T',
        body: 'B',
        sound: 'default' as const,
      }));

      await service.sendBatch(messages);

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
