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

  // ── stockage plein (Android plafonne AsyncStorage à 6 Mo) ─────────────────

  describe('stockage plein', () => {
    it('vide le cache puis réécrit, sans toucher aux autres clés de l\'app', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const store = require('../../test/mocks/async-storage').default;
      await cacheSet('ancien', { v: 1 }, 60_000);
      await store.setItem('usage:placeLoadsPerDay', '{"pk":"x","count":3}');

      // Tant que le cache contient l'ancienne entrée, l'écriture échoue.
      const realSet = store.setItem;
      store.setItem = async (k: string, v: string) => {
        const keys: string[] = await store.getAllKeys();
        if (keys.includes('@yumia/cache/ancien')) throw new Error('database or disk is full');
        return realSet(k, v);
      };
      try {
        await cacheSet('nouveau', { v: 2 }, 60_000);
      } finally {
        store.setItem = realSet;
      }

      expect(await cacheGet('ancien')).toBeNull();
      expect((await cacheGet<{ v: number }>('nouveau'))!.data).toEqual({ v: 2 });
      expect(await store.getItem('usage:placeLoadsPerDay')).toBe('{"pk":"x","count":3}');
    });

    it('ne lève jamais, même si rien ne peut être écrit', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const store = require('../../test/mocks/async-storage').default;
      const realSet = store.setItem;
      store.setItem = async () => { throw new Error('database or disk is full'); };
      try {
        await expect(cacheSet('k', { v: 1 }, 60_000)).resolves.toBeUndefined();
      } finally {
        store.setItem = realSet;
      }
    });
  });
});
