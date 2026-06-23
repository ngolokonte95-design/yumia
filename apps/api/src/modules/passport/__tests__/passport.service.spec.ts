import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PassportService } from '../passport.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { RedisService } from '../../../infra/redis/redis.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockPlace = (overrides: Partial<any> = {}) => ({
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

const mockUser = (overrides: Partial<any> = {}) => ({
  id: 'user-1',
  email: 'test@yumia.app',
  displayName: 'Test User',
  passwordHash: null,
  authProvider: 'password',
  appleId: null,
  bio: null,
  photoUrl: null,
  locale: 'fr',
  currency: 'EUR',
  countryCode: null,
  timezone: null,
  plan: 'free',
  totalXp: 0,
  level: 1,
  preferences: {},
  expoPushToken: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const mockStreak = (overrides: Partial<any> = {}) => ({
  userId: 'user-1',
  current: 5,
  best: 10,
  lastActivityDay: new Date(Date.now() - 86_400_000), // yesterday
  freezesLeft: 2,
  ...overrides,
});

const mockVisit = (overrides: Partial<any> = {}) => ({
  id: 'visit-1',
  userId: 'user-1',
  placeId: 'place-1',
  xpAwarded: 50,
  feedback: null,
  notes: null,
  visitedAt: new Date(),
  place: mockPlace(),
  ...overrides,
});

// ── Prisma mock (any pour éviter les surcharges Prisma) ───────────────────────

const prismaMock: any = {
  place: { findUnique: jest.fn() },
  user: { findUniqueOrThrow: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  visit: { create: jest.fn(), count: jest.fn(), findMany: jest.fn() },
  streak: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), findMany: jest.fn() },
  earnedBadge: { findMany: jest.fn(), createMany: jest.fn() },
  savedPlace: { count: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn() },
  $transaction: jest.fn((fn: (tx: any) => any) => fn(prismaMock)),
};

const notificationsMock = {
  sendToUser: jest.fn().mockResolvedValue(undefined),
};

const redisMock = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  getJson: jest.fn().mockResolvedValue(null),
  setJson: jest.fn().mockResolvedValue(undefined),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('PassportService', () => {
  let service: PassportService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PassportService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsMock },
        { provide: RedisService, useValue: redisMock },
      ],
    }).compile();

    service = module.get(PassportService);
    jest.clearAllMocks();
  });

  // ── recordVisit ────────────────────────────────────────────────────────────

  describe('recordVisit', () => {
    const setupHappyPath = () => {
      prismaMock.place.findUnique.mockResolvedValue(mockPlace());
      prismaMock.visit.count.mockResolvedValue(0);
      prismaMock.streak.findUnique.mockResolvedValue(null);
      prismaMock.visit.create.mockResolvedValue(mockVisit());
      prismaMock.user.findUniqueOrThrow.mockResolvedValue(mockUser({ totalXp: 100 }));
      prismaMock.user.update.mockResolvedValue({});
      prismaMock.streak.upsert.mockResolvedValue({});
      prismaMock.visit.findMany.mockResolvedValue([]); // countDistinctCountries
      prismaMock.earnedBadge.findMany.mockResolvedValue([]);
      prismaMock.earnedBadge.createMany.mockResolvedValue({});
    };

    it('lève NotFoundException si le lieu n\'existe pas', async () => {
      prismaMock.place.findUnique.mockResolvedValue(null);

      await expect(service.recordVisit('user-1', 'unknown-place')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('crée la visite et retourne le résultat de gamification', async () => {
      setupHappyPath();

      const result = await service.recordVisit('user-1', 'place-1');

      expect(prismaMock.visit.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1', placeId: 'place-1' }) }),
      );
      expect(result.visitId).toBe('visit-1');
      expect(result.xpAwarded).toBeGreaterThanOrEqual(0);
      expect(result.streak).toBeDefined();
      expect(result.newBadges).toBeInstanceOf(Array);
    });

    it('initialise le streak à 1 quand aucun streak existant', async () => {
      setupHappyPath();
      prismaMock.streak.findUnique.mockResolvedValue(null);

      const result = await service.recordVisit('user-1', 'place-1');

      expect(result.streak.current).toBe(1);
    });

    it('incrémente le streak si la dernière activité était hier', async () => {
      setupHappyPath();
      prismaMock.streak.findUnique.mockResolvedValue(
        mockStreak({ current: 5, best: 10, lastActivityDay: new Date(Date.now() - 86_400_000) }),
      );

      const result = await service.recordVisit('user-1', 'place-1');

      expect(result.streak.current).toBe(6);
    });

    it('remet le streak à 1 si la dernière activité était il y a plus de 2 jours', async () => {
      setupHappyPath();
      prismaMock.streak.findUnique.mockResolvedValue(
        mockStreak({ current: 20, best: 20, lastActivityDay: new Date(Date.now() - 3 * 86_400_000) }),
      );

      const result = await service.recordVisit('user-1', 'place-1');

      expect(result.streak.current).toBe(1);
      expect(result.streak.best).toBe(20); // best ne diminue pas
    });

    it('accumule l\'XP sur le totalXp existant', async () => {
      setupHappyPath();
      prismaMock.user.findUniqueOrThrow.mockResolvedValue(mockUser({ totalXp: 500 }));

      const result = await service.recordVisit('user-1', 'place-1');

      expect(result.totalXp).toBeGreaterThan(500);
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ totalXp: result.totalXp }) }),
      );
    });

    it('accorde le bonus feedback quand feedback fourni', async () => {
      setupHappyPath();

      const withFeedback = await service.recordVisit('user-1', 'place-1', 'loved');
      const withoutFeedback = await service.recordVisit('user-1', 'place-1');

      expect(withFeedback.xpAwarded).toBeGreaterThan(withoutFeedback.xpAwarded);
    });

    it('n\'attribue que les nouveaux badges (pas les doublons)', async () => {
      setupHappyPath();
      // Streak 30 jours → candidat 'on_fire' — mais déjà possédé
      prismaMock.streak.findUnique.mockResolvedValue(
        mockStreak({ current: 29, lastActivityDay: new Date(Date.now() - 86_400_000) }),
      );
      prismaMock.earnedBadge.findMany.mockResolvedValue([{ badgeKey: 'on_fire' }]);

      const result = await service.recordVisit('user-1', 'place-1');

      expect(result.newBadges).not.toContain('on_fire');
    });

    it('attribue un nouveau badge non encore possédé', async () => {
      setupHappyPath();
      // Streak 29 → après incrémente = 30 → on_fire
      prismaMock.streak.findUnique.mockResolvedValue(
        mockStreak({ current: 29, best: 29, lastActivityDay: new Date(Date.now() - 86_400_000) }),
      );
      prismaMock.earnedBadge.findMany.mockResolvedValue([]); // aucun badge existant

      const result = await service.recordVisit('user-1', 'place-1');

      expect(result.newBadges).toContain('on_fire');
      expect(prismaMock.earnedBadge.createMany).toHaveBeenCalled();
    });

    it('breakdown.total = xpAwarded retourné', async () => {
      setupHappyPath();

      const result = await service.recordVisit('user-1', 'place-1');
      const sum = Object.values(result.breakdown).reduce((acc: number, v) => acc + ((v as number) ?? 0), 0);

      expect(result.xpAwarded).toBe(sum);
    });

    it('invalide le cache leaderboard global et par ville après une visite', async () => {
      setupHappyPath();

      await service.recordVisit('user-1', 'place-1');

      // del doit être appelé avec au moins 'leaderboard:global' et 'leaderboard:Paris'
      expect(redisMock.del).toHaveBeenCalledWith('leaderboard:global', 'leaderboard:Paris');
    });
  });

  // ── getStats ───────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('retourne les stats complètes de l\'utilisateur', async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValue(mockUser({ totalXp: 250 }));
      prismaMock.streak.findUnique.mockResolvedValue(mockStreak({ current: 7, best: 14, freezesLeft: 1 }));
      prismaMock.earnedBadge.findMany.mockResolvedValue([
        { badgeKey: 'on_fire', earnedAt: new Date() },
      ]);

      const stats = await service.getStats('user-1');

      expect(stats.totalXp).toBe(250);
      expect(stats.streak.current).toBe(7);
      expect(stats.streak.best).toBe(14);
      expect(stats.streak.freezesLeft).toBe(1);
      expect(stats.badges.earned).toContain('on_fire');
      expect(stats.level.current.level).toBeGreaterThanOrEqual(1);
      expect(stats.level.ratio).toBeGreaterThanOrEqual(0);
      expect(stats.level.ratio).toBeLessThanOrEqual(1);
    });

    it('renvoie des valeurs par défaut quand aucun streak ni badge', async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValue(mockUser({ totalXp: 0 }));
      prismaMock.streak.findUnique.mockResolvedValue(null);
      prismaMock.earnedBadge.findMany.mockResolvedValue([]);

      const stats = await service.getStats('user-1');

      expect(stats.streak.current).toBe(0);
      expect(stats.streak.freezesLeft).toBe(0);
      expect(stats.badges.earned).toHaveLength(0);
    });
  });

  // ── freezeStreak ──────────────────────────────────────────────────────────

  describe('freezeStreak', () => {
    it('lève ForbiddenException si l\'utilisateur est sur le plan free', async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValue(mockUser({ plan: 'free' }));

      await expect(service.freezeStreak('user-1')).rejects.toThrow(ForbiddenException);
    });

    it('lève BadRequestException si aucun streak actif', async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValue(mockUser({ plan: 'plus' }));
      prismaMock.streak.findUnique.mockResolvedValue(null);

      await expect(service.freezeStreak('user-1')).rejects.toThrow(BadRequestException);
    });

    it('lève BadRequestException si streak = 0', async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValue(mockUser({ plan: 'plus' }));
      prismaMock.streak.findUnique.mockResolvedValue(mockStreak({ current: 0 }));

      await expect(service.freezeStreak('user-1')).rejects.toThrow(BadRequestException);
    });

    it('lève BadRequestException si plus de freezes disponibles', async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValue(mockUser({ plan: 'plus' }));
      prismaMock.streak.findUnique.mockResolvedValue(mockStreak({ freezesLeft: 0 }));

      await expect(service.freezeStreak('user-1')).rejects.toThrow(BadRequestException);
    });

    it('lève BadRequestException si le streak est déjà maintenu aujourd\'hui', async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValue(mockUser({ plan: 'plus' }));
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      prismaMock.streak.findUnique.mockResolvedValue(
        mockStreak({ current: 5, freezesLeft: 2, lastActivityDay: todayStart }),
      );

      await expect(service.freezeStreak('user-1')).rejects.toThrow(BadRequestException);
    });

    it('décrémente freezesLeft et renvoie le résultat', async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValue(mockUser({ plan: 'plus' }));
      prismaMock.streak.findUnique.mockResolvedValue(
        mockStreak({ current: 7, freezesLeft: 3, lastActivityDay: new Date(Date.now() - 86_400_000) }),
      );
      prismaMock.streak.update.mockResolvedValue({ freezesLeft: 2 });

      const result = await service.freezeStreak('user-1');

      expect(prismaMock.streak.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ freezesLeft: { decrement: 1 } }),
        }),
      );
      expect(result.freezesLeft).toBe(2);
      expect(result.streakCurrent).toBe(7);
    });
  });

  // ── savePlace ──────────────────────────────────────────────────────────────

  describe('savePlace', () => {
    it('lève NotFoundException si le lieu est introuvable', async () => {
      prismaMock.place.findUnique.mockResolvedValue(null);

      await expect(service.savePlace('user-1', 'unknown')).rejects.toThrow(NotFoundException);
    });

    it('lève ForbiddenException quand le plafond Free est atteint', async () => {
      prismaMock.place.findUnique.mockResolvedValue(mockPlace());
      prismaMock.user.findUniqueOrThrow.mockResolvedValue(mockUser({ plan: 'free' }));
      // PLAN_LIMITS.free.savedPlacesMax = 20 (ou autre valeur finie)
      prismaMock.savedPlace.count.mockResolvedValue(9999);

      await expect(service.savePlace('user-1', 'place-1')).rejects.toThrow(ForbiddenException);
    });

    it('sauvegarde le lieu sous le plafond', async () => {
      prismaMock.place.findUnique.mockResolvedValue(mockPlace());
      prismaMock.user.findUniqueOrThrow.mockResolvedValue(mockUser({ plan: 'free' }));
      prismaMock.savedPlace.count.mockResolvedValue(0);
      prismaMock.savedPlace.upsert.mockResolvedValue({ id: 'sp-1' });

      const result = await service.savePlace('user-1', 'place-1');

      expect(prismaMock.savedPlace.upsert).toHaveBeenCalled();
      expect(result).toMatchObject({ id: 'sp-1' });
    });

    it('n\'applique pas de plafond pour le plan plus (Infinity)', async () => {
      prismaMock.place.findUnique.mockResolvedValue(mockPlace());
      prismaMock.user.findUniqueOrThrow.mockResolvedValue(mockUser({ plan: 'plus' }));
      prismaMock.savedPlace.upsert.mockResolvedValue({ id: 'sp-2' });

      // Ne doit pas appeler savedPlace.count
      await service.savePlace('user-1', 'place-1', 'mes_favoris');

      expect(prismaMock.savedPlace.count).not.toHaveBeenCalled();
      expect(prismaMock.savedPlace.upsert).toHaveBeenCalled();
    });
  });

  // ── getLeaderboard ────────────────────────────────────────────────────────

  describe('getLeaderboard', () => {
    it('retourne un tableau vide s\'il n\'y a aucune visite cette semaine', async () => {
      prismaMock.visit.findMany.mockResolvedValue([]);

      const result = await service.getLeaderboard();

      expect(result).toHaveLength(0);
    });

    it('agrège le XP hebdomadaire et trie par weeklyXp décroissant', async () => {
      prismaMock.visit.findMany.mockResolvedValue([
        { userId: 'user-a', xpAwarded: 30 },
        { userId: 'user-b', xpAwarded: 80 },
        { userId: 'user-a', xpAwarded: 20 }, // user-a total = 50
      ]);
      prismaMock.user.findMany.mockResolvedValue([
        { id: 'user-a', displayName: 'Alice', totalXp: 200, level: 3 },
        { id: 'user-b', displayName: 'Bob', totalXp: 500, level: 5 },
      ]);
      prismaMock.streak.findMany.mockResolvedValue([
        { userId: 'user-a', current: 3 },
        { userId: 'user-b', current: 10 },
      ]);

      const result = await service.getLeaderboard();

      expect(result).toHaveLength(2);
      expect(result[0].userId).toBe('user-b');
      expect(result[0].weeklyXp).toBe(80);
      expect(result[0].rank).toBe(1);
      expect(result[1].userId).toBe('user-a');
      expect(result[1].weeklyXp).toBe(50);
      expect(result[1].rank).toBe(2);
    });

    it('limite le classement à 50 entrées', async () => {
      const visits = Array.from({ length: 60 }, (_, i) => ({
        userId: `user-${i}`,
        xpAwarded: 60 - i,
      }));
      prismaMock.visit.findMany.mockResolvedValue(visits);
      prismaMock.user.findMany.mockResolvedValue(
        visits.map((v, i) => ({ id: v.userId, displayName: `User ${i}`, totalXp: 100, level: 1 })),
      );
      prismaMock.streak.findMany.mockResolvedValue([]);

      const result = await service.getLeaderboard();

      expect(result.length).toBeLessThanOrEqual(50);
    });

    it('attribue streak = 0 aux utilisateurs sans streak enregistré', async () => {
      prismaMock.visit.findMany.mockResolvedValue([{ userId: 'user-1', xpAwarded: 100 }]);
      prismaMock.user.findMany.mockResolvedValue([
        { id: 'user-1', displayName: 'Solo', totalXp: 100, level: 1 },
      ]);
      prismaMock.streak.findMany.mockResolvedValue([]); // aucun streak

      const [entry] = await service.getLeaderboard();

      expect(entry.streak).toBe(0);
    });
  });
});
