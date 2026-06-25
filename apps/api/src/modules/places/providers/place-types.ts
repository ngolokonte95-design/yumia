import { UNIVERSES, type Universe } from '@yumia/shared';

/**
 * Correspondance univers YUMIA ⇄ types Google Places (API « New »).
 *
 * On reste sur des types « Table A » connus pour être valides comme
 * `includedTypes` de `places:searchNearby`. En cas de type refusé, le provider
 * retombe sur une recherche large puis filtre via {@link googleTypesToUniverse}.
 */

const UNIVERSE_TO_GOOGLE_TYPES: Record<Universe, string[]> = {
  restaurant: ['restaurant'],
  cafe: ['cafe', 'coffee_shop'],
  bakery: ['bakery'],
  dessert: ['dessert_shop', 'bakery'],
  bar: ['bar'],
  bubble_tea: ['cafe'],
  local_specialty: ['restaurant'],
  ice_cream: ['ice_cream_shop'],
  chocolatier: ['candy_store', 'store'],
  wine_cellar: ['liquor_store'],
  tourist_activity: ['tourist_attraction'],
  rooftop: ['bar'],
  cultural_outing: ['museum', 'art_gallery', 'performing_arts_theater'],
  nightlife: ['night_club'],
};

/** Recherche large par défaut quand aucun univers n'est précisé (home/explore). */
const DEFAULT_TYPES = ['restaurant', 'cafe', 'bar', 'bakery', 'tourist_attraction', 'museum'];

/**
 * Reverse map Google → univers, du plus spécifique au plus générique : le
 * premier type Google reconnu détermine l'univers stocké pour le lieu.
 */
const GOOGLE_TYPE_TO_UNIVERSE: Array<[string, Universe]> = [
  ['ice_cream_shop', 'ice_cream'],
  ['dessert_shop', 'dessert'],
  ['bakery', 'bakery'],
  ['coffee_shop', 'cafe'],
  ['cafe', 'cafe'],
  ['tea_house', 'bubble_tea'],
  ['night_club', 'nightlife'],
  ['liquor_store', 'wine_cellar'],
  ['candy_store', 'chocolatier'],
  ['bar', 'bar'],
  ['museum', 'cultural_outing'],
  ['art_gallery', 'cultural_outing'],
  ['performing_arts_theater', 'cultural_outing'],
  ['tourist_attraction', 'tourist_activity'],
  ['restaurant', 'restaurant'],
];

const UNIVERSE_SET = new Set<string>(UNIVERSES as readonly string[]);

/** Types Google à demander pour un univers donné (ou liste large si absent). */
export function universeToGoogleTypes(universe?: Universe): string[] {
  if (!universe) return [...DEFAULT_TYPES];
  return UNIVERSE_TO_GOOGLE_TYPES[universe] ?? ['restaurant'];
}

/** Déduit l'univers YUMIA le plus pertinent d'après les types Google d'un lieu. */
export function googleTypesToUniverse(types: string[], fallback: Universe = 'restaurant'): Universe {
  const set = new Set(types);
  for (const [googleType, universe] of GOOGLE_TYPE_TO_UNIVERSE) {
    if (set.has(googleType)) return universe;
  }
  return UNIVERSE_SET.has(fallback) ? fallback : 'restaurant';
}
