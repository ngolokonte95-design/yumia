import { ForbiddenException } from '@nestjs/common';
import { ChatService } from '../chat.service';

/** « Supprimer pour tout le monde » : ses messages, et tout événement d'appel. */
function makeService(message: { senderId: string; type: string; conversationId: string }, participant = true) {
  const prisma = {
    conversationParticipant: {
      findUnique: jest.fn(async () => (participant ? { conversationId: 'c1', userId: 'u1' } : null)),
    },
    message: {
      findUnique: jest.fn(async () => message),
      delete: jest.fn(async () => ({})),
    },
  };
  const service = new ChatService(prisma as never, { sendToUsers: jest.fn(), send: jest.fn() } as never, { blockedIds: jest.fn(async () => []) } as never);
  return { service, prisma };
}

describe('Supprimer pour tout le monde', () => {
  it("supprime mon propre message", async () => {
    const { service, prisma } = makeService({ senderId: 'u1', type: 'text', conversationId: 'c1' });
    await expect(service.deleteMessage('m1', 'u1')).resolves.toEqual({ ok: true });
    expect(prisma.message.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
  });

  it("refuse de supprimer le message d'un autre", async () => {
    const { service, prisma } = makeService({ senderId: 'u2', type: 'text', conversationId: 'c1' });
    await expect(service.deleteMessage('m1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.message.delete).not.toHaveBeenCalled();
  });

  it("laisse l'appelé supprimer un appel qu'il a reçu (l'appel appartient aux deux côtés)", async () => {
    const { service, prisma } = makeService({ senderId: 'u2', type: 'call', conversationId: 'c1' });
    await expect(service.deleteMessage('m1', 'u1')).resolves.toEqual({ ok: true });
    expect(prisma.message.delete).toHaveBeenCalled();
  });

  it("refuse l'appel d'une conversation dont je ne fais pas partie", async () => {
    const { service, prisma } = makeService({ senderId: 'u2', type: 'call', conversationId: 'c1' }, false);
    await expect(service.deleteMessage('m1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.message.delete).not.toHaveBeenCalled();
  });
});
