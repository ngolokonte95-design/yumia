import { useCallback, useEffect, useState } from 'react';
import { fetchNearby, type NearbyPlace } from './places-api';
import type { Universe } from '@yumia/shared';
import { cacheGet, cacheKey, cacheSet } from './cache';
import { useNetworkStatus } from './useNetworkStatus';

const CACHE_TTL = 5 * 60_000;

export function useNearbyUniverse(params: {
  lat: number;
  lng: number;
  universe: Universe | null;
  radius?: number;
  limit?: number;
  /** Tant que `false`, on ne charge pas (ex. position pas encore résolue). */
  enabled?: boolean;
}) {
  const { lat, lng, universe, radius = 5000, limit = 30, enabled = true } = params;
  const { isOnline } = useNetworkStatus();
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState(universe !== null);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const ck = cacheKey('nearby-universe', {
    lat: lat.toFixed(3),
    lng: lng.toFixed(3),
    universe: universe ?? 'none',
    r: String(radius),
  });

  const load = useCallback(async () => {
    if (!universe) return;
    setLoading(true);
    setError(null);

    const cached = await cacheGet<NearbyPlace[]>(ck);
    if (cached) {
      setPlaces(cached.data);
      setFromCache(true);
      setLoading(false);
      if (!isOnline) return;
      try {
        const fresh = await fetchNearby({ lat, lng, radius, universe, limit });
        setPlaces(fresh);
        setFromCache(false);
        void cacheSet(ck, fresh, CACHE_TTL);
      } catch {
        // keep stale
      }
      return;
    }

    if (!isOnline) {
      setError('Aucune connexion réseau.');
      setLoading(false);
      return;
    }

    try {
      const data = await fetchNearby({ lat, lng, radius, universe, limit });
      setPlaces(data);
      setFromCache(false);
      void cacheSet(ck, data, CACHE_TTL);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, universe, radius, limit, ck, isOnline]);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [load, enabled]);

  return { places, loading, error, fromCache, reload: () => void load() };
}
