import type { CurrentWeather, WeatherKind } from './types';

/**
 * Recommandations d'activités pilotées par la météo.
 *
 * Chaque suggestion pointe vers un **univers Yumia réel** : appuyer dessus mène
 * directement à la liste des lieux correspondants autour de soi. Le lien météo →
 * lieu est ce qui rend la fonctionnalité utile plutôt que décorative.
 */

export interface ActivitySuggestion {
  /** Univers Yumia ciblé — doit exister dans `@yumia/shared`. */
  universe: string;
  label: string;
  emoji: string;
  /** Pourquoi c'est suggéré maintenant — affiché en petit sous le libellé. */
  reason: string;
}

/** Suggestions par condition météo, du plus au moins pertinent. */
const BY_KIND: Record<WeatherKind, ActivitySuggestion[]> = {
  clear: [
    { universe: 'rooftop', label: 'Rooftops', emoji: '🌆', reason: 'Vue dégagée' },
    { universe: 'beach', label: 'Plages', emoji: '🏖️', reason: 'Grand soleil' },
    { universe: 'park', label: 'Parcs', emoji: '🌳', reason: 'Idéal dehors' },
    { universe: 'hiking', label: 'Randonnées', emoji: '🥾', reason: 'Ciel dégagé' },
    { universe: 'picnic_area', label: 'Pique-nique', emoji: '🧺', reason: 'Beau temps' },
  ],
  partly_cloudy: [
    { universe: 'park', label: 'Parcs', emoji: '🌳', reason: 'Douceur agréable' },
    { universe: 'rooftop', label: 'Rooftops', emoji: '🌆', reason: 'Encore clément' },
    { universe: 'tourist_activity', label: 'Visites', emoji: '🗺️', reason: 'Sans grosse chaleur' },
    { universe: 'botanical_garden', label: 'Jardins', emoji: '🌸', reason: 'Lumière douce' },
  ],
  cloudy: [
    { universe: 'museum', label: 'Musées', emoji: '🖼️', reason: 'Ciel couvert' },
    { universe: 'cafe', label: 'Cafés', emoji: '☕', reason: 'Au chaud' },
    { universe: 'shopping', label: 'Shopping', emoji: '🛍️', reason: 'À l\'abri' },
    { universe: 'bookstore', label: 'Librairies', emoji: '📚', reason: 'Temps calme' },
  ],
  fog: [
    { universe: 'cafe', label: 'Cafés', emoji: '☕', reason: 'Visibilité réduite' },
    { universe: 'tea_house', label: 'Salons de thé', emoji: '🍵', reason: 'Cocon' },
    { universe: 'museum', label: 'Musées', emoji: '🖼️', reason: 'Rester à l\'intérieur' },
    { universe: 'library', label: 'Bibliothèques', emoji: '📖', reason: 'Ambiance feutrée' },
  ],
  drizzle: [
    { universe: 'cafe', label: 'Cafés', emoji: '☕', reason: 'Bruine dehors' },
    { universe: 'museum', label: 'Musées', emoji: '🖼️', reason: 'Au sec' },
    { universe: 'restaurant', label: 'Restaurants', emoji: '🍽️', reason: 'Temps maussade' },
    { universe: 'cinema', label: 'Cinémas', emoji: '🎬', reason: 'Séance idéale' },
  ],
  rain: [
    { universe: 'restaurant', label: 'Restaurants', emoji: '🍽️', reason: 'Il pleut' },
    { universe: 'cinema', label: 'Cinémas', emoji: '🎬', reason: 'Au sec' },
    { universe: 'museum', label: 'Musées', emoji: '🖼️', reason: 'Sortie couverte' },
    { universe: 'spa', label: 'Spas', emoji: '🧖', reason: 'Se réchauffer' },
    { universe: 'bowling', label: 'Bowlings', emoji: '🎳', reason: 'À l\'intérieur' },
  ],
  heavy_rain: [
    { universe: 'cinema', label: 'Cinémas', emoji: '🎬', reason: 'Fortes pluies' },
    { universe: 'mall', label: 'Centres commerciaux', emoji: '🏬', reason: 'Tout couvert' },
    { universe: 'restaurant', label: 'Restaurants', emoji: '🍽️', reason: 'Rester au sec' },
    { universe: 'spa', label: 'Spas', emoji: '🧖', reason: 'Cocooning' },
  ],
  snow: [
    { universe: 'chocolatier', label: 'Chocolatiers', emoji: '🍫', reason: 'Il neige' },
    { universe: 'tea_house', label: 'Salons de thé', emoji: '🍵', reason: 'Se réchauffer' },
    { universe: 'spa', label: 'Spas', emoji: '🧖', reason: 'Chaleur bienvenue' },
    { universe: 'hotel', label: 'Hôtels & chalets', emoji: '🏔️', reason: 'Séjour au chaud' },
    { universe: 'restaurant', label: 'Restaurants', emoji: '🍽️', reason: 'Repas réconfortant' },
  ],
  thunderstorm: [
    { universe: 'cinema', label: 'Cinémas', emoji: '🎬', reason: 'Orage en cours' },
    { universe: 'museum', label: 'Musées', emoji: '🖼️', reason: 'Rester à l\'abri' },
    { universe: 'restaurant', label: 'Restaurants', emoji: '🍽️', reason: 'Sortie couverte' },
    { universe: 'mall', label: 'Centres commerciaux', emoji: '🏬', reason: 'Entièrement couvert' },
  ],
};

/** Suggestions nocturnes — priment sur la condition dès que le soleil est couché. */
const NIGHT: ActivitySuggestion[] = [
  { universe: 'bar', label: 'Bars', emoji: '🍸', reason: 'C\'est le soir' },
  { universe: 'live_music', label: 'Concerts', emoji: '🎸', reason: 'Sortie nocturne' },
  { universe: 'nightclub', label: 'Clubs', emoji: '🪩', reason: 'La nuit commence' },
  { universe: 'rooftop', label: 'Rooftops', emoji: '🌃', reason: 'Vue de nuit' },
  { universe: 'comedy_club', label: 'Comédie', emoji: '🎤', reason: 'Spectacle du soir' },
];

/** Au-delà de ce seuil, on privilégie le frais quoi qu'il arrive. */
const HOT_C = 29;
/** En dessous, on privilégie le chaud. */
const COLD_C = 4;

const HOT: ActivitySuggestion[] = [
  { universe: 'aquatic', label: 'Piscines', emoji: '🏊', reason: 'Forte chaleur' },
  { universe: 'waterspot', label: 'Points d\'eau', emoji: '💦', reason: 'Se rafraîchir' },
  { universe: 'ice_cream', label: 'Glaciers', emoji: '🍦', reason: 'Il fait chaud' },
  { universe: 'juice_bar', label: 'Jus & smoothies', emoji: '🥤', reason: 'S\'hydrater' },
];

const COLD: ActivitySuggestion[] = [
  { universe: 'tea_house', label: 'Salons de thé', emoji: '🍵', reason: 'Il fait froid' },
  { universe: 'chocolatier', label: 'Chocolatiers', emoji: '🍫', reason: 'Réconfort' },
  { universe: 'spa', label: 'Spas', emoji: '🧖', reason: 'Se réchauffer' },
  { universe: 'cafe', label: 'Cafés', emoji: '☕', reason: 'Boisson chaude' },
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
