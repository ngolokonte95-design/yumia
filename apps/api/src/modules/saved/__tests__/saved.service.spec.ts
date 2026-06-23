import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SavedService } from '../saved.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RedisService } from '../../../infra/redis/redis.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makePrismaPlace = (overrides: Partial<any> = {}): any => ({
  id: 'place-1',
  name: 'Le Bistrot',
  universe: 'restaurant',
  lat: 48.856,
  lng: 2.352,
  city: 'Paris',
  countryCode: 'FR',
  rating: 4.5,
  priceTier: 2,
  photoUrls: [],
  tags: [],
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ── Mock factories ────────────────────────────────────────────────────────────

const makePrisma = () => ({
  user: { findUnique: jest.fn() },
  savedPlace: {
    count: jest.fn().mockResolvedValue(0),
    upsert: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    findMany: jest.fn().mockResolvedValue([]),
  },
});

const makeRedis = () => ({
  getJson: jest.fn().mockResolvedValue(null),
  setJson: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(1),
  ping: jest.fn().mockResolvedValue(true),
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SavedService', () => {
  let service: SavedService;
  let prisma: ReturnType<typeof makePrisma>;
  let redis: ReturnType<typeof makeRedis>;

  beforeEach(async () => {
    prisma = makePrisma();
    redis = makeRedis();

    const module = await Test.createTestingModule({
      providers: [
        SavedService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(SavedService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── savedIds ──────────────────────────────────────────────────────────────────

  describe('savedIds', () => {
    it('retourne les IDs depuis le cache sans DB', async () => {
      redis.getJson.mockResolvedValue(['place-1', 'place-2']);

      const result = await service.savedIds('user-1');

      expect(result).toEqual(['place-1', 'place-2']);
      expect(prisma.savedPlace.findMany).not.toHaveBeenCalled();
    });

    it('lit la DB, met en cache et retourne les IDs si cache miss', async () => {
      redis.getJson.mockResolvedValue(null);
      prisma.savedPlace.findMany.mockResolvedValue([
        { placeId: 'place-1' },
        { placeId: 'place-2' },
      ]);

      const result = await service.savedIds('user-1');

      expect(result).toEqual(['place-1', 'place-2']);
      expect(redis.setJson).toHaveBeenCalledWith('saved:ids:user-1', ['place-1', 'place-2'], expect.any(Number));
    });

    it('retourne un tableau vide si l\'utilisateur n\'a rien sauvegardé', async () => {
      redis.getJson.mockResolvedValue(null);
      prisma.savedPlace.findMany.mockResolvedValue([]);

      const result = await service.savedIds('user-1');

      expect(result).toEqual([]);
    });
  });

  // ── save ──────────────────────────────────────────────────────────────────────

  describe('save', () => {
    it('sauvegarde et invalide le cache saved:ids', async () => {
      prisma.user.findUnique.mockResolvedValue({ plan: 'free' });
      prisma.savedPlace.count.mockResolvedValue(0);

      await service.save('user-1', 'place-1');

      expect(prisma.savedPlace.upsert).toHaveBeenCalled();
      expect(redis.del).toHaveBeenCalledWith('saved:ids:user-1');
    });

    it('lève ForbiddenException quand la limite free est atteinte', async () => {
      prisma.user.findUnique.mockResolvedValue({ plan: 'free' });
      prisma.savedPlace.count.mockResolvedValue(50); // PLAN_LIMITS.free.savedPlacesMax = 50

      await expect(service.save('user-1', 'place-1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.savedPlace.upsert).not.toHaveBeenCalled();
    });

    it('ne vérifie pas la limite pour les utilisateurs plus', async () => {
      prisma.user.findUnique.mockResolvedValue({ plan: 'plus' });

      await service.save('user-plus', 'place-1');

      expect(prisma.savedPlace.count).not.toHaveBeenCalled();
      expect(prisma.savedPlace.upsert).toHaveBeenCalled();
    });

    it('lève UnauthorizedException si l\'utilisateur est introuvable', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.save('unknown', 'place-1')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  // ── unsave ────────────────────────────────────────────────────────────────────

  describe('unsave', () => {
    it('supprime et invalide le cache saved:ids', async () => {
      await service.unsave('user-1', 'place-1');

      expect(prisma.savedPlace.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1', placeId: 'place-1' } });
      expect(redis.del).toHaveBeenCalledWith('saved:ids:user-1');
    });
  });

  // ── list ──────────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('retourne les lieux sauvegardés triés par date', async () => {
      const place = makePrismaPlace();
      prisma.savedPlace.findMany.mockResolvedValue([
        { createdAt: new Date('2025-01-10'), listName: 'a_essayer', place },
      ]);

      const result = await service.list('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].place.id).toBe('place-1');
      expect(result[0].listName).toBe('a_essayer');
    });
  });
});
