import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FavoritesService } from '../favorites.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const savedPlace = (over: Partial<any> = {}): any => ({
  id: 'sp-1',
  userId: 'u1',
  placeId: 'p1',
  collectionId: null,
  createdAt: new Date('2026-08-01T10:00:00Z'),
  place: {
    id: 'p1',
    name: 'Le Bistrot',
    universe: 'restaurant',
    city: 'Paris',
    photoUrls: ['https://cdn/photo.jpg'],
  },
  ...over,
});

const postSave = (over: Partial<any> = {}): any => ({
  postId: 'post-1',
  userId: 'u1',
  collectionId: null,
  createdAt: new Date('2026-08-02T10:00:00Z'),
  post: {
    id: 'post-1',
    userId: 'author-1',
    caption: 'Superbe rooftop',
    coverUrl: null,
    mediaUrls: ['https://cdn/post.jpg'],
  },
  ...over,
});

const makePrisma = () => ({
  savedPlace: { findMany: jest.fn(), groupBy: jest.fn(), updateMany: jest.fn() },
  postSave: { findMany: jest.fn(), groupBy: jest.fn(), updateMany: jest.fn() },
  savedCollection: {
    findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(),
    update: jest.fn(), delete: jest.fn(),
  },
  user: { findMany: jest.fn() },
  place: { findUnique: jest.fn() },
  $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
});

