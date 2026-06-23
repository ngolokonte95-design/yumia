import request = require('supertest');
import { createTestApp, type TestApp } from './helpers/app.helper';

const SESSION_UUID = 'c0ffee00-c0ff-4e00-a000-000000000010';
const PLACE_UUID   = 'c0ffee00-c0ff-4e00-a000-000000000020';

const mockMember = () => ({
  id: 'gm-1',
  sessionId: SESSION_UUID,
  userId: 'user-e2e',
  votes: {},
  joinedAt: new Date(),
  user: { displayName: 'Test User', photoUrl: null },
});

const mockPlace = () => ({
  id: PLACE_UUID,
  name: 'Chez Paul',
  universe: 'restaurant',
  city: 'Paris',
  countryCode: 'FR',
  rating: 4.2,
  priceTier: 2,
  photoUrls: [],
  tags: [],
  lat: 48.856,
  lng: 2.352,
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
});

const mockSession = (override: object = {}) => ({
  id: SESSION_UUID,
  inviteCode: 'ABC123',
  status: 'waiting',
  createdById: 'user-e2e',
  suggestions: [],
  decidedPlaceId: null,
  createdAt: new Date(),
  members: [mockMember()],
  ...override,
});

describe('Groups (e2e)', () => {
  let ta: TestApp;

  beforeAll(async () => { ta = await createTestApp(); });
  afterAll(async () => { await ta.app.close(); });

  beforeEach(() => {
    jest.clearAllMocks();
    ta.prisma.groupSession.findUnique.mockResolvedValue(mockSession());
    ta.prisma.groupSession.create.mockResolvedValue(mockSession());
    ta.prisma.groupSession.update.mockResolvedValue(mockSession());
    ta.prisma.groupMember.create.mockResolvedValue(mockMember());
    ta.prisma.groupMember.findMany.mockResolvedValue([mockMember()]);
    ta.prisma.groupMember.update.mockResolvedValue(mockMember());
    ta.prisma.place.findMany.mockResolvedValue([]);
  });

  // ── POST /api/groups ────────────────────────────────────────────────────────

  describe('POST /api/groups', () => {
    it('401 — sans token', async () => {
      const res = await request(ta.app.getHttpServer()).post('/api/groups').send({});
      expect(res.status).toBe(401);
    });

    it('201 — crée une session et retourne inviteCode', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/groups')
        .set('Authorization', `Bearer ${ta.token()}`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.inviteCode).toBeDefined();
    });
  });

  // ── POST /api/groups/join/:code ─────────────────────────────────────────────

  describe('POST /api/groups/join/:code', () => {
    it('401 — sans token', async () => {
      const res = await request(ta.app.getHttpServer()).post('/api/groups/join/ABC123');
      expect(res.status).toBe(401);
    });

    it('200 — rejoint la session', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/groups/join/ABC123')
        .set('Authorization', `Bearer ${ta.token()}`);

      expect(res.status).toBe(200);
      expect(res.body.inviteCode).toBe('ABC123');
    });

    it('404 — code inexistant', async () => {
      ta.prisma.groupSession.findUnique.mockResolvedValue(null);

      const res = await request(ta.app.getHttpServer())
        .post('/api/groups/join/XXXXXX')
        .set('Authorization', `Bearer ${ta.token()}`);

      expect(res.status).toBe(404);
    });
  });

  // ── GET /api/groups/:id ─────────────────────────────────────────────────────

  describe('GET /api/groups/:id', () => {
    it('401 — sans token', async () => {
      const res = await request(ta.app.getHttpServer()).get(`/api/groups/${SESSION_UUID}`);
      expect(res.status).toBe(401);
    });

    it('200 — retourne l\'état de la session', async () => {
      const res = await request(ta.app.getHttpServer())
        .get(`/api/groups/${SESSION_UUID}`)
        .set('Authorization', `Bearer ${ta.token()}`);

      expect(res.status).toBe(200);
      expect(res.body.inviteCode).toBe('ABC123');
    });

    it('404 — session inexistante', async () => {
      ta.prisma.groupSession.findUnique.mockResolvedValue(null);

      const res = await request(ta.app.getHttpServer())
        .get(`/api/groups/${SESSION_UUID}`)
        .set('Authorization', `Bearer ${ta.token()}`);

      expect(res.status).toBe(404);
    });
  });

  // ── POST /api/groups/:id/suggest ────────────────────────────────────────────

  describe('POST /api/groups/:id/suggest', () => {
    it('401 — sans token', async () => {
      const res = await request(ta.app.getHttpServer())
        .post(`/api/groups/${SESSION_UUID}/suggest`)
        .send({ lat: 48.856, lng: 2.352 });
      expect(res.status).toBe(401);
    });

    it('200 — lance l\'IA et passe la session en vote', async () => {
      // findUnique (1st call) doit retourner status:'waiting' pour passer la garde
      // → on garde le mock beforeEach : mockSession() avec status:'waiting'
      ta.prisma.$queryRaw.mockResolvedValue([
        { id: PLACE_UUID, name: 'Chez Paul', universe: 'restaurant', city: 'Paris',
          countryCode: 'FR', rating: 4.2, priceTier: 2, photoUrls: [], tags: [],
          lat: 48.856, lng: 2.352, metadata: {}, distanceMeters: 300,
          createdAt: new Date(), updatedAt: new Date() },
      ]);
      // suggest() passe le résultat de update() directement à toView() — pas de 2e findUnique
      ta.prisma.groupSession.update.mockResolvedValue(
        mockSession({ status: 'voting', suggestions: [PLACE_UUID], members: [mockMember()] }),
      );
      ta.prisma.place.findMany.mockResolvedValue([mockPlace()]);

      const res = await request(ta.app.getHttpServer())
        .post(`/api/groups/${SESSION_UUID}/suggest`)
        .set('Authorization', `Bearer ${ta.token()}`)
        .send({ lat: 48.856, lng: 2.352, locale: 'fr' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('voting');
    });
  });

  // ── POST /api/groups/:id/vote ───────────────────────────────────────────────

  describe('POST /api/groups/:id/vote', () => {
    it('401 — sans token', async () => {
      const res = await request(ta.app.getHttpServer())
        .post(`/api/groups/${SESSION_UUID}/vote`)
        .send({ placeId: PLACE_UUID, vote: 'like' });
      expect(res.status).toBe(401);
    });

    it('200 — enregistre le vote et retourne l\'état mis à jour', async () => {
      const votingSession = mockSession({ status: 'voting', suggestions: [PLACE_UUID] });
      ta.prisma.groupSession.findUnique.mockResolvedValue(votingSession);
      ta.prisma.groupMember.update.mockResolvedValue({ ...mockMember(), votes: { [PLACE_UUID]: 'like' } });
      ta.prisma.groupSession.update.mockResolvedValue(
        mockSession({ status: 'done', suggestions: [PLACE_UUID], decidedPlaceId: PLACE_UUID }),
      );
      ta.prisma.place.findMany.mockResolvedValue([mockPlace()]);

      const res = await request(ta.app.getHttpServer())
        .post(`/api/groups/${SESSION_UUID}/vote`)
        .set('Authorization', `Bearer ${ta.token()}`)
        .send({ placeId: PLACE_UUID, vote: 'like' });

      expect(res.status).toBe(200);
    });

    it('400 — vote invalide (ni like ni dislike)', async () => {
      const res = await request(ta.app.getHttpServer())
        .post(`/api/groups/${SESSION_UUID}/vote`)
        .set('Authorization', `Bearer ${ta.token()}`)
        .send({ placeId: PLACE_UUID, vote: 'meh' });

      expect(res.status).toBe(400);
    });
  });
});
