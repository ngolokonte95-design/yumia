import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PlacesService } from '../places.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { ElasticsearchService } from '../../../infra/elasticsearch/elasticsearch.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { PLACES_PROVIDER } from '../providers/places-provider.interface';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makePlace = (overrides: Partial<any> = {}): any => ({
  id: 'place-1',
  name: 'Le Bistrot',
  universe: 'restaurant',
  lat: 48.856,
  lng: 2.352,
  city: 'Paris',
  countryCode: 'FR',
  rating: 4.5,
  priceTier: 2,
  photoUrls: ['https://cdn.yumia.app/photo.jpg'],
  tags: [],
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ── Mock factories ────────────────────────────────────────────────────────────

const makePrisma = () => ({
  place: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
  visit: {
    groupBy: jest.fn(),
  },
  $queryRaw: jest.fn().mockResolvedValue([]),
});

const makeRedis = () => ({
  getJson: jest.fn().mockResolvedValue(null),
  setJson: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(1),
  ping: jest.fn().mockResolvedValue(true),
});

const makeEs = () => ({
  isAvailable: false,
  indexPlace: jest.fn().mockResolvedValue(undefined),
  geoNearby: jest.fn().mockResolvedValue([]),
  ping: jest.fn().mockResolvedValue(null),
});

// Provider externe inactif par défaut : l'hydratation est court-circuitée,
// le comportement testé reste 100 % local.
const makeProvider = () => ({
  isEnabled: false,
  searchNearby: jest.fn().mockResolvedValue([]),
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PlacesService', () => {
  let service: PlacesService;
  let prisma: ReturnType<typeof makePrisma>;
  let redis: ReturnType<typeof makeRedis>;
  let es: ReturnType<typeof makeEs>;
  let provider: ReturnType<typeof makeProvider>;

  beforeEach(async () => {
    prisma = makePrisma();
    redis = makeRedis();
    es = makeEs();
    provider = makeProvider();

    const module = await Test.createTestingModule({
      providers: [
        PlacesService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: ElasticsearchService, useValue: es },
        { provide: PLACES_PROVIDER, useValue: provider },
      ],
    }).compile();

    service = module.get(PlacesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── findById ─────────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('retourne depuis le cache sans toucher la DB', async () => {
      const place = makePlace();
      redis.getJson.mockResolvedValue(place);

      const result = await service.findById('place-1');

      expect(result).toEqual(place);
      expect(prisma.place.findUnique).not.toHaveBeenCalled();
    });

    it('lit la DB, met en cache et retourne le lieu si cache miss', async () => {
      const place = makePlace();
      redis.getJson.mockResolvedValue(null);
      prisma.place.findUnique.mockResolvedValue(place);

      const result = await service.findById('place-1');

      expect(result).toEqual(place);
      expect(prisma.place.findUnique).toHaveBeenCalledWith({ where: { id: 'place-1' } });
      expect(redis.setJson).toHaveBeenCalledWith('place:place-1', place, expect.any(Number));
    });

    it('lève NotFoundException si le lieu est introuvable', async () => {
      redis.getJson.mockResolvedValue(null);
      prisma.place.findUnique.mockResolvedValue(null);

      await expect(service.findById('unknown')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── placeStats ───────────────────────────────────────────────────────────────

  describe('placeStats', () => {
    it('retourne depuis le cache sans requête DB', async () => {
      const stats = { loved: 5, neutral: 2, disliked: 1, total: 8 };
      redis.getJson.mockResolvedValue(stats);

      const result = await service.placeStats('place-1');

      expect(result).toEqual(stats);
      expect(prisma.visit.groupBy).not.toHaveBeenCalled();
    });

    it('agrège les feedbacks DB, met en cache et retourne les stats', async () => {
      redis.getJson.mockResolvedValue(null);
      prisma.visit.groupBy.mockResolvedValue([
        { feedback: 'loved', _count: { id: 10 } },
        { feedback: 'neutral', _count: { id: 3 } },
        { feedback: 'disliked', _count: { id: 2 } },
      ]);

      const result = await service.placeStats('place-1');

      expect(result).toEqual({ loved: 10, neutral: 3, disliked: 2, total: 15 });
      expect(redis.setJson).toHaveBeenCalledWith('place:stats:place-1', result, expect.any(Number));
    });

    it('retourne des zéros quand aucun feedback', async () => {
      redis.getJson.mockResolvedValue(null);
      prisma.visit.groupBy.mockResolvedValue([]);

      const result = await service.placeStats('place-1');

      expect(result).toEqual({ loved: 0, neutral: 0, disliked: 0, total: 0 });
    });
  });

  // ── addPhoto ─────────────────────────────────────────────────────────────────

  describe('addPhoto', () => {
    it('ajoute la photo et invalide le cache du lieu', async () => {
      const existing = makePlace();
      const updated = makePlace({ photoUrls: [...existing.photoUrls, 'https://cdn.yumia.app/new.jpg'] });
      prisma.place.findUnique.mockResolvedValue(existing);
      prisma.place.update.mockResolvedValue(updated);

      const result = await service.addPhoto('place-1', 'https://cdn.yumia.app/new.jpg');

      expect(result).toEqual(updated);
      expect(redis.del).toHaveBeenCalledWith('place:place-1');
    });

    it('lève NotFoundException si le lieu est introuvable', async () => {
      prisma.place.findUnique.mockResolvedValue(null);

      await expect(service.addPhoto('unknown', 'https://cdn.yumia.app/new.jpg'))
        .rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('crée le lieu en DB et lance l\'indexation ES en fire-and-forget', async () => {
      const place = makePlace();
      prisma.place.create.mockResolvedValue(place);

      const result = await service.create({
        name: 'Le Bistrot',
        universe: 'restaurant',
        lat: 48.856,
        lng: 2.352,
        city: 'Paris',
        countryCode: 'FR',
      });

      expect(result).toEqual(place);
      expect(prisma.place.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'Le Bistrot' }) }),
      );
      // ES indexation est fire-and-forget — appelé mais ne bloque pas
      expect(es.indexPlace).toHaveBeenCalledWith(place);
    });

    it('normalise countryCode en majuscules', async () => {
      const place = makePlace({ countryCode: 'FR' });
      prisma.place.create.mockResolvedValue(place);

      await service.create({
        name: 'Le Bistrot',
        universe: 'restaurant',
        lat: 48.856,
        lng: 2.352,
        city: 'Paris',
        countryCode: 'fr', // minuscules en entrée
      });

      expect(prisma.place.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ countryCode: 'FR' }) }),
      );
    });
  });

  // ── nearby ────────────────────────────────────────────────────────────────────

  describe('nearby', () => {
    it('utilise PostgreSQL Haversine quand ES n\'est pas disponible', async () => {
      const row = { ...makePlace(), distanceMeters: 300 };
      prisma.$queryRaw.mockResolvedValue([row]);
      es.isAvailable = false;

      const result = await service.nearby({ lat: 48.856, lng: 2.352, radius: 3000, limit: 5 });

      expect(result).toEqual([row]);
      expect(es.geoNearby).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('utilise Elasticsearch geo_distance quand ES est disponible', async () => {
      const place = makePlace();
      es.isAvailable = true;
      es.geoNearby.mockResolvedValue([{ id: 'place-1', distanceMeters: 200 }]);
      prisma.place.findMany.mockResolvedValue([place]);

      const result = await service.nearby({ lat: 48.856, lng: 2.352, radius: 3000, limit: 5 });

      expect(es.geoNearby).toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(result[0]).toMatchObject({ id: 'place-1', distanceMeters: 200 });
    });

    it('retourne un tableau vide quand ES trouve aucun lieu', async () => {
      es.isAvailable = true;
      es.geoNearby.mockResolvedValue([]);

      const result = await service.nearby({ lat: 48.856, lng: 2.352, radius: 3000, limit: 5 });

      expect(result).toEqual([]);
    });

    it('n\'hydrate pas quand le provider est inactif (isEnabled=false)', async () => {
      es.isAvailable = false;
      prisma.$queryRaw.mockResolvedValue([]); // base vide localement

      const result = await service.nearby({ lat: 35.68, lng: 139.69, radius: 3000, limit: 5 });

      expect(result).toEqual([]);
      expect(provider.searchNearby).not.toHaveBeenCalled();
      expect(prisma.place.upsert).not.toHaveBeenCalled();
    });

    it('hydrate via le provider quand la base locale est pauvre, puis relit en PG', async () => {
      es.isAvailable = false;
      provider.isEnabled = true;
      provider.searchNearby.mockResolvedValue([
        {
          providerPlaceId: 'g-1',
          name: 'Tokyo Ramen',
          universe: 'restaurant',
          lat: 35.68,
          lng: 139.69,
          city: 'Tokyo',
          countryCode: 'JP',
          rating: 4.6,
          priceTier: 2,
          tags: ['restaurant'],
        },
      ]);
      const imported = { ...makePlace({ id: 'g-1', city: 'Tokyo' }), distanceMeters: 120 };
      // 1er appel (pré-hydratation) : vide ; 2e appel (relecture PG) : le lieu importé.
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([imported]);
      prisma.place.upsert.mockResolvedValue(imported);

      const result = await service.nearby({ lat: 35.68, lng: 139.69, radius: 3000, limit: 5 });

      expect(provider.searchNearby).toHaveBeenCalled();
      expect(prisma.place.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { providerPlaceId: 'g-1' } }),
      );
      expect(result).toEqual([imported]);
    });

    it('ne réhydrate pas une tuile déjà marquée dans Redis', async () => {
      es.isAvailable = false;
      provider.isEnabled = true;
      prisma.$queryRaw.mockResolvedValue([]); // base vide
      redis.getJson.mockResolvedValue(true); // tuile déjà hydratée

      const result = await service.nearby({ lat: 35.68, lng: 139.69, radius: 3000, limit: 5 });

      expect(provider.searchNearby).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  // ── trending ─────────────────────────────────────────────────────────────────

  describe('trending', () => {
    it('retourne depuis le cache sans requête DB', async () => {
      const cached = [{ ...makePlace(), distanceMeters: 500, visitCount: 7 }];
      redis.getJson.mockResolvedValue(cached);

      const result = await service.trending({ lat: 48.856, lng: 2.352, radius: 3000, limit: 5 });

      expect(result).toEqual(cached);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('interroge la DB, met en cache et retourne les lieux tendance', async () => {
      const row = { ...makePlace(), distanceMeters: 500, visitCount: 7 };
      redis.getJson.mockResolvedValue(null);
      prisma.$queryRaw.mockResolvedValue([row]);

      const result = await service.trending({ lat: 48.856, lng: 2.352, radius: 3000, limit: 5 });

      expect(result).toEqual([row]);
      expect(redis.setJson).toHaveBeenCalledWith(
        expect.stringContaining('trending:'),
        [row],
        expect.any(Number),
      );
    });
  });
});