describe('FavoritesService', () => {
  let service: FavoritesService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [
        FavoritesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(FavoritesService);

    prisma.savedPlace.findMany.mockResolvedValue([]);
    prisma.postSave.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
  });

  describe('list', () => {
    it('fusionne lieux et publications dans un flux unique', async () => {
      prisma.savedPlace.findMany.mockResolvedValue([savedPlace()]);
      prisma.postSave.findMany.mockResolvedValue([postSave()]);
      prisma.user.findMany.mockResolvedValue([{ id: 'author-1', displayName: 'Mamadou' }]);

      const items = await service.list('u1');

      expect(items).toHaveLength(2);
      // Tri par défaut : le plus récent d'abord (la publication du 2 août).
      expect(items[0]).toMatchObject({ kind: 'post', title: 'Superbe rooftop', subtitle: 'Mamadou' });
      expect(items[1]).toMatchObject({ kind: 'place', title: 'Le Bistrot', universe: 'restaurant' });
    });

    it('résout les auteurs en une seule requête, sans relation Prisma', async () => {
      prisma.postSave.findMany.mockResolvedValue([
        postSave({ postId: 'a', post: { ...postSave().post, id: 'a', userId: 'author-1' } }),
        postSave({ postId: 'b', post: { ...postSave().post, id: 'b', userId: 'author-1' } }),
        postSave({ postId: 'c', post: { ...postSave().post, id: 'c', userId: 'author-2' } }),
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'author-1', displayName: 'Mamadou' },
        { id: 'author-2', displayName: 'Awa' },
      ]);

      await service.list('u1');

      // Post ne portant pas de relation vers son auteur, on dédoublonne les ids
      // et on ne fait qu'un aller-retour, quel que soit le nombre de favoris.
      expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.user.findMany.mock.calls[0][0].where.id.in.sort()).toEqual(['author-1', 'author-2']);
    });

    it('remplace une légende vide par le nom de l\'auteur', async () => {
      prisma.postSave.findMany.mockResolvedValue([
        postSave({ post: { ...postSave().post, caption: null } }),
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: 'author-1', displayName: 'Mamadou' }]);

      const [item] = await service.list('u1');
      expect(item.title).toBe('Publication de Mamadou');
    });

    it('filtre par recherche sur le titre et le sous-titre', async () => {
      prisma.savedPlace.findMany.mockResolvedValue([
        savedPlace({ place: { ...savedPlace().place, name: 'Le Bistrot', city: 'Lyon' } }),
        savedPlace({ id: 'sp-2', place: { ...savedPlace().place, id: 'p2', name: 'Chez Awa', city: 'Paris' } }),
      ]);

      expect(await service.list('u1', { query: 'bistrot' })).toHaveLength(1);
      // La recherche porte aussi sur la ville (sous-titre).
      expect(await service.list('u1', { query: 'paris' })).toHaveLength(1);
      expect(await service.list('u1', { query: 'introuvable' })).toHaveLength(0);
    });

    it('trie par nom ou par ancienneté', async () => {
      prisma.savedPlace.findMany.mockResolvedValue([
        savedPlace({ place: { ...savedPlace().place, name: 'Zanzibar' } }),
        savedPlace({ id: 'sp-2', createdAt: new Date('2026-07-01T10:00:00Z'),
          place: { ...savedPlace().place, id: 'p2', name: 'Alpha' } }),
      ]);

      expect((await service.list('u1', { sort: 'name' })).map((i) => i.title))
        .toEqual(['Alpha', 'Zanzibar']);
      expect((await service.list('u1', { sort: 'oldest' })).map((i) => i.title))
        .toEqual(['Alpha', 'Zanzibar']);
    });

    it('n\'interroge que la source demandée quand kind est fourni', async () => {
      await service.list('u1', { kind: 'place' });
      expect(prisma.savedPlace.findMany).toHaveBeenCalled();
      expect(prisma.postSave.findMany).not.toHaveBeenCalled();
    });
  });

  describe('collections', () => {
    it('compte séparément les lieux et les publications', async () => {
      prisma.savedCollection.findMany.mockResolvedValue([
        { id: 'c1', name: 'Week-end', coverUrl: null, createdAt: new Date() },
      ]);
      prisma.savedPlace.groupBy.mockResolvedValue([{ collectionId: 'c1', _count: { _all: 3 } }]);
      prisma.postSave.groupBy.mockResolvedValue([{ collectionId: 'c1', _count: { _all: 2 } }]);

      const [col] = await service.listCollections('u1');
      expect(col).toMatchObject({ placesCount: 3, postsCount: 2, itemsCount: 5 });
    });

    it('renvoie une liste vide sans interroger les décomptes', async () => {
      prisma.savedCollection.findMany.mockResolvedValue([]);
      expect(await service.listCollections('u1')).toEqual([]);
      expect(prisma.savedPlace.groupBy).not.toHaveBeenCalled();
    });

    it('refuse une collection sans nom', async () => {
      await expect(service.createCollection('u1', '   ')).rejects.toThrow(BadRequestException);
    });

    it('supprime la collection sans supprimer son contenu', async () => {
      prisma.savedCollection.findUnique.mockResolvedValue({ userId: 'u1' });

      await service.deleteCollection('u1', 'c1');

      // Les favoris sont détachés, pas effaces : les perdre serait inattendu.
      expect(prisma.savedPlace.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', collectionId: 'c1' }, data: { collectionId: null },
      });
      expect(prisma.postSave.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', collectionId: 'c1' }, data: { collectionId: null },
      });
      expect(prisma.savedCollection.delete).toHaveBeenCalled();
    });

    it('interdit de toucher à la collection d\'un autre utilisateur', async () => {
      prisma.savedCollection.findUnique.mockResolvedValue({ userId: 'autre' });
      await expect(service.deleteCollection('u1', 'c1')).rejects.toThrow(ForbiddenException);
    });

    it('signale une collection inexistante', async () => {
      prisma.savedCollection.findUnique.mockResolvedValue(null);
      await expect(service.renameCollection('u1', 'c1', 'Nom')).rejects.toThrow(NotFoundException);
    });
  });

  describe('rangement', () => {
    it('range un lieu et lui donne une couverture si la collection n\'en a pas', async () => {
      prisma.savedCollection.findUnique
        .mockResolvedValueOnce({ userId: 'u1' })      // vérification de propriété
        .mockResolvedValueOnce({ coverUrl: null });   // recherche de couverture
      prisma.savedPlace.updateMany.mockResolvedValue({ count: 1 });
      prisma.place.findUnique.mockResolvedValue({ photoUrls: ['https://cdn/cover.jpg'] });

      await service.setPlaceCollection('u1', 'p1', 'c1');

      expect(prisma.savedCollection.update).toHaveBeenCalledWith({
        where: { id: 'c1' }, data: { coverUrl: 'https://cdn/cover.jpg' },
      });
    });

    it('ne remplace pas une couverture déjà choisie', async () => {
      prisma.savedCollection.findUnique
        .mockResolvedValueOnce({ userId: 'u1' })
        .mockResolvedValueOnce({ coverUrl: 'https://cdn/deja.jpg' });
      prisma.savedPlace.updateMany.mockResolvedValue({ count: 1 });

      await service.setPlaceCollection('u1', 'p1', 'c1');
      expect(prisma.savedCollection.update).not.toHaveBeenCalled();
    });

    it('refuse de ranger un lieu absent des favoris', async () => {
      prisma.savedCollection.findUnique.mockResolvedValue({ userId: 'u1' });
      prisma.savedPlace.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.setPlaceCollection('u1', 'inconnu', 'c1'))
        .rejects.toThrow(NotFoundException);
    });

    it('retire un lieu de sa collection sans vérifier de propriété', async () => {
      prisma.savedPlace.updateMany.mockResolvedValue({ count: 1 });

      await service.setPlaceCollection('u1', 'p1', null);

      // `null` ne cible aucune collection : rien à vérifier.
      expect(prisma.savedCollection.findUnique).not.toHaveBeenCalled();
      expect(prisma.savedPlace.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', placeId: 'p1' }, data: { collectionId: null },
      });
    });
  });
});
