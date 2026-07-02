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
  cultural_outing: ['performing_arts_theater'],
  nightlife: ['night_club', 'bar'],
  nightclub: ['night_club'],
  pub: ['pub', 'bar'],
  beach: ['beach'],
  place_of_worship: ['church', 'mosque', 'synagogue', 'hindu_temple'],
  spa: ['spa', 'beauty_salon'],
  park: ['park', 'national_park'],
  cinema: ['movie_theater'],
  market: ['market', 'farmer_market'],
  fitness: ['gym', 'sports_club'],
  live_music: ['bar', 'night_club'],
  escape_game: ['amusement_center'],
  museum: ['museum'],
  zoo: ['zoo', 'aquarium'],
  amusement_park: ['amusement_park'],
  bookstore: ['book_store'],
  tea_house: ['tea_house', 'cafe'],
  karaoke: ['karaoke'],
  library: ['library'],
  bowling: ['bowling_alley'],
  casino: ['casino'],
  art_gallery: ['art_gallery'],
  aquatic: ['swimming_pool', 'water_park'],
  florist: ['florist'],
  nail_salon: ['nail_salon'],
  hair_salon: ['hair_salon', 'hair_care'],
  barber: ['barber_shop'],
  shopping: ['shopping_mall', 'clothing_store'],
  jewelry: ['jewelry_store'],
  massage: ['massage'],
};

/** Recherche large par défaut quand aucun univers n'est précisé (home/explore). */
const DEFAULT_TYPES = ['restaurant', 'cafe', 'bar', 'bakery', 'tourist_attraction', 'museum'];

/** Types Google à exclure de l'hydratation (tabac, épiceries, stations-service…). */
export const BLOCKED_GOOGLE_TYPES = new Set([
  'tobacco_shop',
  'convenience_store',
  'supermarket',
  'grocery_or_supermarket',
  'gas_station',
  'laundry',
  'dry_cleaning',
  'car_wash',
  'parking',
  'atm',
  'bank',
  'pharmacy',
]);

/** Renvoie true si le lieu doit être écarté (tabac, épicerie, station…). */
export function isBlockedPlace(types: string[]): boolean {
  return types.some((t) => BLOCKED_GOOGLE_TYPES.has(t));
}

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
  ['tea_house', 'tea_house'],
  ['night_club', 'nightclub'],
  ['pub', 'pub'],
  ['beach', 'beach'],
  ['church', 'place_of_worship'],
  ['mosque', 'place_of_worship'],
  ['synagogue', 'place_of_worship'],
  ['hindu_temple', 'place_of_worship'],
  ['liquor_store', 'wine_cellar'],
  ['candy_store', 'chocolatier'],
  // Soins personnels : types spécifiques AVANT spa/beauty_salon, car une
  // onglerie ou un institut de massage porte souvent aussi 'beauty_salon'/'spa'.
  ['nail_salon', 'nail_salon'],
  ['barber_shop', 'barber'],
  ['hair_salon', 'hair_salon'],
  ['hair_care', 'hair_salon'],
  ['massage', 'massage'],
  ['spa', 'spa'],
  ['beauty_salon', 'spa'],
  ['park', 'park'],
  ['national_park', 'park'],
  ['movie_theater', 'cinema'],
  ['market', 'market'],
  ['farmer_market', 'market'],
  ['gym', 'fitness'],
  ['sports_club', 'fitness'],
  ['amusement_center', 'escape_game'],
  ['bowling_alley', 'bowling'],
  ['amusement_park', 'amusement_park'],
  ['water_park', 'aquatic'],
  ['swimming_pool', 'aquatic'],
  ['zoo', 'zoo'],
  ['aquarium', 'zoo'],
  ['book_store', 'bookstore'],
  ['library', 'library'],
  ['karaoke', 'karaoke'],
  ['casino', 'casino'],
  ['florist', 'florist'],
  ['jewelry_store', 'jewelry'],
  ['shopping_mall', 'shopping'],
  ['clothing_store', 'shopping'],
  ['shoe_store', 'shopping'],
  ['bar', 'bar'],
  ['museum', 'museum'],
  ['art_gallery', 'art_gallery'],
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
