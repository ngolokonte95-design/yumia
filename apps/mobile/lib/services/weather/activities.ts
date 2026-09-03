import type { CurrentWeather, WeatherKind } from './types';
import type { TranslationKey } from '../../translations';

/**
 * Recommandations d'activités pilotées par la météo.
 *
 * Chaque suggestion pointe vers un **univers Yumia réel** : appuyer dessus mène
 * directement à la liste des lieux correspondants autour de soi. Le lien météo →
 * lieu est ce qui rend la fonctionnalité utile plutôt que décorative.
 *
 * `label` n'est pas stocké ici : c'est le même nom d'univers affiché ailleurs
 * dans l'app, donc dérivé via `universeLabel(t, universe)` au rendu plutôt que
 * dupliqué (et re-traduit) dans cette table.
 */

export interface ActivitySuggestion {
  /** Univers Yumia ciblé — doit exister dans `@yumia/shared`. */
  universe: string;
  emoji: string;
  /** Pourquoi c'est suggéré maintenant — affiché en petit sous le libellé. */
  reasonKey: TranslationKey;
}

/** Suggestions par condition météo, du plus au moins pertinent. */
const BY_KIND: Record<WeatherKind, ActivitySuggestion[]> = {
  clear: [
    { universe: 'rooftop', emoji: '🌆', reasonKey: 'wxa_reason_clear_view' },
    { universe: 'beach', emoji: '🏖️', reasonKey: 'wxa_reason_sun' },
    { universe: 'park', emoji: '🌳', reasonKey: 'wxa_reason_outdoor_ideal' },
    { universe: 'hiking', emoji: '🥾', reasonKey: 'wxa_reason_clear_sky' },
    { universe: 'picnic_area', emoji: '🧺', reasonKey: 'wxa_reason_nice_weather' },
  ],
  partly_cloudy: [
    { universe: 'park', emoji: '🌳', reasonKey: 'wxa_reason_mild' },
    { universe: 'rooftop', emoji: '🌆', reasonKey: 'wxa_reason_still_mild' },
    { universe: 'tourist_activity', emoji: '🗺️', reasonKey: 'wxa_reason_no_heat' },
    { universe: 'botanical_garden', emoji: '🌸', reasonKey: 'wxa_reason_soft_light' },
  ],
  cloudy: [
    { universe: 'museum', emoji: '🖼️', reasonKey: 'wxa_reason_overcast' },
    { universe: 'cafe', emoji: '☕', reasonKey: 'wxa_reason_stay_warm' },
    { universe: 'shopping', emoji: '🛍️', reasonKey: 'wxa_reason_sheltered' },
    { universe: 'bookstore', emoji: '📚', reasonKey: 'wxa_reason_calm' },
  ],
  fog: [
    { universe: 'cafe', emoji: '☕', reasonKey: 'wxa_reason_low_visibility' },
    { universe: 'tea_house', emoji: '🍵', reasonKey: 'wxa_reason_cozy' },
    { universe: 'museum', emoji: '🖼️', reasonKey: 'wxa_reason_stay_indoors' },
    { universe: 'library', emoji: '📖', reasonKey: 'wxa_reason_hushed' },
  ],
  drizzle: [
    { universe: 'cafe', emoji: '☕', reasonKey: 'wxa_reason_drizzle_outside' },
    { universe: 'museum', emoji: '🖼️', reasonKey: 'wxa_reason_dry' },
    { universe: 'restaurant', emoji: '🍽️', reasonKey: 'wxa_reason_gloomy' },
    { universe: 'cinema', emoji: '🎬', reasonKey: 'wxa_reason_ideal_screening' },
  ],
  rain: [
    { universe: 'restaurant', emoji: '🍽️', reasonKey: 'wxa_reason_raining' },
    { universe: 'cinema', emoji: '🎬', reasonKey: 'wxa_reason_dry' },
    { universe: 'museum', emoji: '🖼️', reasonKey: 'wxa_reason_covered_outing' },
    { universe: 'spa', emoji: '🧖', reasonKey: 'wxa_reason_warm_up' },
    { universe: 'bowling', emoji: '🎳', reasonKey: 'wxa_reason_indoors' },
  ],
  heavy_rain: [
    { universe: 'cinema', emoji: '🎬', reasonKey: 'wxa_reason_heavy_rain' },
    { universe: 'mall', emoji: '🏬', reasonKey: 'wxa_reason_fully_covered' },
    { universe: 'restaurant', emoji: '🍽️', reasonKey: 'wxa_reason_stay_dry_alt' },
    { universe: 'spa', emoji: '🧖', reasonKey: 'wxa_reason_cocooning' },
  ],
  snow: [
    { universe: 'chocolatier', emoji: '🍫', reasonKey: 'wxa_reason_snowing' },
    { universe: 'tea_house', emoji: '🍵', reasonKey: 'wxa_reason_warm_up' },
    { universe: 'spa', emoji: '🧖', reasonKey: 'wxa_reason_welcome_warmth' },
    { universe: 'hotel', emoji: '🏔️', reasonKey: 'wxa_reason_warm_stay' },
    { universe: 'restaurant', emoji: '🍽️', reasonKey: 'wxa_reason_comfort_meal' },
  ],
  thunderstorm: [
    { universe: 'cinema', emoji: '🎬', reasonKey: 'wxa_reason_storm_ongoing' },
    { universe: 'museum', emoji: '🖼️', reasonKey: 'wxa_reason_stay_sheltered' },
    { universe: 'restaurant', emoji: '🍽️', reasonKey: 'wxa_reason_covered_outing' },
    { universe: 'mall', emoji: '🏬', reasonKey: 'wxa_reason_fully_sheltered' },
  ],
};

