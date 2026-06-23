/**
 * État global des lieux sauvegardés.
 * Charge les IDs depuis le cache AsyncStorage au montage (≤1 ms), revalide en arrière-plan.
 * Expose save/unsave avec mise à jour optimiste + rollback sur erreur.
 * La gate freemium (50 lieux max) est vérifiée côté API — l'erreur remonte ici.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSavedIdsRequest, savePlaceRequest, unsavePlaceRequest } from './saved-api';
import { ApiError } from './api';
import { cacheGet, cacheSet, cacheDel } from './cache';

const CACHE_KEY = 'saved:ids';
const CACHE_TTL = 30 * 60_000; // 30 min

interface SavedState {
  savedIds: Set<string>;
  loading: boolean;
  save: (placeId: string) => Promise<void>;
  unsave: (placeId: string) => Promise<void>;
  /** Non-null quand la limite freemium est atteinte. */
  limitError: string | null;
  clearLimitError: () => void;
}

export function useSaved(accessToken: string | null): SavedState {
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [limitError, setLimitError] = useState<string | null>(null);
  const revalidating = useRef(false);

  useEffect(() => {
    if (!accessToken) return;
    const token = accessToken; // narrowing : garantit string dans la closure async
    let cancelled = false;

    async function load() {
      // 1. Sert le cache immédiatement si disponible
      const cached = await cacheGet<string[]>(CACHE_KEY);
      if (cached && !cancelled) {
        setSavedIds(new Set(cached.data));
        if (!cached.stale) return; // encore frais — pas besoin de revalider
      }

      // 2. Revalide depuis le réseau (évite les doubles requêtes)
      if (revalidating.current) return;
      revalidating.current = true;
      if (!cached) setLoading(true);

      try {
        const ids = await getSavedIdsRequest(token);
        if (!cancelled) {
          setSavedIds(new Set(ids));
          void cacheSet(CACHE_KEY, ids, CACHE_TTL);
        }
      } catch {
        // erreur silencieuse — le cache est suffisant
      } finally {
        if (!cancelled) setLoading(false);
        revalidating.current = false;
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [accessToken]);

  const save = useCallback(
    async (placeId: string) => {
      if (!accessToken) return;
      setSavedIds((prev) => new Set([...prev, placeId])); // optimiste
      try {
        await savePlaceRequest(accessToken, placeId);
        // Invalide le cache pour forcer la revalidation au prochain montage
        void cacheDel(CACHE_KEY);
      } catch (err) {
        setSavedIds((prev) => {
          const next = new Set(prev);
          next.delete(placeId);
          return next;
        });
        if (err instanceof ApiError && err.status === 403) {
          setLimitError(err.message);
        }
      }
    },
    [accessToken],
  );

  const unsave = useCallback(
    async (placeId: string) => {
      if (!accessToken) return;
      setSavedIds((prev) => {
        const next = new Set(prev);
        next.delete(placeId);
        return next;
      }); // optimiste
      try {
        await unsavePlaceRequest(accessToken, placeId);
        void cacheDel(CACHE_KEY);
      } catch {
        setSavedIds((prev) => new Set([...prev, placeId])); // rollback
      }
    },
    [accessToken],
  );

  return { savedIds, loading, save, unsave, limitError, clearLimitError: () => setLimitError(null) };
}
