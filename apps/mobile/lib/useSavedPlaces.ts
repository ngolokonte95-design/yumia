import { useCallback, useEffect, useState } from 'react';
import { request } from './api';
import type { Universe } from './auth-api';

export interface SavedPlace {
  id: string;
  createdAt: string;
  listName: string;
  place: {
    id: string;
    name: string;
    universe: string;
    city: string | null;
    countryCode: string;
    rating: number;
    priceTier: number;
    tags: string[];
  };
}

export function useSavedPlaces(token: string | null) {
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await request<SavedPlace[]>('/passport/saved', { token });
      setPlaces(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function remove(placeId: string) {
    setPlaces((prev) => prev.filter((p) => p.place.id !== placeId));
    await request('/passport/saved/' + placeId, { method: 'DELETE', token: token ?? undefined });
  }

  return { places, loading, error, reload: load, remove };
}
