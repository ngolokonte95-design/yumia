/**
 * Lieux tendance près de l'utilisateur (dernières 24h).
 * Cache 3 min stale-while-revalidate — sert le cache immédiatement puis
 * rafraîchit en arrière-plan si on est en ligne.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchTrending, type TrendingPlace } from './places-api';
import { cacheGet, cacheKey, cacheSet } from './cache';
import { useNetworkStatus } from './useNetworkStatus';

interface TrendingState {
  places: TrendingPlace[];
  loading: boolean;
  error: string | null;
  fromCache: boolean;
  reload: () => void;
}

const CACHE_TTL = 3 * 60_000; // 3 min

export function useTrending(params: {
  lat: number;
  lng: number;
  radius?: number;
  limit?: number;
  enabled?: boolean;
}): TrendingState {
  const { lat, lng, radius = 5_000, limit = 8, enabled = true } = params;
  const { isOnline } = useNetworkStatus();
  const [places, setPlaces] = useState<TrendingPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const revalidating = useRef(false);

  const load = useCallback(
    async (force = false) => {
      const ck = cacheKey('trending', {
        lat: lat.toFixed(3),
        lng: lng.toFixed(3),
        r: radius,
        l: limit,
      });

      // Serve from cache immediately
      const cached = await cacheGet<TrendingPlace[]>(ck);
      if (cached && !force) {
        setPlaces(cached.data);
        setFromCache(true);
        setLoading(false);
        setError(null);
        if (!cached.stale || !isOnline || revalidating.current) return;
      }

      if (!isOnline && cached) return;

      revalidating.current = true;
      if (!cached) setLoading(true);
      try {
        const fresh = await fetchTrending({ lat, lng, radius, limit });
        setPlaces(fresh);
        setFromCache(false);
        setError(null);
        void cacheSet(ck, fresh, CACHE_TTL);
      } catch (err) {
        if (!cached) setError(err instanceof Error ? err.message : 'Impossible de charger les tendances.');
      } finally {
        setLoading(false);
        revalidating.current = false;
      }
    },
    [lat, lng, radius, limit, isOnline],
  );

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [load, enabled]);

  return { places, loading, error, fromCache, reload: () => void load(true) };
}