/** Suggestions nocturnes — priment sur la condition dès que le soleil est couché. */
const NIGHT: ActivitySuggestion[] = [
  { universe: 'bar', emoji: '🍸', reasonKey: 'wxa_reason_evening' },
  { universe: 'live_music', emoji: '🎸', reasonKey: 'wxa_reason_night_out' },
  { universe: 'nightclub', emoji: '🪩', reasonKey: 'wxa_reason_night_begins' },
  { universe: 'rooftop', emoji: '🌃', reasonKey: 'wxa_reason_night_view' },
  { universe: 'comedy_club', emoji: '🎤', reasonKey: 'wxa_reason_evening_show' },
];

/** Au-delà de ce seuil, on privilégie le frais quoi qu'il arrive. */
const HOT_C = 29;
/** En dessous, on privilégie le chaud. */
const COLD_C = 4;

const HOT: ActivitySuggestion[] = [
  { universe: 'aquatic', emoji: '🏊', reasonKey: 'wxa_reason_strong_heat' },
  { universe: 'waterspot', emoji: '💦', reasonKey: 'wxa_reason_cool_off' },
  { universe: 'ice_cream', emoji: '🍦', reasonKey: 'wxa_reason_hot_out' },
  { universe: 'juice_bar', emoji: '🥤', reasonKey: 'wxa_reason_hydrate' },
];

const COLD: ActivitySuggestion[] = [
  { universe: 'tea_house', emoji: '🍵', reasonKey: 'wxa_reason_cold_out' },
  { universe: 'chocolatier', emoji: '🍫', reasonKey: 'wxa_reason_comfort' },
  { universe: 'spa', emoji: '🧖', reasonKey: 'wxa_reason_warm_up' },
  { universe: 'cafe', emoji: '☕', reasonKey: 'wxa_reason_hot_drink' },
];

/**
 * Compose la liste d'activités du moment.
 *
 * L'ordre de priorité reflète ce qui pèse le plus sur une envie de sortie :
 * la nuit d'abord (on ne va pas au parc à 23h même par beau temps), puis les
 * températures extrêmes, et enfin la condition météo elle-même.
 */
export function activitiesFor(current: CurrentWeather, limit = 6): ActivitySuggestion[] {
  const base = BY_KIND[current.kind] ?? BY_KIND.cloudy;
  const severe = current.kind === 'thunderstorm' || current.kind === 'heavy_rain';

  const ordered: ActivitySuggestion[] = [];

  // Par temps sévère, l'abri prime sur l'heure et la température.
  if (!severe) {
    if (!current.isDay) ordered.push(...NIGHT);
    if (current.tempC >= HOT_C) ordered.push(...HOT);
    else if (current.tempC <= COLD_C) ordered.push(...COLD);
  }
  ordered.push(...base);

  // Dédoublonne en gardant la première occurrence (donc la plus prioritaire).
  const seen = new Set<string>();
  return ordered
    .filter((a) => (seen.has(a.universe) ? false : seen.add(a.universe)))
    .slice(0, limit);
}
