/**
 * Météo locale via Open-Meteo (gratuit, sans clé API).
 * Retourne la température et le code WMO de condition.
 * Cache 15 min pour éviter les appels répétés au démarrage.
 * https://open-meteo.com/en/docs
 */
import { useEffect, useState } from 'react';
import { cacheGet, cacheKey, cacheSet } from './cache';

export interface WeatherContext {
  tempC: number;
  condition: string;
}

const WMO: Record<number, string> = {
  0: 'clear',
  1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'fog', 48: 'fog',
  51: 'drizzle', 53: 'drizzle', 55: 'drizzle',
  61: 'rain', 63: 'rain', 65: 'heavy rain',
  71: 'snow', 73: 'snow', 75: 'heavy snow',
  80: 'showers', 81: 'showers', 82: 'heavy showers',
  95: 'thunderstorm', 96: 'thunderstorm', 99: 'thunderstorm',
};

const CACHE_TTL = 15 * 60_000; // 15 min

export function useWeather(lat: number, lng: number): WeatherContext | null {
  const [weather, setWeather] = useState<WeatherContext | null>(null);

  useEffect(() => {
    if (!lat || !lng) return;
    let cancelled = false;

    const ck = cacheKey('weather', { lat: lat.toFixed(2), lng: lng.toFixed(2) });

    (async () => {
      // Serve from cache immediately if fresh
      const cached = await cacheGet<WeatherContext>(ck);
      if (cached && !cancelled) {
        setWeather(cached.data);
        return;
      }

      try {
        const r = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
          `&current=temperature_2m,weathercode&timezone=auto`,
        );
        const data = await r.json() as { current?: { temperature_2m?: number; weathercode?: number } };
        if (cancelled) return;
        const tempC: number = data?.current?.temperature_2m ?? 20;
        const code: number = data?.current?.weathercode ?? 0;
        const result: WeatherContext = { tempC: Math.round(tempC), condition: WMO[code] ?? 'clear' };
        setWeather(result);
        void cacheSet(ck, result, CACHE_TTL);
      } catch {
        // best-effort — weather is optional
      }
    })();

    return () => { cancelled = true; };
  }, [lat, lng]);

  return weather;
}
