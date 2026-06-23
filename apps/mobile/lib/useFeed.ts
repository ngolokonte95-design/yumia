/**
 * Charge le flux For You (mood-aware) pour une position donnée.
 * Supporte le chargement supplémentaire (loadMore) pour un feed infini.
 * Offline : sert le cache immédiatement et re-fetch en arrière-plan quand en ligne.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Mood, Suggestion } from '@yumia/shared';
import { fetchFeed } from './api';
import type { Universe } from './auth-api';
import { useAuth } from './auth-context';
import { cacheGet, cacheKey, cacheSet } from './cache';
import { useNetworkStatus } from './useNetworkStatus';

const CACHE_TTL = 5 * 60_000; // 5 min

interface FeedResult { suggestions: Suggestion[]; reason: string | null }

interface FeedState {
  suggestions: Suggestion[];
  reason: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  fromCache: boolean;
  reload: () => void;
  loadMore: () => void;
}

export function useFeed(params: {
  lat: number;
  lng: number;
  mood?: Mood;
  enabled?: boolean;
  favoriteUniverses?: Universe[];
  restrictions?: string[];
  weather?: { tempC: number; condition: string };
}): FeedState {
  const { lat, lng, mood, enabled = true, favoriteUniverses, restrictions, weather } = params;
  const { accessToken } = useAuth();
  const { isOnline } = useNetworkStatus();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const seenIds = useRef(new Set<string>());

  const ck = cacheKey('feed', { lat: lat.toFixed(3), lng: lng.toFixed(3), mood: mood ?? '' });

  const fetchPage = useCallback(async (append = false) => {
    try {
      const res = await fetchFeed({ lat, lng, mood, limit: 20, favoriteUniverses, restrictions, weather }, accessToken ?? undefined);
      const fresh = res.suggestions.filter((s) => !seenIds.current.has(s.place.id));
      fresh.forEach((s) => seenIds.current.add(s.place.id));
      setSuggestions((prev) => append ? [...prev, ...fresh] : fresh);
      setReason(res.reason);
      setFromCache(false);
      if (!append) {
        void cacheSet<FeedResult>(ck, { suggestions: res.suggestions, reason: res.reason }, CACHE_TTL);
      }
    } catch (err) {
      if (!append) setError(err instanceof Error ? err.message : 'Impossible de charger le flux.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, mood, JSON.stringify(favoriteUniverses), JSON.stringify(restrictions), weather?.condition, ck]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    seenIds.current.clear();

    // Serve cache immediately (stale-while-revalidate)
    const cached = await cacheGet<FeedResult>(ck);
    if (cached) {
      setSuggestions(cached.data.suggestions);
      setReason(cached.data.reason);
      cached.data.suggestions.forEach((s) => seenIds.current.add(s.place.id));
      setFromCache(true);
      setLoading(false);
      if (!isOnline) return; // offline — use cache only
      // fetch fresh silently in background
      void fetchPage(false);
      return;
    }

    if (!isOnline) {
      setError('Aucune connexion réseau.');
      setLoading(false);
      return;
    }

    await fetchPage(false);
    setLoading(false);
  }, [fetchPage, ck, isOnline]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !isOnline) return;
    setLoadingMore(true);
    await fetchPage(true);
    setLoadingMore(false);
  }, [fetchPage, loadingMore, isOnline]);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [load, enabled]);

  return { suggestions, reason, loading, loadingMore, error, fromCache, reload: () => void load(), loadMore: () => void loadMore() };
}
