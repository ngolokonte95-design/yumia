/**
 * Charge le passeport + les stats de gamification de l'utilisateur courant.
 * Recharge à chaque montage et expose `reload` (à appeler après une visite).
 * Offline : sert le cache immédiatement et re-fetch en arrière-plan quand en ligne.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth-context';
import {
  getHeatmap,
  getPassport,
  getStats,
  getUniverseBreakdown,
  type Passport,
  type PassportStats,
  type UniverseCount,
} from './passport-api';
import { cacheGet, cacheSet } from './cache';
import { useNetworkStatus } from './useNetworkStatus';

const CACHE_KEY = 'passport:me';
const CACHE_TTL = 10 * 60_000; // 10 min

interface PassportCached {
  stats: PassportStats;
  passport: Passport;
  heatmap: Record<string, number>;
  universeBreakdown: UniverseCount[];
}

interface PassportState {
  stats: PassportStats | null;
  passport: Passport | null;
  heatmap: Record<string, number>;
  universeBreakdown: UniverseCount[];
  loading: boolean;
  error: string | null;
  fromCache: boolean;
  reload: () => void;
}

export function usePassport(): PassportState {
  const { accessToken } = useAuth();
  const { isOnline } = useNetworkStatus();
  const [stats, setStats] = useState<PassportStats | null>(null);
  const [passport, setPassport] = useState<Passport | null>(null);
  const [heatmap, setHeatmap] = useState<Record<string, number>>({});
  const [universeBreakdown, setUniverseBreakdown] = useState<UniverseCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const applySnapshot = (snap: PassportCached) => {
    setStats(snap.stats);
    setPassport(snap.passport);
    setHeatmap(snap.heatmap);
    setUniverseBreakdown(snap.universeBreakdown);
  };

  const fetchFresh = useCallback(async (): Promise<PassportCached> => {
    if (!accessToken) throw new Error('no token');
    const [s, p, h, u] = await Promise.all([
      getStats(accessToken),
      getPassport(accessToken),
      getHeatmap(accessToken),
      getUniverseBreakdown(accessToken),
    ]);
    return { stats: s, passport: p, heatmap: h, universeBreakdown: u };
  }, [accessToken]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);

    // Serve cache immediately
    const cached = await cacheGet<PassportCached>(CACHE_KEY);
    if (cached) {
      applySnapshot(cached.data);
      setFromCache(true);
      setLoading(false);
      if (!isOnline) return;
      try {
        const fresh = await fetchFresh();
        applySnapshot(fresh);
        setFromCache(false);
        void cacheSet(CACHE_KEY, fresh, CACHE_TTL);
      } catch {
        // keep stale — no error shown
      }
      return;
    }

    if (!isOnline) {
      setError('Aucune connexion réseau.');
      setLoading(false);
      return;
    }

    try {
      const fresh = await fetchFresh();
      applySnapshot(fresh);
      setFromCache(false);
      void cacheSet(CACHE_KEY, fresh, CACHE_TTL);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger le passeport.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, fetchFresh, isOnline]);

  useEffect(() => {
    void load();
  }, [load]);

  return { stats, passport, heatmap, universeBreakdown, loading, error, fromCache, reload: () => void load() };
}
