import { buildAstro } from './astro';
import { kindFromWmoCode } from './wmo';
import { WeatherUnavailableError, type WeatherProvider } from './provider';
import type {
  AirGridPoint, AirQuality, Coordinates, CurrentWeather, DayPoint, HourPoint, WeatherReport,
} from './types';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

/** Nombre de jours de prévision demandés (le maximum utile pour l'écran). */
const FORECAST_DAYS = 10;

// ── Formes brutes renvoyées par l'API ────────────────────────────────────────
// Volontairement locales à ce fichier : rien de tout ça ne doit fuiter vers le
// reste de l'application.

// Toutes les dates sont demandées en `timeformat=unixtime` : on reçoit donc des
// timestamps UTC en secondes, et non des chaînes « 2026-08-05T06:29 » sans
// fuseau. Sans ça, `new Date()` les interpréterait dans le fuseau du téléphone
// et la météo d'une destination lointaine serait décalée de plusieurs heures.
interface RawForecast {
  timezone?: string;
  utc_offset_seconds?: number;
  current?: Record<string, number | undefined>;
  hourly?: Record<string, number[] | undefined>;
  daily?: Record<string, number[] | undefined>;
}

/** Timestamp Unix (secondes) → instant ISO 8601 UTC. */
function isoFromUnix(seconds: unknown): string {
  return typeof seconds === 'number' && Number.isFinite(seconds)
    ? new Date(seconds * 1000).toISOString()
    : '';
}

interface RawAirQuality {
  current?: Record<string, number | undefined>;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Échelle européenne de qualité de l'air (EAQI). */
function airQualityLevel(index: number): AirQuality['level'] {
  if (index <= 20) return 'good';
  if (index <= 40) return 'fair';
  if (index <= 60) return 'moderate';
  if (index <= 80) return 'poor';
  return 'very_poor';
}

/**
 * Fournisseur météo Open-Meteo.
 *
 * Choisi comme implémentation principale : gratuit, sans clé d'API, sans quota
 * bloquant, et il couvre l'intégralité de ce dont l'écran a besoin (horaire,
 * 10 jours, UV, qualité de l'air). Les autres fournisseurs restent branchables
 * via `WeatherProvider` sans rien changer à l'interface.
 */
export class OpenMeteoProvider implements WeatherProvider {
  readonly id = 'open-meteo';
  readonly attribution = 'Open-Meteo';

  async fetchReport(coords: Coordinates, signal?: AbortSignal): Promise<WeatherReport> {
    const { lat, lng } = coords;

    // La qualité de l'air vit sur un autre domaine : on la récupère en
    // parallèle, et son échec ne doit jamais faire tomber la météo elle-même.
    const [forecast, air] = await Promise.all([
      this.fetchForecast(lat, lng, signal),
      this.fetchAirQuality(lat, lng, signal).catch(() => undefined),
    ]);

    const daily = this.mapDaily(forecast);
    if (daily.length === 0) {
      throw new WeatherUnavailableError('Prévisions quotidiennes absentes de la réponse');
    }

    const hourly = this.mapHourly(forecast);
    const astro = buildAstro(daily[0].sunrise, daily[0].sunset, lat);

    return {
      coordinates: coords,
      timezone: forecast.timezone ?? 'UTC',
      utcOffsetSeconds: num(forecast.utc_offset_seconds),
      current: this.mapCurrent(forecast),
      hourly,
      daily,
      astro,
      airQuality: air,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Grille de qualité de l'air en **un seul appel** : Open-Meteo accepte des
   * listes de coordonnées séparées par des virgules et renvoie un tableau de
   * résultats. 25 points coûtent donc une requête, pas 25.
   */
  async fetchAirQualityGrid(
    center: Coordinates, spanDegrees: number, size: number, signal?: AbortSignal,
  ): Promise<AirGridPoint[]> {
    const lats: number[] = [];
    const lngs: number[] = [];
    const step = size > 1 ? (spanDegrees * 2) / (size - 1) : 0;

    for (let i = 0; i < size; i += 1) {
      for (let j = 0; j < size; j += 1) {
        lats.push(center.lat - spanDegrees + step * i);
        lngs.push(center.lng - spanDegrees + step * j);
      }
    }

    const params = new URLSearchParams({
      latitude: lats.map((v) => v.toFixed(3)).join(','),
      longitude: lngs.map((v) => v.toFixed(3)).join(','),
      current: 'european_aqi',
    });

    const res = await fetch(`${AIR_QUALITY_URL}?${params}`, { signal });
    if (!res.ok) throw new WeatherUnavailableError(`Qualité de l'air : HTTP ${res.status}`);

    const data = (await res.json()) as Array<{
      latitude?: number; longitude?: number; current?: { european_aqi?: number };
    }>;
    if (!Array.isArray(data)) return [];

    return data.flatMap((p, i) => {
      const index = p.current?.european_aqi;
      if (typeof index !== 'number') return [];
      return [{
        // Open-Meteo cale les coordonnées sur sa grille : on garde les siennes,
        // qui reflètent l'emplacement réel de la mesure.
        lat: p.latitude ?? lats[i],
        lng: p.longitude ?? lngs[i],
        index,
        level: airQualityLevel(index),
      }];
    });
  }

  private async fetchForecast(lat: number, lng: number, signal?: AbortSignal): Promise<RawForecast> {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      current: [
        'temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'is_day',
        'precipitation', 'weather_code', 'cloud_cover', 'pressure_msl',
        'wind_speed_10m', 'wind_direction_10m',
      ].join(','),
      hourly: [
        'temperature_2m', 'weather_code', 'precipitation_probability',
        'uv_index', 'visibility', 'is_day',
      ].join(','),
      daily: [
        'weather_code', 'temperature_2m_max', 'temperature_2m_min',
        'sunrise', 'sunset', 'uv_index_max', 'precipitation_probability_max',
        'wind_speed_10m_max',
      ].join(','),
      timezone: 'auto',
      timeformat: 'unixtime',
      forecast_days: String(FORECAST_DAYS),
    });

    const res = await fetch(`${FORECAST_URL}?${params}`, { signal });
    if (!res.ok) {
      throw new WeatherUnavailableError(`Open-Meteo a répondu ${res.status}`);
    }
    return (await res.json()) as RawForecast;
  }

