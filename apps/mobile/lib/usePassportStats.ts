import { useEffect, useState } from 'react';
import { request } from './api';
import { cacheGet, cacheSet } from './cache';
import { useNetworkStatus } from './useNetworkStatus';

export interface LevelDef {
  xpRequired: number;
  titleFr: string;
  emoji: string;
  value: number;
}

export interface PassportStats {
  totalXp: number;
  level: {
    current: LevelDef;
    next: LevelDef | null;
    xpIntoLevel: number;
    xpForNext: number;
    ratio: number;
  };
  streak: { current: number; best: number; lastActivityDay: string | null };
  badges: { earned: string[]; total: number };
}

export type { LevelDef as PassportLevelDef };

export interface PassportVisit {
  id: string;
  visitedAt: string;
  xpAwarded: number;
  place: {
    id: string;
    name: string;
    universe: string;
    city: string | null;
    countryCode: string;
    rating: number;
  };
}

export interface PassportData {
  totalVisits: number;
  distinctCountries: number;
  distinctUniverses: number;
  visits: PassportVisit[];
}

interface PassportStatsState {
  stats: PassportStats | null;
  passport: PassportData | null;
  loading: boolean;
  fromCache: boolean;
}

interface CachedPayload {
  stats: PassportStats;
  passport: PassportData;
}

const CACHE_KEY = 'passport-stats:me';
const CACHE_TTL = 10 * 60_000; // 10 min

export function usePassportStats(token: string | null): PassportStatsState {
  const { isOnline } = useNetworkStatus();
  const [stats, setStats] = useState<PassportStats | null>(null);
  const [passport, setPassport] = useState<PassportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);

      // Serve cache immediately
      const cached = await cacheGet<CachedPayload>(CACHE_KEY);
      if (cached && !cancelled) {
        setStats(cached.data.stats);
        setPassport(cached.data.passport);
        setFromCache(true);
        setLoading(false);
        if (!isOnline) return;
        // Revalidate silently
        try {
          const [s, p] = await Promise.all([
            request<PassportStats>('/passport/stats', { token }),
            request<PassportData>('/passport', { token }),
          ]);
          if (!cancelled) {
            setStats(s);
            setPassport(p);
            setFromCache(false);
            void cacheSet(CACHE_KEY, { stats: s, passport: p }, CACHE_TTL);
          }
        } catch {
          // keep stale data
        }
        return;
      }

      if (!isOnline) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const [s, p] = await Promise.all([
          request<PassportStats>('/passport/stats', { token }),
          request<PassportData>('/passport', { token }),
        ]);
        if (!cancelled) {
          setStats(s);
          setPassport(p);
          setFromCache(false);
          void cacheSet(CACHE_KEY, { stats: s, passport: p }, CACHE_TTL);
        }
      } catch {
        // silently ignore — caller shows skeleton
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [token, isOnline]);

  return { stats, passport, loading, fromCache };
}
