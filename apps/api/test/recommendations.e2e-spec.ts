import request = require('supertest');
import { createTestApp, type TestApp } from './helpers/app.helper';

const mockPlace = (id = 'place-1') => ({
  id,
  name: 'Le Bistrot',
  universe: 'restaurant',
  city: 'Paris',
  countryCode: 'FR',
  rating: 4.5,
  priceTier: 2,
  photoUrls: ['https://cdn.yumia.app/photo.jpg'],
  tags: [],
  lat: 48.856,
  lng: 2.352,
  metadata: {},
  distanceMeters: 500,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const top3Body = {
  lat: 48.856,
  lng: 2.352,
  radius: 3000,
  locale: 'fr',
};

describe('Recommendations (e2e)', () => {
  let ta: TestApp;

  beforeAll(async () => { ta = await createTestApp(); });
  afterAll(async () => { await ta.app.close(); });

  beforeEach(() => {
    jest.clearAllMocks();
    // AiService mock retourne toujours la même réponse structurée
    ta.prisma.place.findMany.mockResolvedValue([mockPlace('p1'), mockPlace('p2'), mockPlace('p3')]);
    ta.prisma.$queryRaw.mockResolvedValue([
      { ...mockPlace('p1'), distanceMeters: 200 },
      { ...mockPlace('p2'), distanceMeters: 600 },
      { ...mockPlace('p3'), distanceMeters: 900 },
    ]);
  });

  // ── POST /api/recommendations/top3 ───────────────────────────────────────

  describe('POST /api/recommendations/top3', () => {
    it('401 — sans token', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/recommendations/top3')
        .send(top3Body);
      expect(res.status).toBe(401);
    });

    it('200 — avec token, retourne suggestions + reason', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/recommendations/top3')
        .set('Authorization', `Bearer ${ta.token()}`)
        .send(top3Body);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.suggestions)).toBe(true);
      expect(res.body.generatedAtIso).toBeDefined();
    });

    it('400 — lat manquant', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/recommendations/top3')
        .set('Authorization', `Bearer ${ta.token()}`)
        .send({ lng: 2.352 });

      expect(res.status).toBe(400);
    });

    it('400 — lat hors limites (> 90)', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/recommendations/top3')
        .set('Authorization', `Bearer ${ta.token()}`)
        .send({ lat: 999, lng: 2.352 });

      expect(res.status).toBe(400);
    });

    it('400 — propriété inconnue (forbidNonWhitelisted)', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/recommendations/top3')
        .set('Authorization', `Bearer ${ta.token()}`)
        .send({ ...top3Body, unknownField: 'hack' });

      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/recommendations/search ─────────────────────────────────────

  describe('POST /api/recommendations/search', () => {
    it('401 — sans token', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/recommendations/search')
        .send({ lat: 48.856, lng: 2.352, query: 'un bar sympa' });
      expect(res.status).toBe(401);
    });

    it('200 — recherche libre retourne suggestions', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/recommendations/search')
        .set('Authorization', `Bearer ${ta.token()}`)
        .send({ lat: 48.856, lng: 2.352, query: 'terrasse ensoleillée' });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.suggestions)).toBe(true);
    });
  });

  // ── POST /api/recommendations/chat ───────────────────────────────────────

  describe('POST /api/recommendations/chat', () => {
    it('401 — sans token', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/recommendations/chat')
        .send({ placeName: 'Le Bistrot', placeUniverse: 'restaurant', message: 'Bonne ambiance ?' });
      expect(res.status).toBe(401);
    });

    it('200 — retourne une réponse textuelle', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/recommendations/chat')
        .set('Authorization', `Bearer ${ta.token()}`)
        .send({ placeName: 'Le Bistrot', placeUniverse: 'restaurant', message: 'Bonne ambiance ?' });

      expect(res.status).toBe(200);
      expect(typeof res.body.reply).toBe('string');
    });
  });
});
