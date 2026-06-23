import request = require('supertest');
import { createTestApp, type TestApp } from './helpers/app.helper';

const UUID1 = 'c0ffee00-c0ff-4e00-a000-000000000001';
const UUID2 = 'c0ffee00-c0ff-4e00-a000-000000000002';

const mockPlace = (id = UUID1) => ({
  id,
  name: 'Le Bistrot',
  universe: 'restaurant',
  city: 'Paris',
  countryCode: 'FR',
  rating: 4.5,
  priceTier: 2,
  photoUrls: ['https://cdn.yumia.app/p.jpg'],
  tags: ['terrasse'],
  lat: 48.856,
  lng: 2.352,
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('Places (e2e)', () => {
  let ta: TestApp;

  beforeAll(async () => { ta = await createTestApp(); });
  afterAll(async () => { await ta.app.close(); });

  beforeEach(() => { jest.clearAllMocks(); });

  // ── GET /api/places ───────────────────────────────────────────────────────

  describe('GET /api/places', () => {
    it('200 — liste paginée (pas d\'auth requise)', async () => {
      ta.prisma.place.findMany.mockResolvedValue([mockPlace('p1'), mockPlace('p2')]);

      const res = await request(ta.app.getHttpServer()).get('/api/places');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
    });

    it('200 — filtre par univers via ?universe=restaurant', async () => {
      ta.prisma.place.findMany.mockResolvedValue([mockPlace()]);

      const res = await request(ta.app.getHttpServer()).get('/api/places?universe=restaurant');

      expect(res.status).toBe(200);
      expect(ta.prisma.place.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ universe: 'restaurant' }) }),
      );
    });

    it('400 — univers invalide', async () => {
      const res = await request(ta.app.getHttpServer()).get('/api/places?universe=invalid_universe');
      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/places/nearby ────────────────────────────────────────────────

  describe('GET /api/places/nearby', () => {
    it('200 — retourne lieux géo (Postgres fallback)', async () => {
      ta.prisma.$queryRaw.mockResolvedValue([
        { ...mockPlace(), distanceMeters: 300 },
        { ...mockPlace(UUID2), distanceMeters: 800 },
      ]);

      const res = await request(ta.app.getHttpServer())
        .get('/api/places/nearby?lat=48.856&lng=2.352&radius=2000');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('400 — lat manquant', async () => {
      const res = await request(ta.app.getHttpServer())
        .get('/api/places/nearby?lng=2.352');
      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/places/:id ───────────────────────────────────────────────────

  describe('GET /api/places/:id', () => {
    it('200 — retourne le lieu', async () => {
      ta.prisma.place.findUnique.mockResolvedValue(mockPlace());

      const res = await request(ta.app.getHttpServer())
        .get(`/api/places/${UUID1}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Le Bistrot');
    });

    it('404 — lieu introuvable', async () => {
      ta.prisma.place.findUnique.mockResolvedValue(null);

      const res = await request(ta.app.getHttpServer())
        .get('/api/places/c0ffee00-c0ff-4e00-a000-000000000000');

      expect(res.status).toBe(404);
    });

    it('400 — id non-UUID', async () => {
      const res = await request(ta.app.getHttpServer())
        .get('/api/places/not-a-uuid');

      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/places/:id/stats ─────────────────────────────────────────────

  describe('GET /api/places/:id/stats', () => {
    it('200 — retourne les avis agrégés', async () => {
      ta.prisma.visit.groupBy = jest.fn().mockResolvedValue([
        { feedback: 'loved', _count: { id: 10 } },
        { feedback: 'neutral', _count: { id: 3 } },
      ]);

      const res = await request(ta.app.getHttpServer())
        .get(`/api/places/${UUID1}/stats`);

      expect(res.status).toBe(200);
      expect(res.body.loved).toBe(10);
      expect(res.body.total).toBe(13);
    });
  });

  // ── POST /api/places ──────────────────────────────────────────────────────
  // Le JWT e2e utilise l'email 'e2e@yumia.app' (voir app.helper.ts).
  // AdminGuard lit ADMIN_EMAILS à l'instanciation du guard — on override ici.

  describe('POST /api/places', () => {
    beforeAll(() => { process.env.ADMIN_EMAILS = 'e2e@yumia.app'; });
    afterAll(() => { delete process.env.ADMIN_EMAILS; });

    it('401 — sans token', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/places')
        .send({ name: 'Test', universe: 'restaurant', lat: 48.856, lng: 2.352, city: 'Paris', countryCode: 'FR' });
      expect(res.status).toBe(401);
    });

    it('403 — token valide mais email absent de ADMIN_EMAILS', async () => {
      // Temporairement vide : e2e@yumia.app n'est plus admin
      const prev = process.env.ADMIN_EMAILS;
      process.env.ADMIN_EMAILS = 'other@admin.com';

      const res = await request(ta.app.getHttpServer())
        .post('/api/places')
        .set('Authorization', `Bearer ${ta.token()}`)
        .send({ name: 'Test', universe: 'restaurant', lat: 48.856, lng: 2.352, city: 'Paris', countryCode: 'FR' });

      process.env.ADMIN_EMAILS = prev;
      expect(res.status).toBe(403);
    });

    it('201 — création valide par un admin', async () => {
      ta.prisma.place.create.mockResolvedValue(mockPlace());

      const res = await request(ta.app.getHttpServer())
        .post('/api/places')
        .set('Authorization', `Bearer ${ta.token()}`)
        .send({ name: 'Le Bistrot', universe: 'restaurant', lat: 48.856, lng: 2.352, city: 'Paris', countryCode: 'FR' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Le Bistrot');
    });
  });
});
