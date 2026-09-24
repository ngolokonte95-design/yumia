import { ModerationService } from '../moderation.service';

/**
 * Signalements de messages, de sorties et d'avis : la file d'attente doit
 * montrer le contenu et son auteur, et « Retirer le contenu » doit vraiment
 * le retirer (fichier joint compris).
 */
function makeService(report: { targetType: string; targetId: string }) {
  const prisma = {
    report: {
      findUnique: jest.fn(async () => ({
        id: 'r1',
        reporterId: 'reporter',
        reason: 'Spam',
        details: null,
        createdAt: new Date(),
        ...report,
      })),
      update: jest.fn(async () => ({})),
    },
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        displayName: `User ${where.id}`,
        email: `${where.id}@test.fr`,
      })),
    },
    message: {
      findUnique: jest.fn(async () => ({ content: 'insulte', type: 'image', senderId: 'author' })),
      delete: jest.fn(async () => ({ senderId: 'author', type: 'image', mediaUrl: 'https://cdn/x/author-1.jpg' })),
    },
    meetupEvent: {
      findUnique: jest.fn(async () => ({ title: 'Soirée', description: 'arnaque', hostId: 'author' })),
      delete: jest.fn(async () => ({})),
    },
    placeReview: {
      findUnique: jest.fn(async () => ({ rating: 1, body: 'faux avis', userId: 'author' })),
      delete: jest.fn(async () => ({ placeId: 'p1', userId: 'author', photoUrl: null })),
      aggregate: jest.fn(async () => ({ _avg: { rating: 4.26 } })),
    },
    place: { update: jest.fn(async () => ({})) },
  };
  const storage = { remove: jest.fn(async () => true), removeMany: jest.fn(async () => 0) };
  return { service: new ModerationService(prisma as never, storage as never), prisma, storage };
}

describe('ModerationService — messages, sorties, avis', () => {
  it('retire un message signalé et son fichier, au nom de son expéditeur', async () => {
    const { service, prisma, storage } = makeService({ targetType: 'message', targetId: 'm1' });
    const res = await service.resolve('r1', 'delete');
    expect(res.deleted).toBe(true);
    expect(prisma.message.delete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'm1' } }));
    expect(storage.remove).toHaveBeenCalledWith('https://cdn/x/author-1.jpg', 'author');
  });

  it("ne supprime pas le fichier d'une story à laquelle un message répond", async () => {
    const { service, prisma, storage } = makeService({ targetType: 'message', targetId: 'm1' });
    prisma.message.delete.mockResolvedValueOnce({ senderId: 'author', type: 'story_reply', mediaUrl: 'https://cdn/x/other-1.jpg' });
    await service.resolve('r1', 'delete');
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('retire une sortie signalée et peut suspendre son organisateur', async () => {
    const { service, prisma } = makeService({ targetType: 'meetup', targetId: 'e1' });
    const suspend = jest.spyOn(service, 'suspend').mockResolvedValue(new Date());
    const res = await service.resolve('r1', 'delete_and_suspend', { days: 7 });
    expect(res.deleted).toBe(true);
    expect(prisma.meetupEvent.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });
    expect(suspend).toHaveBeenCalledWith('author', 7, undefined);
  });

  it('retire un avis et recalcule la note du lieu', async () => {
    const { service, prisma } = makeService({ targetType: 'review', targetId: 'rv1' });
    const res = await service.resolve('r1', 'delete');
    expect(res.deleted).toBe(true);
    expect(prisma.placeReview.delete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'rv1' } }));
    expect(prisma.place.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { rating: 4.3 } });
  });

  it('montre le contenu et son auteur dans la file', async () => {
    const { service, prisma } = makeService({ targetType: 'meetup', targetId: 'e1' });
    (prisma.report as unknown as { findMany: jest.Mock }).findMany = jest.fn(async () => [
      { id: 'r1', reporterId: 'reporter', targetType: 'meetup', targetId: 'e1', reason: 'Spam', details: null, createdAt: new Date() },
      { id: 'r2', reporterId: 'reporter', targetType: 'review', targetId: 'rv1', reason: 'Spam', details: null, createdAt: new Date() },
      { id: 'r3', reporterId: 'reporter', targetType: 'message', targetId: 'm1', reason: 'Spam', details: null, createdAt: new Date() },
    ]);
    const list = await service.listReports();
    expect(list.map((r) => r.preview)).toEqual(['Soirée — arnaque', '★ faux avis', '[image] insulte']);
    expect(list.every((r) => r.author?.id === 'author')).toBe(true);
  });
});
