import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis.service';

// ── Mock ioredis client ───────────────────────────────────────────────────────

function makeClient() {
  return {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue('OK'),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RedisService', () => {
  let service: RedisService;
  let client: ReturnType<typeof makeClient>;

  beforeEach(() => {
    const config = { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService;
    service = new RedisService(config);
    client = makeClient();
    // Injecte directement le client mock (évite la vraie connexion réseau de onModuleInit)
    (service as unknown as { client: typeof client }).client = client;
  });

  // ── getJson ──────────────────────────────────────────────────────────────────

  describe('getJson', () => {
    it('parse et retourne la valeur JSON quand la clé existe', async () => {
      client.get.mockResolvedValue('{"a":1,"b":"x"}');

      const result = await service.getJson<{ a: number; b: string }>('key');

      expect(result).toEqual({ a: 1, b: 'x' });
      expect(client.get).toHaveBeenCalledWith('key');
    });

    it('retourne null en cas de cache miss', async () => {
      client.get.mockResolvedValue(null);

      const result = await service.getJson('absent');

      expect(result).toBeNull();
    });
  });

  // ── setJson ──────────────────────────────────────────────────────────────────

  describe('setJson', () => {
    it('sérialise et stocke avec TTL quand ttlSeconds est fourni', async () => {
      await service.setJson('key', { v: 42 }, 300);

      expect(client.set).toHaveBeenCalledWith('key', '{"v":42}', 'EX', 300);
    });

    it('stocke sans expiration quand ttlSeconds est absent', async () => {
      await service.setJson('key', { v: 42 });

      expect(client.set).toHaveBeenCalledWith('key', '{"v":42}');
    });
  });

  // ── del ──────────────────────────────────────────────────────────────────────

  describe('del', () => {
    it('supprime les clés fournies', async () => {
      client.del.mockResolvedValue(2);

      const count = await service.del('a', 'b');

      expect(count).toBe(2);
      expect(client.del).toHaveBeenCalledWith('a', 'b');
    });

    it('court-circuite (retourne 0) sans appel quand aucune clé', async () => {
      const count = await service.del();

      expect(count).toBe(0);
      expect(client.del).not.toHaveBeenCalled();
    });
  });

  // ── ping ─────────────────────────────────────────────────────────────────────

  describe('ping', () => {
    it('retourne true quand Redis répond PONG', async () => {
      client.ping.mockResolvedValue('PONG');

      expect(await service.ping()).toBe(true);
    });

    it('retourne false quand la réponse n\'est pas PONG', async () => {
      client.ping.mockResolvedValue('WEIRD');

      expect(await service.ping()).toBe(false);
    });

    it('retourne false (ne lève pas) quand le ping échoue', async () => {
      client.ping.mockRejectedValue(new Error('connection refused'));

      expect(await service.ping()).toBe(false);
    });
  });

  // ── onModuleDestroy ──────────────────────────────────────────────────────────

  it('ferme proprement la connexion à la destruction du module', async () => {
    await service.onModuleDestroy();

    expect(client.quit).toHaveBeenCalledTimes(1);
  });
});
