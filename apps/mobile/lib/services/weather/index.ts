import { OpenMeteoProvider } from './open-meteo';
import type { WeatherProvider } from './provider';

/**
 * Point d'entrée de la couche météo.
 *
 * **Pour changer de fournisseur**, il n'y a qu'une seule ligne à toucher : la
 * valeur retournée ici. Écrire `new WeatherApiProvider()` suffirait, sans
 * qu'aucun écran ni aucun hook ne bouge — c'est tout l'intérêt d'avoir isolé
 * les appels réseau derrière `WeatherProvider`.
 */

let instance: WeatherProvider | null = null;

export function getWeatherProvider(): WeatherProvider {
  instance ??= new OpenMeteoProvider();
  return instance;
}

/** Injecte un fournisseur — utilisé par les tests et un futur réglage in-app. */
export function setWeatherProvider(provider: WeatherProvider): void {
  instance = provider;
}

export { WeatherUnavailableError } from './provider';
export type { WeatherProvider } from './provider';
export * from './types';
export { KIND_LABEL, kindEmoji, kindFromWmoCode } from './wmo';
export { dayMomentAt, moonAt, moonPhaseEmoji, moonPhaseLabel } from './astro';
export { activitiesFor, type ActivitySuggestion } from './activities';
export {
  formatLocalHour, formatLocalTime, formatLocalWeekday, isSameLocalDay,
} from './format';
