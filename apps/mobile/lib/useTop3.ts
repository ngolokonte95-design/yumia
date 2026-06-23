/**
 * Hook de chargement du Top 3 : gère états chargement / erreur / données et
 * expose un `refetch`. Offline : sert le cache immédiatement, re-fetch en fond quand en ligne.
 */
import { useCallback, useEffect, useState } from 'react';
import { fetchTop3, type Top3Params, type Top3Response } from './api';
import { useAuth } from './auth-context';
import { cacheGet, cacheKey, cacheSet } from './cache';
import { useNetworkStatus } from './useNetworkStatus';

const CACHE_TTL = 5 * 60_000; // 5 min

interface Top3State {
  data: Top3Response | null;
  loading: boolean;
  error: string | null;
  fromCache: boolean;
  refetch: () => void;
}

export function useTop3(params: Top3Params, enabled = true): Top3State {
  const { accessToken } = useAuth();
  const { isOnline } = useNetworkStatus();
  const [data, setData] = useState<Top3Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const key = JSON.stringify(params);
  const ck = cacheKey('top3', params as unknown as Record<string, unknown>);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Serve cache immediately
    const cached = await cacheGet<Top3Response>(ck);
    if (cached) {
      setData(cached.data);
      setFromCache(true);
      setLoading(false);
      if (!isOnline) return;
      // Revalidate silently
      try {
        const fresh = await fetchTop3(params, accessToken ?? undefined);
        setData(fresh);
        setFromCache(false);
        void cacheSet(ck, fresh, CACHE_TTL);
      } catch {
        // keep stale data — no error shown
      }
      return;
    }

    if (!isOnline) {
      setError('Aucune connexion réseau.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetchTop3(params, accessToken ?? undefined);
      setData(res);
      setFromCache(false);
      void cacheSet(ck, res, CACHE_TTL);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ck, isOnline]);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [load, enabled]);

  return { data, loading, error, fromCache, refetch: () => void load() };
}
