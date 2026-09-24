import { BadRequestException } from '@nestjs/common';
import { ChatService } from '../chat.service';

function makeService(ephemeralTtlSec: number | null) {
  const prisma = {
    conversationParticipant: {
      findUnique: jest.fn(async () => ({ conversationId: 'c1', userId: 'u1' })),
      update: jest.fn(async () => ({})),
    },
    conversation: {
      update: jest.fn(async (args: { data: { ephemeralTtlSec: number | null } }) => ({
        ephemeralTtlSec: args.data.ephemeralTtlSec,
      })),
      findUnique: jest.fn(async () => ({ ephemeralTtlSec, isGroup: false, participants: [{ userId: 'u1' }, { userId: 'u2' }] })),
    },
    message: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'm1', replyToId: null, postId: null, senderId: 'u1', oneTime: false,
        viewedOnceAt: null, mediaUrl: null, type: 'text', ...args.data,
      })),
      findMany: jest.fn(async () => []),
      deleteMany: jest.fn(async () => ({ count: 3 })),
    },
    user: { findMany: jest.fn(async () => []) },
    messageReaction: { findMany: jest.fn(async () => []) },
  };
  const notifications = { sendToUsers: jest.fn(), send: jest.fn() };
  const privacy = { blockedIds: jest.fn(async () => []) };
  return { service: new ChatService(prisma as never, notifications as never, privacy as never), prisma };
}

describe('Messages éphémères', () => {
  it('pose une échéance sur le message quand la conversation est en éphémère', async () => {
    const { service, prisma } = makeService(3600);
    await service.sendMessage('c1', 'u1', { content: 'coucou' });
    const { expiresAt } = prisma.message.create.mock.calls[0][0].data as { expiresAt: Date };
    expect(expiresAt).toBeInstanceOf(Date);
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(3500 * 1000);
  });

  it('ne pose aucune échéance quand l\'option est désactivée', async () => {
    const { service, prisma } = makeService(null);
    await service.sendMessage('c1', 'u1', { content: 'coucou' });
    expect((prisma.message.create.mock.calls[0][0].data as { expiresAt: Date | null }).expiresAt).toBeNull();
  });

  it('accepte une durée valide et le retrait de l\'option', async () => {
    const { service } = makeService(null);
    await expect(service.setEphemeral('c1', 'u1', 86400)).resolves.toEqual({ ephemeralTtlSec: 86400 });
    await expect(service.setEphemeral('c1', 'u1', null)).resolves.toEqual({ ephemeralTtlSec: null });
  });

  it('refuse une durée hors bornes (moins d\'une minute, plus de 7 jours)', async () => {
    const { service } = makeService(null);
    await expect(service.setEphemeral('c1', 'u1', 5)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setEphemeral('c1', 'u1', 30 * 86400)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('efface les messages échus', async () => {
    const { service, prisma } = makeService(null);
    await service.purgeExpiredMessages();
    expect(prisma.message.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lte: expect.any(Date) } } });
  });
});

describe('Messages — blocage', () => {
  it("refuse l'envoi dans une conversation à deux quand l'un a bloqué l'autre", async () => {
    const prisma = {
      conversationParticipant: { findUnique: jest.fn(async () => ({ conversationId: 'c1', userId: 'u1' })) },
      conversation: {
        findUnique: jest.fn(async () => ({ ephemeralTtlSec: null, isGroup: false, participants: [{ userId: 'u1' }, { userId: 'u2' }] })),
      },
      message: { create: jest.fn() },
    };
    const privacy = { blockedIds: jest.fn(async () => ['u2']) };
    const service = new ChatService(prisma as never, { sendToUsers: jest.fn() } as never, privacy as never);
    await expect(service.sendMessage('c1', 'u1', { content: 'salut' } as never)).rejects.toThrow('Action impossible');
    expect(prisma.message.create).not.toHaveBeenCalled();
  });
});
