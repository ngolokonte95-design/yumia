import request = require('supertest');
import { createTestApp, type TestApp } from './helpers/app.helper';

const RC_PAYLOAD = (type: string, userId = 'user-e2e') => ({
  event: { type, app_user_id: userId, product_id: 'yumia_plus_monthly' },
});

describe('Webhooks (e2e)', () => {
  let ta: TestApp;

  beforeAll(async () => { ta = await createTestApp(); });
  afterAll(async () => { await ta.app.close(); });

  beforeEach(() => {
    jest.clearAllMocks();
    // Par défaut update ne fait rien — on override par test si besoin
    ta.prisma.user.update.mockResolvedValue({});
  });

  describe('POST /api/webhooks/revenuecat', () => {
    it('200 — INITIAL_PURCHASE met le plan à "plus"', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/webhooks/revenuecat')
        .send(RC_PAYLOAD('INITIAL_PURCHASE'));

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(ta.prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-e2e' },
        data: { plan: 'plus' },
      });
    });

    it('200 — RENEWAL met le plan à "plus"', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/webhooks/revenuecat')
        .send(RC_PAYLOAD('RENEWAL'));

      expect(res.status).toBe(200);
      expect(ta.prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { plan: 'plus' } }),
      );
    });

    it('200 — EXPIRATION remet le plan à "free"', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/webhooks/revenuecat')
        .send(RC_PAYLOAD('EXPIRATION'));

      expect(res.status).toBe(200);
      expect(ta.prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { plan: 'free' } }),
      );
    });

    it('200 — CANCELLATION remet le plan à "free"', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/webhooks/revenuecat')
        .send(RC_PAYLOAD('CANCELLATION'));

      expect(res.status).toBe(200);
      expect(ta.prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { plan: 'free' } }),
      );
    });

    it('200 — événement inconnu n\'appelle pas update', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/webhooks/revenuecat')
        .send(RC_PAYLOAD('TRANSFER'));

      expect(res.status).toBe(200);
      expect(ta.prisma.user.update).not.toHaveBeenCalled();
    });

    it('200 — payload sans event est ignoré gracieusement', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/webhooks/revenuecat')
        .send({ unrelated: true });

      expect(res.status).toBe(200);
      expect(ta.prisma.user.update).not.toHaveBeenCalled();
    });

    it('401 — token invalide quand REVENUECAT_WEBHOOK_SECRET est défini', async () => {
      const had = 'REVENUECAT_WEBHOOK_SECRET' in process.env;
      process.env.REVENUECAT_WEBHOOK_SECRET = 'super-secret';

      const res = await request(ta.app.getHttpServer())
        .post('/api/webhooks/revenuecat')
        .set('Authorization', 'Bearer mauvais-token')
        .send(RC_PAYLOAD('INITIAL_PURCHASE'));

      expect(res.status).toBe(401);

      if (had) process.env.REVENUECAT_WEBHOOK_SECRET = 'super-secret';
      else delete process.env.REVENUECAT_WEBHOOK_SECRET;
    });

    it('200 — bon token accepté quand REVENUECAT_WEBHOOK_SECRET est défini', async () => {
      const had = 'REVENUECAT_WEBHOOK_SECRET' in process.env;
      process.env.REVENUECAT_WEBHOOK_SECRET = 'super-secret';

      const res = await request(ta.app.getHttpServer())
        .post('/api/webhooks/revenuecat')
        .set('Authorization', 'Bearer super-secret')
        .send(RC_PAYLOAD('INITIAL_PURCHASE'));

      expect(res.status).toBe(200);

      if (had) process.env.REVENUECAT_WEBHOOK_SECRET = 'super-secret';
      else delete process.env.REVENUECAT_WEBHOOK_SECRET;
    });

    it('400 — payload non-objet rejeté', async () => {
      const res = await request(ta.app.getHttpServer())
        .post('/api/webhooks/revenuecat')
        .set('Content-Type', 'application/json')
        .send('"juste une chaine"');

      expect(res.status).toBe(400);
    });

    it('utilise original_app_user_id si app_user_id absent', async () => {
      const payload = {
        event: { type: 'RENEWAL', original_app_user_id: 'fallback-user' },
      };

      const res = await request(ta.app.getHttpServer())
        .post('/api/webhooks/revenuecat')
        .send(payload);

      expect(res.status).toBe(200);
      expect(ta.prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'fallback-user' },
        data: { plan: 'plus' },
      });
    });
  });
});
