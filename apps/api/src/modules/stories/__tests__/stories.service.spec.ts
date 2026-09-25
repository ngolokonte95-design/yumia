import { StoriesService } from '../stories.service';

/**
 * Le média d'une story « à la une » est le même fichier que celui de la story
 * (l'app ne le copie pas) : l'expiration ou la suppression de la story ne doit
 * pas l'effacer tant qu'une « à la une » du même compte l'utilise.
 */
const STORY_URL = 'https://api.yumia.eu/uploads/posts/user-1_story.mp4';
const OTHER_URL = 'https://api.yumia.eu/uploads/posts/user-1_other.jpg';

function makePrisma() {
  return {
    story: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    storyHighlight: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
    },
    storyHighlightItem: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

describe('StoriesService — fichiers partagés avec les stories à la une', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let storage: { remove: jest.Mock; removeMany: jest.Mock };
  let service: StoriesService;

  beforeEach(() => {
    prisma = makePrisma();
    storage = { remove: jest.fn().mockResolvedValue(true), removeMany: jest.fn().mockResolvedValue(1) };
    service = new StoriesService(prisma as any, {} as any, {} as any, storage as any, {} as any);
  });

  describe('purgeExpired', () => {
    it('garde le fichier d\'une story expirée repris dans une story à la une', async () => {
      prisma.story.findMany.mockImplementation((args: any) =>
        Promise.resolve(
          args?.where?.expiresAt
            ? [
                { id: 's-1', userId: 'user-1', mediaUrl: STORY_URL },
                { id: 's-2', userId: 'user-1', mediaUrl: OTHER_URL },
              ]
            : [],
        ),
      );
      prisma.storyHighlightItem.findMany.mockResolvedValue([{ mediaUrl: STORY_URL }]);

      await service.purgeExpired();

      expect(prisma.story.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['s-1', 's-2'] } } });
      // La recherche de références est limitée aux « à la une » du propriétaire.
      expect(prisma.storyHighlightItem.findMany).toHaveBeenCalledWith({
        where: { mediaUrl: { in: [STORY_URL, OTHER_URL] }, highlight: { userId: 'user-1' } },
        select: { mediaUrl: true },
      });
      expect(storage.removeMany).toHaveBeenCalledWith([OTHER_URL], 'user-1');
    });

    it('garde aussi un fichier utilisé comme couverture', async () => {
      prisma.story.findMany.mockImplementation((args: any) =>
        Promise.resolve(args?.where?.expiresAt ? [{ id: 's-1', userId: 'user-1', mediaUrl: STORY_URL }] : []),
      );
      prisma.storyHighlight.findMany.mockResolvedValue([{ coverUrl: STORY_URL }]);

      await service.purgeExpired();

      expect(storage.removeMany).not.toHaveBeenCalled();
    });

    it('efface les fichiers que rien ne référence', async () => {
      prisma.story.findMany.mockImplementation((args: any) =>
        Promise.resolve(args?.where?.expiresAt ? [{ id: 's-1', userId: 'user-1', mediaUrl: STORY_URL }] : []),
      );

      await service.purgeExpired();

      expect(storage.removeMany).toHaveBeenCalledWith([STORY_URL], 'user-1');
    });
  });

  describe('delete', () => {
    it('supprime la story sans effacer le fichier partagé avec une story à la une', async () => {
      prisma.story.findUnique.mockResolvedValue({ id: 's-1', userId: 'user-1', mediaUrl: STORY_URL });
      prisma.story.delete.mockResolvedValue({ id: 's-1' });
      prisma.storyHighlightItem.findMany.mockResolvedValue([{ mediaUrl: STORY_URL }]);

      await service.delete('s-1', 'user-1');
      await new Promise((r) => setImmediate(r));

      expect(prisma.story.delete).toHaveBeenCalledWith({ where: { id: 's-1' } });
      expect(storage.removeMany).not.toHaveBeenCalled();
      expect(storage.remove).not.toHaveBeenCalled();
    });
  });

  describe('deleteHighlight', () => {
    it('efface les fichiers de la story à la une que plus rien n\'utilise', async () => {
      prisma.storyHighlight.findUnique.mockResolvedValue({ userId: 'user-1' });
      prisma.storyHighlight.delete.mockResolvedValue({
        id: 'h-1',
        coverUrl: STORY_URL,
        items: [{ mediaUrl: STORY_URL }, { mediaUrl: OTHER_URL }],
      });
      // STORY_URL est encore la story (active) du même compte.
      prisma.story.findMany.mockResolvedValue([{ mediaUrl: STORY_URL }]);

      await service.deleteHighlight('user-1', 'h-1');

      expect(storage.removeMany).toHaveBeenCalledWith([OTHER_URL], 'user-1');
    });

    it('garde un fichier encore présent dans une autre story à la une', async () => {
      prisma.storyHighlight.findUnique.mockResolvedValue({ userId: 'user-1' });
      prisma.storyHighlight.delete.mockResolvedValue({ id: 'h-1', coverUrl: OTHER_URL, items: [{ mediaUrl: OTHER_URL }] });
      prisma.storyHighlightItem.findMany.mockResolvedValue([{ mediaUrl: OTHER_URL }]);

      await service.deleteHighlight('user-1', 'h-1');

      expect(storage.removeMany).not.toHaveBeenCalled();
    });

    it('refuse de supprimer la story à la une d\'un autre compte', async () => {
      prisma.storyHighlight.findUnique.mockResolvedValue({ userId: 'user-2' });

      await expect(service.deleteHighlight('user-1', 'h-1')).rejects.toThrow();
      expect(prisma.storyHighlight.delete).not.toHaveBeenCalled();
      expect(storage.removeMany).not.toHaveBeenCalled();
    });
  });
});
