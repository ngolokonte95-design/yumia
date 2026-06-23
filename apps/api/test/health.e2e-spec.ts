import request = require('supertest');
import { createTestApp, type TestApp } from './helpers/app.helper';

describe('Health (e2e)', () => {
  let ta: TestApp;

  beforeAll(async () => { ta = await createTestApp(); });
  afterAll(async () => { await ta.app.close(); });

  describe('GET /api/health', () => {
    it('200 — readiness : retourne les 3 checks', async () => {
      const res = await request(ta.app.getHttpServer()).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.service).toBe('yumia-api');
      expect(['ok', 'degraded']).toContain(res.body.status);
      expect(res.body.checks).toHaveProperty('postgres');
      expect(res.body.checks).toHaveProperty('redis');
      expect(res.body.checks).toHaveProperty('elasticsearch');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('GET /api/health/live', () => {
    it('200 — liveness : toujours actif même si les dépendances sont indisponibles', async () => {
      const res = await request(ta.app.getHttpServer()).get('/api/health/live');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('alive');
      expect(res.body.service).toBe('yumia-api');
      expect(res.body.timestamp).toBeDefined();
    });
  });
});
