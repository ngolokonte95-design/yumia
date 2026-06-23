import { useEffect, useState } from 'react';
import { fetchPlaceStats, type PlaceStats } from './places-api';

export function usePlaceStats(placeId: string) {
  const [stats, setStats] = useState<PlaceStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPlaceStats(placeId)
      .then((s) => { if (!cancelled) setStats(s); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [placeId]);

  return { stats, loading };
}
