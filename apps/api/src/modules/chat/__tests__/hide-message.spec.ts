import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatService } from '../chat.service';

/** « Supprimer pour moi » : un message (ou un appel) retiré de MA vue seulement. */
function makeService(opts: { message?: { conversationId: string; hiddenFor: string[] } | null; participant?: boolean } = {}) {
  const message = opts.message === undefined ? { conversationId: 'c1', hiddenFor: [] as string[] } : opts.message;
  const prisma = {
    conversationParticipant: {
      findUnique: jest.fn(async () => (opts.participant === false ? null : { conversationId: 'c1', userId: 'u1' })),
      update: jest.fn(async () => ({})),
    },
    message: {
      findUnique: jest.fn(async () => message),
      update: jest.fn(async () => ({})),
      findMany: jest.fn(async () => [
        {
          id: 'm1', replyToId: null, postId: null, senderId: 'u2', oneTime: false,
          viewedOnceAt: null, mediaUrl: null, type: 'text', content: 'salut', hiddenFor: ['u9'],
        },
      ]),
    },
    messageReaction: { findMany: jest.fn(async () => []) },
  };
  const service = new ChatService(prisma as never, { sendToUsers: jest.fn(), send: jest.fn() } as never, { blockedIds: jest.fn(async () => []) } as never);
  return { service, prisma };
}

describe('Supprimer pour moi', () => {
  it('ajoute mon identifiant aux masquages du message', async () => {
    const { service, prisma } = makeService();
    await expect(service.hideMessage('m1', 'u1')).resolves.toEqual({ ok: true });
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { hiddenFor: { push: 'u1' } },
    });
  });

  it('ne masque pas deux fois', async () => {
    const { service, prisma } = makeService({ message: { conversationId: 'c1', hiddenFor: ['u1'] } });
    await service.hideMessage('m1', 'u1');
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it('refuse à qui ne participe pas à la conversation', async () => {
    const { service, prisma } = makeService({ participant: false });
    await expect(service.hideMessage('m1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it('répond 404 pour un message inconnu', async () => {
    const { service } = makeService({ message: null });
    await expect(service.hideMessage('m1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ne charge que les messages que je vois encore, sans révéler qui a masqué quoi', async () => {
    const { service, prisma } = makeService();
    const messages = await service.getMessages('c1', 'u1');
    const where = (prisma.message.findMany.mock.calls[0] as unknown as [{ where: { AND: unknown[] } }])[0].where;
    expect(where.AND).toEqual(expect.arrayContaining([{ NOT: { hiddenFor: { has: 'u1' } } }]));
    expect(messages[0]).not.toHaveProperty('hiddenFor');
  });
});
