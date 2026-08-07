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
  notification: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
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

    it('persiste toujours une notification, même sans token push', async () => {
      prisma.user.findUnique.mockResolvedValue({ expoPushToken: null });

      await service.sendToUser('user-1', 'Titre', 'Corps', { type: 'new_follower', followerId: 'u2' });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          type: 'new_follower',
          title: 'Titre',
          body: 'Corps',
          data: { type: 'new_follower', followerId: 'u2' },
        },
      });
    });

    it('retombe sur le type "generic" si `data.type` est absent', async () => {
      prisma.user.findUnique.mockResolvedValue({ expoPushToken: null });

      await service.sendToUser('user-1', 'Titre', 'Corps');

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'generic' }) }),
      );
    });

    it('n\'interrompt pas l\'envoi si la persistance échoue', async () => {
      prisma.notification.create.mockRejectedValue(new Error('DB down'));
      prisma.user.findUnique.mockResolvedValue({ expoPushToken: 'ExponentPushToken[valid]' });
      mockFetch({ data: [{ status: 'ok' }] });

      await expect(service.sendToUser('user-1', 'Titre', 'Corps')).resolves.toBeUndefined();
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  // ── list / unreadCount / markRead / markAllRead ──────────────────────────

  describe('list', () => {
    it('demande une page de plus que la limite pour détecter la suite', async () => {
      await service.list('user-1', { limit: 2 });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' }, take: 3 }),
      );
    });

    it('renvoie un nextCursor quand il reste des éléments', async () => {
      prisma.notification.findMany.mockResolvedValue([
        { id: 'n1' }, { id: 'n2' }, { id: 'n3' },
      ]);

      const { items, nextCursor } = await service.list('user-1', { limit: 2 });

      expect(items).toHaveLength(2);
      expect(nextCursor).toBe('n2');
    });

    it('renvoie nextCursor à null quand tout tient sur une page', async () => {
      prisma.notification.findMany.mockResolvedValue([{ id: 'n1' }]);

      const { items, nextCursor } = await service.list('user-1', { limit: 2 });

      expect(items).toHaveLength(1);
      expect(nextCursor).toBeNull();
    });
  });

  describe('unreadCount', () => {
    it('compte les notifications non lues de l\'utilisateur', async () => {
      prisma.notification.count.mockResolvedValue(4);

      await expect(service.unreadCount('user-1')).resolves.toBe(4);
      expect(prisma.notification.count).toHaveBeenCalledWith({ where: { userId: 'user-1', read: false } });
    });
  });

  describe('markRead / markAllRead', () => {
    it('marque une notification précise comme lue, scopée à son propriétaire', async () => {
      await service.markRead('user-1', 'notif-1');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: 'user-1' },
        data: { read: true },
      });
    });

    it('marque toutes les notifications non lues comme lues', async () => {
      await service.markAllRead('user-1');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', read: false },
        data: { read: true },
      });
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

    it('persiste une notification par destinataire ayant un userId', async () => {
      mockFetch({ data: [{ status: 'ok' }, { status: 'ok' }] });

      await service.sendBatch([
        { to: 'ExponentPushToken[a]', userId: 'user-a', title: 'T', body: 'B', data: { type: 'daily_digest' } },
        { to: 'ExponentPushToken[b]', title: 'T', body: 'B' }, // pas de userId — pas persisté, quand même envoyé
      ]);

      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: { userId: 'user-a', type: 'daily_digest', title: 'T', body: 'B', data: { type: 'daily_digest' } },
      });
    });

    it('ne transmet jamais `userId` à l\'API Expo', async () => {
      mockFetch({ data: [{ status: 'ok' }] });

      await service.sendBatch([{ to: 'ExponentPushToken[a]', userId: 'user-a', title: 'T', body: 'B' }]);

      const sentBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(sentBody[0]).not.toHaveProperty('userId');
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
