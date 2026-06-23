import { useCallback, useEffect, useState } from 'react';
import { fetchExperience, type ExperienceResult, type ExperienceParams } from './api';
import { useAuth } from './auth-context';

interface ExperienceState {
  data: ExperienceResult | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useExperience(params: ExperienceParams, enabled = true): ExperienceState {
  const { accessToken } = useAuth();
  const [data, setData] = useState<ExperienceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const key = JSON.stringify(params);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchExperience(params, accessToken ?? undefined);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de générer l\'itinéraire.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [load, enabled]);

  return { data, loading, error, refetch: () => void load() };
}
