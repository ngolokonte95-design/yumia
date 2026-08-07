import { useEffect, useRef, useState } from 'react';
import { searchCities, type CitySuggestion } from './services/weather';

/** Laisse l'utilisateur finir de taper avant d'interroger le réseau. */
const DEBOUNCE_MS = 350;

/**
 * Recherche de ville en direct (autocomplete), avec anti-rebond et annulation
 * de la requête précédente si l'utilisateur continue à taper.
 */
export function useCitySearch(query: string) {
  const [results, setResults] = useState<CitySuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();

    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    timerRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      searchCities(q, controller.signal)
        .then((cities) => { if (!controller.signal.aborted) setResults(cities); })
        .catch(() => { if (!controller.signal.aborted) setResults([]); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, DEBOUNCE_MS);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  return { results, loading };
}
