import { useCallback, useEffect, useRef, useState } from 'react';
import { cacheGet, cacheKey, cacheSet } from './cache';
import { getWeatherProvider, type WeatherReport } from './services/weather';

/**
 * Rapport météo complet pour un point donné, avec cache « stale-while-revalidate ».
 *
 * L'écran ne fait jamais d'appel réseau lui-même : il consomme ce hook, qui
 * délègue au fournisseur configuré. C'est la frontière entre l'UI et les
 * services.
 */

/** Fraîcheur : au-delà, on rafraîchit en tâche de fond. */
const TTL = 15 * 60_000;

export interface WeatherReportState {
  report: WeatherReport | null;
  loading: boolean;
  /** Vrai pendant un rafraîchissement manuel (tirer pour recharger). */
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useWeatherReport(lat?: number, lng?: number): WeatherReportState {
  const [report, setReport] = useState<WeatherReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Annule la requête en vol si les coordonnées changent ou si l'écran se
  // démonte — sinon une réponse tardive écraserait une donnée plus récente.
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (opts: { silent: boolean }) => {
    if (lat === undefined || lng === undefined || (!lat && !lng)) return;

    const ck = cacheKey('weather-report', { lat: lat.toFixed(2), lng: lng.toFixed(2) });

    if (!opts.silent) {
      const cached = await cacheGet<WeatherReport>(ck);
      if (cached) {
        setReport(cached.data);
        setLoading(false);
        // Donnée fraîche : inutile de rappeler le réseau.
        if (!cached.stale) return;
      }
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const fresh = await getWeatherProvider().fetchReport({ lat, lng }, controller.signal);
      if (controller.signal.aborted) return;
      setReport(fresh);
      setError(null);
      void cacheSet(ck, fresh, TTL);
    } catch (err) {
      if (controller.signal.aborted) return;
      // On garde la donnée en cache affichée : un écran météo figé vaut mieux
      // qu'un écran vide.
      setError(err instanceof Error ? err.message : 'Météo indisponible');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [lat, lng]);

  useEffect(() => {
    void load({ silent: false });
    return () => abortRef.current?.abort();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load({ silent: true });
  }, [load]);

  return { report, loading, refreshing, error, refresh };
}
