import request = require('supertest');
import { createTestApp, type TestApp } from './helpers/app.helper';

const mockUser = {
  id: 'user-e2e',
  email: 'e2e@yumia.app',
  displayName: 'E2E User',
  totalXp: 250,
  level: 2,
  plan: 'free',
  preferences: {},
  expoPushToken: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPlace = {
  id: 'place-1',
  name: 'Le Bistrot',
  universe: 'restaurant',
  city: 'Paris',
  countryCode: 'FR',
  rating: 4.5,
  priceTier: 2,
  photoUrls: [],
  tags: [],
  lat: 48.856,
  lng: 2.352,
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Passport (e2e)', () => {
  let ta: TestApp;

  beforeAll(async () => { ta = await createTestApp(); });
  afterAll(async () => { await ta.app.close(); });

  beforeEach(() => { jest.clearAllMocks(); });

  // ── Guard : toutes les routes nécessitent un JWT ──────────────────────────

  describe('Protection JWT', () => {
    const protectedRoutes = [
      { method: 'get',  path: '/api/passport' },
      { method: 'get',  path: '/api/passport/stats' },
      { method: 'get',  path: '/api/passport/heatmap' },
      { method: 'get',  path: '/api/passport/leaderboard' },
      { method: 'get',  path: '/api/passport/saved' },
      { method: 'post', path: '/api/passport/visits' },
      { method: 'post', path: '/api/passport/streak/freeze' },
    ];

    it.each(protectedRoutes)('401 sans token — $method $path', async ({ method, path }) => {
      const res = await (request(ta.app.getHttpServer()) as any)[method](path);
      expect(res.status).toBe(401);
    });
  });

  // ── GET /api/passport/stats ───────────────────────────────────────────────

  describe('GET /api/passport/stats', () => {
    it('200 — retourne niveau, streak et badges', async () => {
      ta.prisma.user.findUniqueOrThrow.mockResolvedValue(mockUser);
      ta.prisma.streak.findUnique.mockResolvedValue({
        userId: 'user-e2e',
        current: 7,
        best: 14,
        lastActivityDay: new Date(),
        freezesLeft: 2,
      });
      ta.prisma.earnedBadge.findMany.mockResolvedValue([
        { badgeKey: 'on_fire', earnedAt: new Date() },
      ]);

      const res = await request(ta.app.getHttpServer())
        .get('/api/passport/stats')
        .set('Authorization', `Bearer ${ta.token()}`);

      expect(res.status).toBe(200);
      expect(res.body.totalXp).toBe(250);
      expect(res.body.streak.current).toBe(7);
      expect(res.body.badges.earned).toContain('on_fire');
      expect(res.body.level.current.level).toBeGreaterThanOrEqual(1);
    });
  });

  // ── GET /api/passport ─────────────────────────────────────────────────────

  describe('GET /api/passport', () => {
    it('200 — retourne visites + agrégats', async () => {
      ta.prisma.visit.findMany.mockResolvedValue([
        {
          id: 'v-1',
          visitedAt: new Date(),
          feedback: 'loved',
          xpAwarded: 50,
          notes: null,
          place: mockPlace,
        },
      ]);
      ta.prisma.visit.count.mockResolvedValue(1);

      const res = await request(ta.app.getHttpServer())
        .get('/api/passport')
        .set('Authorization', `Bearer ${ta.token()}`);

      expect(res.status).toBe(200);
      expect(res.body.totalVisits).toBe(1);
      expect(Array.isArray(res.body.visits)).toBe(true);
      expect(res.body.distinctCountries).toBeGreaterThanOrEqual(0);
    });
  });

  // ── POST /api/passport/visits ─────────────────────────────────────────────

  describe('POST /api/passport/visits', () => {
    it('201 — enregistre une visite et retourne le résultat gamification', async () => {
      ta.prisma.place.findUnique.mockResolvedValue(mockPlace);
      ta.prisma.visit.count.mockResolvedValue(0);
      ta.prisma.streak.findUnique.mockResolvedValue(null);
      ta.prisma.visit.create.mockResolvedValue({ id: 'v-new', xpAwarded: 50 });
      ta.prisma.user.findUniqueOrThrow.mockResolvedValue(mockUser);
      ta.prisma.user.update.mockResolvedValue({});
      ta.prisma.streak.upsert.mockResolvedValue({});
      ta.prisma.visit.findMany.mockResolvedValue([]);
      ta.prisma.earnedBadge.findMany.mockResolvedValue([]);
      ta.prisma.earnedBadge.createMany.mockResolvedValue({});
      // $transaction doit appeler la fn avec le prisma mock
      (ta.prisma.$transaction as jest.Mock).mockImplementation(
        (fn: (p: any) => any) => fn(ta.prisma),
      );

      const res = await request(ta.app.getHttpServer())
        .post('/api/passport/visits')
        .set('Authorization', `Bearer ${ta.token()}`)
        .send({ placeId: 'c0ffee00-c0ff-4e00-a000-000000000001', feedback: 'loved' });

      expect(res.status).toBe(201);
      expect(res.body.visitId).toBeDefined();
      expect(res.body.xpAwarded).toBeGreaterThanOrEqual(0);
      expect(res.body.streak).toBeDefined();
    });

    it('400 — placeId manquant', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/passport/visits')
        .set('Authorization', `Bearer ${ta.token()}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('404 — lieu introuvable', async () => {
      ta.prisma.place.findUnique.mockResolvedValue(null);
      (ta.prisma.$transaction as jest.Mock).mockImplementation(
        (fn: (p: any) => any) => fn(ta.prisma),
      );

      const res = await request(ta.app.getHttpServer())
        .post('/api/passport/visits')
        .set('Authorization', `Bearer ${ta.token()}`)
        .send({ placeId: 'c0ffee00-c0ff-4e00-a000-000000000099' });

      expect(res.status).toBe(404);
    });
  });

  // ── GET /api/passport/leaderboard ────────────────────────────────────────

  describe('GET /api/passport/leaderboard', () => {
    it('200 — retourne un tableau (éventuellement vide)', async () => {
      ta.prisma.visit.findMany.mockResolvedValue([]);

      const res = await request(ta.app.getHttpServer())
        .get('/api/passport/leaderboard')
        .set('Authorization', `Bearer ${ta.token()}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('200 — filtre par ville via ?city=Paris', async () => {
      ta.prisma.visit.findMany.mockResolvedValue([]);

      const res = await request(ta.app.getHttpServer())
        .get('/api/passport/leaderboard?city=Paris')
        .set('Authorization', `Bearer ${ta.token()}`);

      expect(res.status).toBe(200);
      // Vérifie que findMany a été appelé avec le filtre city
      expect(ta.prisma.visit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            place: expect.objectContaining({ city: expect.objectContaining({ equals: 'Paris' }) }),
          }),
        }),
      );
    });
  });
});
