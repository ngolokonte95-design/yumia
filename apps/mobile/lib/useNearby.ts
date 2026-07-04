/**
 * Charge les lieux proches d'un point, avec filtre d'univers optionnel.
 * Offline : sert le cache immédiatement, re-fetch en arrière-plan si en ligne.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Universe } from '@yumia/shared';
import { fetchNearby, type NearbyPlace } from './places-api';
import { cacheGet, cacheKey, cacheSet } from './cache';
import { useNetworkStatus } from './useNetworkStatus';

const CACHE_TTL = 5 * 60_000; // 5 min

interface NearbyState {
  places: NearbyPlace[];
  loading: boolean;
  error: string | null;
  fromCache: boolean;
  reload: () => void;
}

export function useNearby(params: {
  lat: number;
  lng: number;
  radius?: number;
  universe?: Universe;
  enabled?: boolean;
}): NearbyState {
  const { lat, lng, radius, universe, enabled = true } = params;
  const { isOnline } = useNetworkStatus();
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const ck = cacheKey('nearby', {
    lat: lat.toFixed(3),
    lng: lng.toFixed(3),
    r: String(radius ?? 2000),
    u: universe ?? '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const cached = await cacheGet<NearbyPlace[]>(ck);
    if (cached) {
      setPlaces(cached.data);
      setFromCache(true);
      setLoading(false);
      if (!isOnline) return;
      // Revalidate silently in background
      try {
        const fresh = await fetchNearby({ lat, lng, radius, universe, limit: 85 });
        setPlaces(fresh);
        setFromCache(false);
        void cacheSet(ck, fresh, CACHE_TTL);
      } catch {
        // keep stale data
      }
      return;
    }

    if (!isOnline) {
      setError('Aucune connexion réseau.');
      setLoading(false);
      return;
    }

    try {
      const result = await fetchNearby({ lat, lng, radius, universe, limit: 85 });
      setPlaces(result);
      setFromCache(false);
      void cacheSet(ck, result, CACHE_TTL);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les lieux.');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, radius, universe, ck, isOnline]);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [load, enabled]);

  return { places, loading, error, fromCache, reload: () => void load() };
}
