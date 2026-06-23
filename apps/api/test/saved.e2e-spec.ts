import request = require('supertest');
import { createTestApp, type TestApp } from './helpers/app.helper';

const PLACE_UUID = 'c0ffee00-c0ff-4e00-a000-000000000030';

const mockSavedPlace = (placeId = PLACE_UUID) => ({
  id: 'sp-1',
  userId: 'user-e2e',
  placeId,
  listName: 'a_essayer',
  createdAt: new Date(),
  place: {
    id: placeId,
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
  },
});

describe('Saved (e2e)', () => {
  let ta: TestApp;

  beforeAll(async () => { ta = await createTestApp(); });
  afterAll(async () => { await ta.app.close(); });

  beforeEach(() => {
    jest.clearAllMocks();
    ta.prisma.user.findUnique.mockResolvedValue({ plan: 'free' });
    ta.prisma.savedPlace.findMany.mockResolvedValue([mockSavedPlace()]);
    ta.prisma.savedPlace.count.mockResolvedValue(1);
    ta.prisma.savedPlace.upsert.mockResolvedValue(mockSavedPlace());
    ta.prisma.savedPlace.deleteMany.mockResolvedValue({ count: 1 });
  });

  // ── GET /api/saved ──────────────────────────────────────────────────────────

  describe('GET /api/saved', () => {
    it('401 — sans token', async () => {
      const res = await request(ta.app.getHttpServer()).get('/api/saved');
      expect(res.status).toBe(401);
    });

    it('200 — retourne la liste des lieux sauvegardés', async () => {
      const res = await request(ta.app.getHttpServer())
        .get('/api/saved')
        .set('Authorization', `Bearer ${ta.token()}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].place.name).toBe('Le Bistrot');
    });
  });

  // ── GET /api/saved/ids ──────────────────────────────────────────────────────

  describe('GET /api/saved/ids', () => {
    it('401 — sans token', async () => {
      const res = await request(ta.app.getHttpServer()).get('/api/saved/ids');
      expect(res.status).toBe(401);
    });

    it('200 — retourne un tableau d\'identifiants', async () => {
      ta.prisma.savedPlace.findMany.mockResolvedValue([{ placeId: PLACE_UUID }]);

      const res = await request(ta.app.getHttpServer())
        .get('/api/saved/ids')
        .set('Authorization', `Bearer ${ta.token()}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toContain(PLACE_UUID);
    });
  });

  // ── POST /api/saved ─────────────────────────────────────────────────────────

  describe('POST /api/saved', () => {
    it('401 — sans token', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/saved')
        .send({ placeId: PLACE_UUID });
      expect(res.status).toBe(401);
    });

    it('204 — sauvegarde un lieu', async () => {
      ta.prisma.savedPlace.count.mockResolvedValue(0);

      const res = await request(ta.app.getHttpServer())
        .post('/api/saved')
        .set('Authorization', `Bearer ${ta.token()}`)
        .send({ placeId: PLACE_UUID });

      expect(res.status).toBe(204);
    });

    it('403 — limite freemium atteinte (50 lieux)', async () => {
      ta.prisma.savedPlace.count.mockResolvedValue(50);

      const res = await request(ta.app.getHttpServer())
        .post('/api/saved')
        .set('Authorization', `Bearer ${ta.token()}`)
        .send({ placeId: PLACE_UUID });

      expect(res.status).toBe(403);
    });

    it('400 — placeId manquant', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/saved')
        .set('Authorization', `Bearer ${ta.token()}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ── DELETE /api/saved/:placeId ──────────────────────────────────────────────

  describe('DELETE /api/saved/:placeId', () => {
    it('401 — sans token', async () => {
      const res = await request(ta.app.getHttpServer())
        .delete(`/api/saved/${PLACE_UUID}`);
      expect(res.status).toBe(401);
    });

    it('204 — supprime le lieu des sauvegardes', async () => {
      const res = await request(ta.app.getHttpServer())
        .delete(`/api/saved/${PLACE_UUID}`)
        .set('Authorization', `Bearer ${ta.token()}`);

      expect(res.status).toBe(204);
      expect(ta.prisma.savedPlace.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ placeId: PLACE_UUID }) }),
      );
    });
  });
});
