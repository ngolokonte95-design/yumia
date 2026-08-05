/**
 * Météo légère pour la recommandation contextuelle (explorer, for-you).
 *
 * Ne renvoie que température + condition : c'est tout ce dont le moteur de
 * reco a besoin. Pour l'écran météo complet, utiliser `useWeatherReport`.
 *
 * Délègue à `useWeatherReport` plutôt que de refaire son propre appel : les
 * deux tapaient la même source avec deux caches distincts, donc deux
 * requêtes réseau quand plusieurs onglets étaient montés en même temps.
 */
import { useMemo } from 'react';
import { useWeatherReport } from './useWeatherReport';
import type { WeatherKind } from './services/weather';

export interface WeatherContext {
  tempC: number;
  /**
   * Condition en anglais, conservée telle quelle : le moteur de reco et les
   * prompts IA existants s'appuient sur ce vocabulaire.
   */
  condition: string;
}

/** Vocabulaire normalisé → libellés attendus par le moteur de recommandation. */
const CONDITION_LABEL: Record<WeatherKind, string> = {
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
  const { report } = useWeatherReport(lat, lng);

  return useMemo(() => {
    if (!report) return null;
    return {
      tempC: report.current.tempC,
      condition: CONDITION_LABEL[report.current.kind] ?? 'clear',
    };
  }, [report]);
}
