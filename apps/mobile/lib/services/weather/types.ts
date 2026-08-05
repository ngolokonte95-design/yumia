/**
 * Modèle de domaine météo de Yumia.
 *
 * Ces types sont **indépendants de tout fournisseur** : ni Open-Meteo, ni
 * WeatherAPI, ni OpenWeather n'apparaissent ici. C'est ce qui permet de changer
 * de fournisseur sans toucher une seule ligne d'interface.
 */

/** Condition météo normalisée — le vocabulaire commun à tous les fournisseurs. */
export type WeatherKind =
  | 'clear'
  | 'partly_cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'heavy_rain'
  | 'snow'
  | 'thunderstorm';

/** Moment de la journée — pilote l'ambiance visuelle de l'écran. */
export type DayMoment = 'night' | 'sunrise' | 'day' | 'sunset';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface CurrentWeather {
  tempC: number;
  /** Température ressentie (vent + humidité). */
  feelsLikeC: number;
  kind: WeatherKind;
  isDay: boolean;
  /** Humidité relative en %. */
  humidity: number;
  windKph: number;
  /** Direction du vent en degrés (0 = nord). */
  windDirection: number;
  /** Pression au niveau de la mer, en hPa. */
  pressureHpa: number;
  /** Visibilité en km. */
  visibilityKm: number;
  /** Précipitations sur l'heure écoulée, en mm. */
  precipitationMm: number;
  /** Indice UV (0–11+). */
  uvIndex: number;
  /** Couverture nuageuse en %. */
  cloudCover: number;
}

export interface HourPoint {
  /**
   * Instant absolu, en ISO 8601 UTC (suffixe « Z »).
   *
   * Toujours un instant vrai, jamais une heure murale : pour l'afficher dans le
   * fuseau du lieu observé, passer par `formatLocalTime` avec
   * `WeatherReport.utcOffsetSeconds`. C'est ce qui rend correcte la consultation
   * de la météo d'une destination à l'autre bout du monde.
   */
  time: string;
  tempC: number;
  kind: WeatherKind;
  /** Probabilité de précipitation en %. */
  precipitationChance: number;
  isDay: boolean;
}

export interface DayPoint {
  /** Minuit local du jour concerné, en ISO 8601 UTC. */
  date: string;
  kind: WeatherKind;
  minC: number;
  maxC: number;
  sunrise: string;
  sunset: string;
  uvIndexMax: number;
  precipitationChance: number;
  windMaxKph: number;
}

/** Qualité de l'air. `index` suit l'échelle européenne (0 = excellent). */
export interface AirQuality {
  index: number;
  level: 'good' | 'fair' | 'moderate' | 'poor' | 'very_poor';
  pm25: number;
  pm10: number;
  ozone: number;
  nitrogenDioxide: number;
}

export interface Astro {
  sunrise: string;
  sunset: string;
  /** Heure dorée du matin — lumière chaude et rasante. */
  goldenHourMorning: { start: string; end: string };
  /** Heure dorée du soir. */
  goldenHourEvening: { start: string; end: string };
  /** Phase lunaire de 0 à 1 (0 = nouvelle lune, 0.5 = pleine lune). */
  moonPhase: number;
  /** Fraction éclairée du disque lunaire, de 0 à 1. */
  moonIllumination: number;
}

/** Rapport météo complet pour un point du globe. */
export interface WeatherReport {
  coordinates: Coordinates;
  /** Fuseau horaire IANA du lieu (ex. « Europe/Paris »). */
  timezone: string;
  /**
   * Décalage du lieu par rapport à UTC, en secondes.
   * Indispensable pour afficher l'heure murale du lieu observé plutôt que celle
   * du téléphone — les deux diffèrent dès qu'on consulte une destination.
   */
  utcOffsetSeconds: number;
  current: CurrentWeather;
  hourly: HourPoint[];
  daily: DayPoint[];
  astro: Astro;
  /** Absente si le fournisseur ne couvre pas la zone. */
  airQuality?: AirQuality;
  /** Instant de récupération — sert à afficher la fraîcheur de la donnée. */
  fetchedAt: string;
}
