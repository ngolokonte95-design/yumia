import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchNearby, type NearbyPlace } from './places-api';
import type { Universe } from '@yumia/shared';
import { cacheDel, cacheGet, cacheKey, cacheSet } from './cache';
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
  const { lat, lng, universe, radius = 10000, limit = 30, enabled = true } = params;
  const { isOnline } = useNetworkStatus();
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState(universe !== null);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  /** Clé de la dernière recherche TERMINÉE (avec ou sans résultat). */
  const [settledKey, setSettledKey] = useState<string | null>(null);
  /** Numéro de la recherche en cours : une réponse tardive d'une recherche dépassée est ignorée. */
  const runRef = useRef(0);

  const ck = cacheKey('nearby-universe', {
    lat: lat.toFixed(3),
    lng: lng.toFixed(3),
    universe: universe ?? 'none',
    r: String(radius),
    l: String(limit),
  });

  const load = useCallback(async () => {
    if (!universe) return;
    const run = ++runRef.current;
    const current = () => run === runRef.current;
    setLoading(true);
    setError(null);

    const cached = await cacheGet<NearbyPlace[]>(ck);
    if (!current()) return;
    // Une liste VIDE gardée en mémoire n'est pas une réponse : l'afficher
    // disait « Aucun lieu » pendant que le serveur, lui, en renvoyait
    // (24/11/2026). On ne montre le cache que s'il contient des lieux.
    const hasCached = cached !== null && cached.data.length > 0;
    if (hasCached) {
      setPlaces(cached.data);
      setFromCache(true);
      setLoading(false);
      setSettledKey(ck);
    }

    if (!isOnline) {
      if (!hasCached) {
        setError('Aucune connexion réseau.');
        setLoading(false);
        setSettledKey(ck);
      }
      return;
    }

    try {
      const fresh = await fetchNearby({ lat, lng, radius, universe, limit });
      if (!current()) return;
      setPlaces(fresh);
      setFromCache(false);
      // Un résultat vide n'est jamais mis en cache (voir plus haut).
      if (fresh.length > 0) void cacheSet(ck, fresh, CACHE_TTL);
      else void cacheDel(ck);
    } catch (err) {
      if (!current()) return;
      // Des lieux déjà affichés (cache) restent à l'écran ; sinon on dit la
      // panne, avec « Réessayer », plutôt qu'un faux « Aucun lieu ».
      if (!hasCached) setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      if (current()) {
        setLoading(false);
        setSettledKey(ck);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, universe, radius, limit, ck, isOnline]);

  useEffect(() => {
    // Désactivé = PAS en cours de chargement. Sans ce `setLoading(false)`,
    // l'état initial `true` ne redescendait jamais tant que le hook restait
    // désactivé (quota épuisé) : la carte affichait ses lieux avec un
    // indicateur qui tournait indéfiniment au-dessus.
    if (!enabled) { setLoading(false); return; }
    void load();
  }, [load, enabled]);

  // Activé mais recherche pas encore aboutie pour CES paramètres : c'est du
  // chargement, même pendant l'instant où l'effet n'a pas encore démarré.
  const pending = enabled && universe !== null && settledKey !== ck;

  return { places, loading: loading || pending, error, fromCache, reload: () => void load() };
}
