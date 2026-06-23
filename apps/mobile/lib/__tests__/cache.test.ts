import { cacheSet, cacheGet, cacheDel, cacheKey } from '../cache';

// Accès au helper de reset du stub async-storage.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AsyncStorage = require('../../test/mocks/async-storage').default as { __reset: () => void };

describe('cache', () => {
  beforeEach(() => AsyncStorage.__reset());

  // ── cacheKey (pure) ──────────────────────────────────────────────────────

  describe('cacheKey', () => {
    it('produit une clé stable indépendante de l\'ordre des champs', () => {
      const a = cacheKey('feed', { lat: 1, lng: 2 });
      const b = cacheKey('feed', { lng: 2, lat: 1 });
      expect(a).toBe(b);
    });

    it('ignore les champs null et undefined', () => {
      const a = cacheKey('feed', { lat: 1, lng: 2, mood: undefined, city: null });
      const b = cacheKey('feed', { lat: 1, lng: 2 });
      expect(a).toBe(b);
    });

    it('préfixe la clé', () => {
      expect(cacheKey('top3', { x: 1 })).toMatch(/^top3:/);
    });

    it('distingue des params différents', () => {
      expect(cacheKey('feed', { lat: 1 })).not.toBe(cacheKey('feed', { lat: 2 }));
    });
  });

  // ── round-trip ───────────────────────────────────────────────────────────

  describe('cacheSet / cacheGet', () => {
    it('relit la valeur écrite, non stale dans le TTL', async () => {
      await cacheSet('k', { hello: 'world' }, 60_000);
      const res = await cacheGet<{ hello: string }>('k');

      expect(res).not.toBeNull();
      expect(res!.data).toEqual({ hello: 'world' });
      expect(res!.stale).toBe(false);
    });

    it('retourne null pour une clé absente', async () => {
      expect(await cacheGet('absent')).toBeNull();
    });

    it('marque l\'entrée comme stale une fois le TTL dépassé', async () => {
      await cacheSet('k', { v: 1 }, -1); // expire immédiatement (expiresAt dans le passé)
      const res = await cacheGet<{ v: number }>('k');

      expect(res).not.toBeNull();
      expect(res!.data).toEqual({ v: 1 });
      expect(res!.stale).toBe(true);
    });

    it('retourne null si le contenu stocké est corrompu (JSON invalide)', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const store = require('../../test/mocks/async-storage').default;
      await store.setItem('@yumia/cache/bad', '{not json');

      expect(await cacheGet('bad')).toBeNull();
    });
  });

  // ── cacheDel ─────────────────────────────────────────────────────────────

  describe('cacheDel', () => {
    it('supprime une entrée existante', async () => {
      await cacheSet('k', { v: 1 }, 60_000);
      await cacheDel('k');
      expect(await cacheGet('k')).toBeNull();
    });
  });
});
