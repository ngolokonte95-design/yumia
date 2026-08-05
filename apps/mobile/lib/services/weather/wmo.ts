import type { WeatherKind } from './types';

/**
 * Table de correspondance des codes WMO (norme de l'Organisation météorologique
 * mondiale) vers le vocabulaire normalisé de Yumia.
 *
 * Open-Meteo renvoie ces codes tels quels ; d'autres fournisseurs ont leurs
 * propres codes et devront écrire leur propre table — c'est justement le rôle
 * de la couche fournisseur.
 */
const WMO_TO_KIND: Record<number, WeatherKind> = {
  0: 'clear',
  1: 'clear',
  2: 'partly_cloudy',
  3: 'cloudy',
  45: 'fog', 48: 'fog',
  51: 'drizzle', 53: 'drizzle', 55: 'drizzle',
  56: 'drizzle', 57: 'drizzle',
  61: 'rain', 63: 'rain', 65: 'heavy_rain',
  66: 'rain', 67: 'heavy_rain',
  71: 'snow', 73: 'snow', 75: 'snow', 77: 'snow',
  80: 'rain', 81: 'rain', 82: 'heavy_rain',
  85: 'snow', 86: 'snow',
  95: 'thunderstorm', 96: 'thunderstorm', 99: 'thunderstorm',
};

export function kindFromWmoCode(code: number): WeatherKind {
  return WMO_TO_KIND[code] ?? 'cloudy';
}

/** Libellé français court, affiché sous la température. */
export const KIND_LABEL: Record<WeatherKind, string> = {
  clear: 'Ciel dégagé',
  partly_cloudy: 'Partiellement nuageux',
  cloudy: 'Couvert',
  fog: 'Brouillard',
  drizzle: 'Bruine',
  rain: 'Pluie',
  heavy_rain: 'Fortes pluies',
  snow: 'Neige',
  thunderstorm: 'Orage',
};

/**
 * Emoji de la condition. Certaines conditions changent de visage la nuit
 * (un ciel dégagé devient une lune), d'où le paramètre `isDay`.
 */
export function kindEmoji(kind: WeatherKind, isDay = true): string {
  switch (kind) {
    case 'clear': return isDay ? '☀️' : '🌙';
    case 'partly_cloudy': return isDay ? '⛅' : '☁️';
    case 'cloudy': return '☁️';
    case 'fog': return '🌫️';
    case 'drizzle': return '🌦️';
    case 'rain': return '🌧️';
    case 'heavy_rain': return '⛈️';
    case 'snow': return '❄️';
    case 'thunderstorm': return '⛈️';
  }
}