  private async fetchAirQuality(
    lat: number, lng: number, signal?: AbortSignal,
  ): Promise<AirQuality | undefined> {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      current: 'european_aqi,pm10,pm2_5,ozone,nitrogen_dioxide',
      timezone: 'auto',
    });

    const res = await fetch(`${AIR_QUALITY_URL}?${params}`, { signal });
    if (!res.ok) return undefined;

    const data = (await res.json()) as RawAirQuality;
    const c = data.current;
    if (!c || typeof c.european_aqi !== 'number') return undefined;

    const index = c.european_aqi;
    return {
      index,
      level: airQualityLevel(index),
      pm25: num(c.pm2_5),
      pm10: num(c.pm10),
      ozone: num(c.ozone),
      nitrogenDioxide: num(c.nitrogen_dioxide),
    };
  }

  private mapCurrent(raw: RawForecast): CurrentWeather {
    const c = raw.current ?? {};

    // UV et visibilité ne sont pas exposés en « current » par Open-Meteo : on
    // les lit sur le créneau horaire courant, qui est la meilleure approximation
    // disponible.
    const idx = this.currentHourIndex(raw);
    const uvIndex = num(this.hourlyValue(raw, 'uv_index', idx));
    const visibilityM = num(this.hourlyValue(raw, 'visibility', idx), 10_000);

    return {
      tempC: Math.round(num(c.temperature_2m)),
      feelsLikeC: Math.round(num(c.apparent_temperature, num(c.temperature_2m))),
      kind: kindFromWmoCode(num(c.weather_code)),
      isDay: num(c.is_day, 1) === 1,
      humidity: Math.round(num(c.relative_humidity_2m)),
      windKph: Math.round(num(c.wind_speed_10m)),
      windDirection: Math.round(num(c.wind_direction_10m)),
      pressureHpa: Math.round(num(c.pressure_msl, 1013)),
      visibilityKm: Math.round(visibilityM / 100) / 10,
      precipitationMm: num(c.precipitation),
      uvIndex: Math.round(uvIndex),
      cloudCover: Math.round(num(c.cloud_cover)),
    };
  }

  /** Index, dans les tableaux horaires, du créneau le plus proche de maintenant. */
  private currentHourIndex(raw: RawForecast): number {
    const times = raw.hourly?.time;
    if (!Array.isArray(times) || times.length === 0) return 0;

    // Comparaison d'instants absolus des deux côtés : les timestamps Unix sont
    // en UTC, `Date.now()` aussi.
    const nowSec = Date.now() / 1000;
    let best = 0;
    let bestGap = Number.POSITIVE_INFINITY;
    for (let i = 0; i < times.length; i += 1) {
      const gap = Math.abs(times[i] - nowSec);
      if (gap < bestGap) { bestGap = gap; best = i; }
    }
    return best;
  }

  private hourlyValue(raw: RawForecast, key: string, index: number): unknown {
    const series = raw.hourly?.[key];
    return Array.isArray(series) ? series[index] : undefined;
  }

  private mapHourly(raw: RawForecast): HourPoint[] {
    const times = raw.hourly?.time;
    if (!Array.isArray(times)) return [];

    const temps = raw.hourly?.temperature_2m ?? [];
    const codes = raw.hourly?.weather_code ?? [];
    const chances = raw.hourly?.precipitation_probability ?? [];
    const isDay = raw.hourly?.is_day ?? [];

    // On ne garde que le présent et le futur : afficher les heures déjà passées
    // n'a aucun intérêt dans un écran de prévision.
    const from = this.currentHourIndex(raw);

    return times.slice(from).map((time, i) => {
      const j = from + i;
      return {
        time: isoFromUnix(time),
        tempC: Math.round(num(temps[j])),
        kind: kindFromWmoCode(num(codes[j])),
        precipitationChance: Math.round(num(chances[j])),
        isDay: num(isDay[j], 1) === 1,
      };
    });
  }

  private mapDaily(raw: RawForecast): DayPoint[] {
    const dates = raw.daily?.time;
    if (!Array.isArray(dates)) return [];

    const codes = raw.daily?.weather_code ?? [];
    const max = raw.daily?.temperature_2m_max ?? [];
    const min = raw.daily?.temperature_2m_min ?? [];
    const sunrise = raw.daily?.sunrise ?? [];
    const sunset = raw.daily?.sunset ?? [];
    const uv = raw.daily?.uv_index_max ?? [];
    const chance = raw.daily?.precipitation_probability_max ?? [];
    const wind = raw.daily?.wind_speed_10m_max ?? [];

    return dates.map((date, i) => ({
      date: isoFromUnix(date),
      kind: kindFromWmoCode(num(codes[i])),
      minC: Math.round(num(min[i])),
      maxC: Math.round(num(max[i])),
      sunrise: isoFromUnix(sunrise[i]),
      sunset: isoFromUnix(sunset[i]),
      uvIndexMax: Math.round(num(uv[i])),
      precipitationChance: Math.round(num(chance[i])),
      windMaxKph: Math.round(num(wind[i])),
    }));
  }
}
