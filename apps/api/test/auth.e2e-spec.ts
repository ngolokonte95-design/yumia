import request = require('supertest');
import * as bcrypt from 'bcryptjs';
import { createTestApp, type TestApp } from './helpers/app.helper';

const mockUser = {
  id: 'user-e2e',
  email: 'e2e@yumia.app',
  displayName: 'E2E User',
  passwordHash: '',
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
};

describe('Auth (e2e)', () => {
  let ta: TestApp;

  beforeAll(async () => {
    ta = await createTestApp();
    mockUser.passwordHash = await bcrypt.hash('ValidPass99!', 4);
  });
  afterAll(async () => { await ta.app.close(); });

  beforeEach(() => { jest.clearAllMocks(); });

  // ── POST /api/auth/register ───────────────────────────────────────────────

  describe('POST /api/auth/register', () => {
    it('201 — inscription valide retourne user + tokens', async () => {
      ta.prisma.user.findUnique.mockResolvedValue(null);
      ta.prisma.user.create.mockResolvedValue(mockUser);
      ta.prisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const res = await request(ta.app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'e2e@yumia.app', password: 'ValidPass99!', displayName: 'E2E User', locale: 'fr' });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.tokens?.accessToken).toBeDefined();
      expect(res.body.tokens?.refreshToken).toBeDefined();
    });

    it('400 — email invalide', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'ValidPass99!', displayName: 'Test' });

      expect(res.status).toBe(400);
    });

    it('400 — mot de passe trop court (< 8 chars)', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'test@yumia.app', password: 'short', displayName: 'Test' });

      expect(res.status).toBe(400);
    });

    it('400 — mot de passe sans chiffre (ex: aaaaaaaa)', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'test@yumia.app', password: 'aaaaaaaa', displayName: 'Test' });

      expect(res.status).toBe(400);
    });

    it('400 — mot de passe sans lettre (ex: 12345678)', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'test@yumia.app', password: '12345678', displayName: 'Test' });

      expect(res.status).toBe(400);
    });

    it('400 — displayName manquant', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'test@yumia.app', password: 'ValidPass99!' });

      expect(res.status).toBe(400);
    });

    it('409 — email déjà utilisé', async () => {
      ta.prisma.user.findUnique.mockResolvedValue(mockUser);

      const res = await request(ta.app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'e2e@yumia.app', password: 'ValidPass99!', displayName: 'E2E User' });

      expect(res.status).toBe(409);
    });

    it('201 — révoque les sessions excédentaires au-delà de MAX_ACTIVE_SESSIONS (5)', async () => {
      ta.prisma.user.findUnique.mockResolvedValue(null);
      ta.prisma.user.create.mockResolvedValue({ ...mockUser, id: 'new-user' });
      ta.prisma.refreshToken.create.mockResolvedValue({ id: 'rt-new' });
      // Simule 6 sessions actives — la 6ème (la plus ancienne) doit être révoquée
      ta.prisma.refreshToken.findMany.mockResolvedValue([
        { id: 'rt-1' }, { id: 'rt-2' }, { id: 'rt-3' },
        { id: 'rt-4' }, { id: 'rt-5' }, { id: 'rt-6' },
      ]);

      const res = await request(ta.app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'new@yumia.app', password: 'ValidPass99!', displayName: 'New' });

      expect(res.status).toBe(201);
      expect(ta.prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { revokedAt: expect.any(Date) } }),
      );
    });
  });

  // ── POST /api/auth/login ──────────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    it('200 — identifiants valides', async () => {
      ta.prisma.user.findUnique.mockResolvedValue(mockUser);
      ta.prisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const res = await request(ta.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'e2e@yumia.app', password: 'ValidPass99!' });

      expect(res.status).toBe(200);
      expect(res.body.tokens?.accessToken).toBeDefined();
    });

    it('401 — mauvais mot de passe', async () => {
      ta.prisma.user.findUnique.mockResolvedValue(mockUser);

      const res = await request(ta.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'e2e@yumia.app', password: 'WrongPassword!' });

      expect(res.status).toBe(401);
    });

    it('401 — utilisateur inconnu', async () => {
      ta.prisma.user.findUnique.mockResolvedValue(null);

      const res = await request(ta.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'unknown@yumia.app', password: 'ValidPass99!' });

      expect(res.status).toBe(401);
    });

    it('400 — body vide', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/auth/login')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/auth/me ──────────────────────────────────────────────────────

  describe('GET /api/auth/me', () => {
    it('200 — token valide retourne le profil', async () => {
      ta.prisma.user.findUnique.mockResolvedValue(mockUser);

      const res = await request(ta.app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${ta.token()}`);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('e2e@yumia.app');
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('401 — sans token', async () => {
      const res = await request(ta.app.getHttpServer()).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('401 — token malformé', async () => {
      const res = await request(ta.app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', 'Bearer not.a.jwt');
      expect(res.status).toBe(401);
    });
  });

  // ── POST /api/auth/refresh ────────────────────────────────────────────────

  describe('POST /api/auth/refresh', () => {
    it('200 — refresh token valide retourne une nouvelle paire', async () => {
      ta.prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-e2e',
        tokenHash: 'irrelevant',
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: null,
        createdAt: new Date(),
        user: mockUser,
      });
      ta.prisma.refreshToken.update.mockResolvedValue({});
      ta.prisma.refreshToken.create.mockResolvedValue({ id: 'rt-2' });

      const res = await request(ta.app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: 'some-valid-looking-refresh-token-here' });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
    });

    it('400 — refreshToken manquant', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/auth/refresh')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/auth/forgot-password ───────────────────────────────────────

  describe('POST /api/auth/forgot-password', () => {
    it('200 — toujours 200 même si l\'email est inconnu (anti-énumération)', async () => {
      ta.prisma.user.findUnique.mockResolvedValue(null);

      const res = await request(ta.app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'unknown@yumia.app' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBeDefined();
    });

    it('400 — email invalide', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'pas-un-email' });

      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/auth/reset-password ────────────────────────────────────────

  describe('POST /api/auth/reset-password', () => {
    const mockResetRecord = {
      id: 'prt-1',
      userId: 'user-e2e',
      tokenHash: '',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      usedAt: null,
      createdAt: new Date(),
      user: null as unknown as typeof mockUser,
    };

    it('200 — OTP valide réinitialise le mot de passe', async () => {
      ta.prisma.passwordResetToken.findUnique.mockResolvedValue({ ...mockResetRecord, user: mockUser });
      ta.prisma.$transaction.mockResolvedValue(undefined);

      const res = await request(ta.app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: '123456', newPassword: 'NewPass99!' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBeDefined();
    });

    it('400 — OTP invalide retourne 400', async () => {
      ta.prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      const res = await request(ta.app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: 'bad-otp', newPassword: 'NewPass99!' });

      expect(res.status).toBe(400);
    });

    it('400 — mot de passe trop court', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: '123456', newPassword: 'short' });

      expect(res.status).toBe(400);
    });

    it('400 — mot de passe sans chiffre', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: '123456', newPassword: 'aaaaaaaa' });

      expect(res.status).toBe(400);
    });

    it('400 — mot de passe sans lettre', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: '123456', newPassword: '12345678' });

      expect(res.status).toBe(400);
    });
  });

  // ── PATCH /api/auth/me ───────────────────────────────────────────────────

  describe('PATCH /api/auth/me', () => {
    it('401 — sans token', async () => {
      const res = await request(ta.app.getHttpServer())
        .patch('/api/auth/me')
        .send({ displayName: 'Nouveau Nom' });
      expect(res.status).toBe(401);
    });

    it('200 — met à jour le displayName', async () => {
      ta.prisma.user.findUnique.mockResolvedValue(mockUser);
      ta.prisma.user.update.mockResolvedValue({ ...mockUser, displayName: 'Nouveau Nom' });

      const res = await request(ta.app.getHttpServer())
        .patch('/api/auth/me')
        .set('Authorization', `Bearer ${ta.token()}`)
        .send({ displayName: 'Nouveau Nom' });

      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe('Nouveau Nom');
    });

    it('200 — met à jour la bio', async () => {
      ta.prisma.user.findUnique.mockResolvedValue(mockUser);
      ta.prisma.user.update.mockResolvedValue({ ...mockUser, bio: 'Passionné de gastronomie.' });

      const res = await request(ta.app.getHttpServer())
        .patch('/api/auth/me')
        .set('Authorization', `Bearer ${ta.token()}`)
        .send({ bio: 'Passionné de gastronomie.' });

      expect(res.status).toBe(200);
      expect(res.body.bio).toBe('Passionné de gastronomie.');
    });

    it('400 — bio trop longue (> 200 caractères)', async () => {
      const res = await request(ta.app.getHttpServer())
        .patch('/api/auth/me')
        .set('Authorization', `Bearer ${ta.token()}`)
        .send({ bio: 'a'.repeat(201) });

      expect(res.status).toBe(400);
    });

    it('400 — displayName trop court (< 2 caractères)', async () => {
      const res = await request(ta.app.getHttpServer())
        .patch('/api/auth/me')
        .set('Authorization', `Bearer ${ta.token()}`)
        .send({ displayName: 'X' });

      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/auth/logout ─────────────────────────────────────────────────

  describe('POST /api/auth/logout', () => {
    it('204 — révocation du token (idempotent)', async () => {
      ta.prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const res = await request(ta.app.getHttpServer())
        .post('/api/auth/logout')
        .send({ refreshToken: 'some-valid-looking-refresh-token-here' });

      expect(res.status).toBe(204);
    });
  });

  // ── POST /api/auth/me/logout-all ─────────────────────────────────────────

  describe('POST /api/auth/me/logout-all', () => {
    it('401 — sans token', async () => {
      const res = await request(ta.app.getHttpServer()).post('/api/auth/me/logout-all');
      expect(res.status).toBe(401);
    });

    it('204 — révoque tous les refresh tokens de l\'utilisateur', async () => {
      ta.prisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      const res = await request(ta.app.getHttpServer())
        .post('/api/auth/me/logout-all')
        .set('Authorization', `Bearer ${ta.token()}`);

      expect(res.status).toBe(204);
      expect(ta.prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-e2e', revokedAt: null }),
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });
  });
});
