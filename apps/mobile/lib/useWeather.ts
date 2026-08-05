/**
 * Météo légère pour la recommandation contextuelle (accueil, explorer, for-you).
 *
 * Ne renvoie que température + condition : c'est tout ce dont le moteur de
 * reco a besoin. Pour l'écran météo complet, utiliser `useWeatherReport`.
 *
 * Passe par la même couche Services que le reste de l'application — changer de
 * fournisseur météo se répercute donc ici automatiquement.
 */
import { useEffect, useState } from 'react';
import { cacheGet, cacheKey, cacheSet } from './cache';
import { getWeatherProvider } from './services/weather';

export interface WeatherContext {
  tempC: number;
  /**
   * Condition en anglais, conservée telle quelle : le moteur de reco et les
   * prompts IA existants s'appuient sur ce vocabulaire.
   */
  condition: string;
}

const CACHE_TTL = 15 * 60_000;

/** Vocabulaire normalisé → libellés attendus par le moteur de recommandation. */
const CONDITION_LABEL: Record<string, string> = {
  clear: 'clear',
  partly_cloudy: 'partly cloudy',
  cloudy: 'overcast',
  fog: 'fog',
  drizzle: 'drizzle',
  rain: 'rain',
  heavy_rain: 'heavy rain',
  snow: 'snow',
  thunderstorm: 'thunderstorm',
};

export function useWeather(lat: number, lng: number): WeatherContext | null {
  const [weather, setWeather] = useState<WeatherContext | null>(null);

  useEffect(() => {
    if (!lat || !lng) return;
    let cancelled = false;

    const ck = cacheKey('weather', { lat: lat.toFixed(2), lng: lng.toFixed(2) });

    (async () => {
      const cached = await cacheGet<WeatherContext>(ck);
      if (cached && !cancelled) {
        setWeather(cached.data);
        if (!cached.stale) return;
      }

      try {
        const report = await getWeatherProvider().fetchReport({ lat, lng });
        if (cancelled) return;
        const result: WeatherContext = {
          tempC: report.current.tempC,
          condition: CONDITION_LABEL[report.current.kind] ?? 'clear',
        };
        setWeather(result);
        void cacheSet(ck, result, CACHE_TTL);
      } catch {
        // best-effort — la météo n'est qu'un signal d'appoint pour la reco.
      }
    })();

    return () => { cancelled = true; };
  }, [lat, lng]);

  return weather;
}
