import { UNIVERSES, type Universe } from '@yumia/shared';

/**
 * Pour les univers dont les types Google Places v1 sont invalides ou absents,
 * on utilise une recherche textuelle géolocalisée en fallback.
 */
export const UNIVERSE_TEXT_QUERIES: Partial<Record<Universe, string>> = {
  cannabis:          'coffeeshop coffee shop cannabis social club dispensary',
  hookah:            'chicha shisha hookah narguile bar',
  optician:          'opticien optician lunetterie eye care glasses',
  photo_spot:        'belvédère panorama viewpoint mirador terrasse panoramique',
  shooting:          'stand de tir armurerie shooting range gun range',
  laser_game:        'laser game lasertag laser tag paintball',
  karting:           'karting go kart circuit kart',
  taxi_vtc:          'taxi VTC Uber Bolt chauffeur transport',
  currency_exchange: 'bureau de change currency exchange money changer forex',
};

/**
 * Correspondance univers YUMIA ⇄ types Google Places (API « New »).
 *
 * On reste sur des types « Table A » connus pour être valides comme
 * `includedTypes` de `places:searchNearby`. En cas de type refusé, le provider
 * retombe sur une recherche large puis filtre via {@link googleTypesToUniverse}.
 */

const UNIVERSE_TO_GOOGLE_TYPES: Record<Universe, string[]> = {
  // Manger & Boire
  restaurant:       ['restaurant', 'fast_food_restaurant'], // fast_food fusionné ici
  cafe:             ['cafe', 'coffee_shop', 'bubble_tea_store'], // bubble_tea fusionné
  bakery:           ['bakery'],
  dessert:          ['dessert_shop', 'bakery'],
  ice_cream:        ['ice_cream_shop'],
  chocolatier:      ['candy_store'],
  wine_cellar:      ['liquor_store'],
  tea_house:        ['tea_house', 'cafe'],
  local_specialty:  ['restaurant'],
  // Bars & Soirées
  bar:              ['bar'],
  pub:              ['pub', 'bar'],
  nightclub:        ['night_club'],
  hookah:           ['hookah_bar', 'bar'],
  live_music:       ['live_music_venue', 'bar'],
  rooftop:          ['bar'],
  karaoke:          ['karaoke'],
  // Culture & Tourisme
  museum:           ['museum', 'art_gallery'],
  monument:         ['historical_landmark', 'monument'],
  tourist_activity: ['tourist_attraction'],
  cultural_outing:  ['performing_arts_theater', 'concert_hall', 'cultural_center', 'comedy_club'],
  cinema:           ['movie_theater'],
  zoo:              ['zoo', 'aquarium'],
  amusement_park:   ['amusement_park'],
  photo_spot:       ['scenic_viewpoint'],
  // Nature & Plein air
  park:             ['park', 'national_park'],
  beach:            ['beach'],
  // Sport & Loisirs
  fitness:          ['sports_club', 'sports_complex', 'tennis_court', 'stadium'], // padel fusionné, gym séparé
  gym:              ['gym', 'fitness_center'],
  aquatic:          ['swimming_pool', 'water_park'],
  escape_game:      ['amusement_center'],
  laser_game:       ['laser_tag_center'],
  karting:          ['go_kart_track'],
  bowling:          ['bowling_alley'],
  casino:           ['casino'],
  // Bien-être & Beauté — types stricts pour éviter le mélange
  spa:              ['spa'],
  massage:          ['massage'],
  nail_salon:       ['nail_salon'],
  hair_salon:       ['hair_salon', 'hair_care'],
  barber:           ['barber_shop'],
  florist:          ['florist'],
  // Shopping & Commerce
  shopping:         ['clothing_store', 'department_store'],
  mall:             ['shopping_mall'],
  // market supprimé — les marchés tombent dans shopping via le reverse map
  bookstore:        ['book_store'],
  jewelry:          ['jewelry_store'],
  // Santé
  pharmacy:         ['pharmacy', 'drugstore'],
  doctor:           ['doctor', 'dentist', 'dental_clinic', 'medical_clinic', 'physiotherapist'],
  hospital:         ['hospital'],
  // Vétérinaire & Optique
  vet:              ['veterinary_care'],
  optician:         ['optician', 'eye_care'],
  // Stations & Services
  fuel:             ['gas_station', 'electric_vehicle_charging_station'],
  laundry:          ['laundry'],
  // Sport urbain
  skatepark:        ['skateboard_park'],
  // Cannabis
  cannabis:         ['cannabis_store'],
  // Armurerie & Stand de tir
  shooting:         ['shooting_range', 'gun_store'],
  // Automobile & Moto
  garage:           ['car_repair'],
  car_wash:         ['car_wash'],
  // Sécurité
  police:           ['police'],
  // Culte & Services
  place_of_worship: ['church', 'mosque', 'synagogue', 'hindu_temple'],
  library:          ['library'],
  coworking:        ['coworking_space'],
  // Transport & Mobilité
  taxi_vtc:         ['taxi_stand'],
  gare:             ['train_station', 'transit_station', 'subway_station', 'bus_station', 'light_rail_station'],
  hotel:            ['lodging', 'hotel', 'motel', 'hostel', 'resort_hotel'],
  // Services du quotidien
  atm:              ['atm'],
  currency_exchange:['currency_exchange'],
  // Événements
  event_venue:      ['event_venue', 'stadium', 'amphitheatre', 'convention_center'],
};

/** Recherche large par défaut quand aucun univers n'est précisé (home/explore). */
const DEFAULT_TYPES = ['restaurant', 'cafe', 'bar', 'bakery', 'tourist_attraction', 'museum'];

/** Types Google à exclure de l'hydratation (tabac, épiceries, stations-service…). */
export const BLOCKED_GOOGLE_TYPES = new Set([
  'tobacco_shop',
  'convenience_store',
  'supermarket',
  'grocery_or_supermarket',
  'dry_cleaning',
  'parking',
  'bank',
  // Grandes surfaces / commerces non-expérience (Leroy Merlin, Decathlon…).
  'hardware_store',
  'home_improvement_store',
  'building_materials_store',
  'furniture_store',
  'sporting_goods_store',
  'home_goods_store',
  'auto_parts_store',
  'car_dealer',
  'car_rental',
  'moving_company',
  'storage',
  'wholesaler',
  'warehouse_store',
]);

/** Renvoie true si le lieu doit être écarté (tabac, épicerie, station…). */
export function isBlockedPlace(types: string[]): boolean {
  return types.some((t) => BLOCKED_GOOGLE_TYPES.has(t));
}

/**
 * Reverse map Google → univers, du plus spécifique au plus générique.
 * Le premier type Google reconnu dans les types du lieu détermine l'univers.
 *
 * NOTES DE FUSION :
 *  - art_gallery   → museum  (galeries fusionnées avec musées)
 *  - night_club    → nightclub (nightlife supprimé, nightclub reste)
 */
const GOOGLE_TYPE_TO_UNIVERSE: Array<[string, Universe]> = [
  // Nourriture — du plus spécifique au plus générique
  ['ice_cream_shop',        'ice_cream'],
  ['chocolate_shop',        'chocolatier'],
  ['confectionery',         'chocolatier'],
  ['candy_store',           'chocolatier'],
  ['dessert_shop',          'dessert'],
  ['pastry_shop',           'dessert'],
  ['cake_shop',             'dessert'],
  ['bakery',                'bakery'],
  ['fast_food_restaurant',  'restaurant'], // fast_food → restaurant (fusionné)
  ['bubble_tea_store',      'cafe'],  // bubble_tea → cafe (fusionné)
  ['coffee_shop',           'cafe'],
  ['cafe',                  'cafe'],
  ['tea_house',             'tea_house'],
  // Bars & Soirées
  ['hookah_bar',            'hookah'],
  ['live_music_venue',      'live_music'],
  ['night_club',            'nightclub'],
  ['pub',                   'pub'],
  ['karaoke',               'karaoke'],
  // Culture & Tourisme
  ['art_gallery',           'museum'],   // fusionné dans museum
  ['museum',                'museum'],
  ['historical_landmark',   'monument'],
  ['monument',              'monument'],
  ['scenic_viewpoint',      'photo_spot'],
  ['observation_deck',      'photo_spot'],
  ['performing_arts_theater','cultural_outing'],
  ['concert_hall',          'cultural_outing'],
  ['cultural_center',       'cultural_outing'],
  ['comedy_club',           'cultural_outing'],
  ['event_venue',           'event_venue'],
  ['stadium',               'event_venue'],
  ['amphitheatre',          'event_venue'],
  ['convention_center',     'event_venue'],
  ['movie_theater',         'cinema'],
  ['amusement_park',        'amusement_park'],
  ['zoo',                   'zoo'],
  ['aquarium',              'zoo'],
  // Nature & Plein air — AVANT tourist_attraction pour ne pas être absorbées
  ['beach',                 'beach'],
  ['park',                  'park'],
  ['national_park',         'park'],
  ['nature_reserve',        'park'],
  // tourist_attraction en dernier recours (activité touristique générique)
  ['tourist_attraction',    'tourist_activity'],
  // Sport & Loisirs
  ['laser_tag_center',      'laser_game'],
  ['go_kart_track',         'karting'],
  ['fitness_center',        'gym'],
  ['gym',                   'gym'],
  ['sports_complex',        'fitness'],
  ['tennis_court',          'fitness'],
  ['sports_club',           'fitness'],
  ['stadium',               'fitness'],
  ['amusement_center',      'escape_game'],
  ['bowling_alley',         'bowling'],
  ['water_park',            'aquatic'],
  ['swimming_pool',         'aquatic'],
  ['casino',                'casino'],
  // Bien-être & Beauté — types spécifiques AVANT spa/beauty_salon
  ['nail_salon',            'nail_salon'],
  ['barber_shop',           'barber'],
  ['hair_salon',            'hair_salon'],
  ['hair_care',             'hair_salon'],
  ['massage',               'massage'],
  ['spa',                   'spa'],
  ['beauty_salon',          'spa'],
  // Shopping & Commerce
  ['shopping_mall',         'mall'],
  ['department_store',      'mall'],
  ['clothing_store',        'shopping'],
  ['shoe_store',            'shopping'],
  ['cosmetics_store',       'shopping'],  // Yves Rocher, Sephora, etc.
  ['beauty_products',       'shopping'],
  ['book_store',            'bookstore'],
  ['florist',               'florist'],
  ['jewelry_store',         'jewelry'],
  ['market',                'shopping'],
  ['farmer_market',         'shopping'],
  ['liquor_store',          'wine_cellar'],
  // Santé
  ['hospital',              'hospital'],
  ['doctor',                'doctor'],
  ['dentist',               'doctor'],
  ['dental_clinic',         'doctor'],
  ['medical_clinic',        'doctor'],
  ['physiotherapist',       'doctor'],
  ['pharmacy',              'pharmacy'],
  ['drugstore',             'pharmacy'],
  // Vétérinaire & Optique
  ['veterinary_care',       'vet'],
  ['optician',              'optician'],
  ['eye_care',              'optician'],
  // Stations & Services
  ['gas_station',           'fuel'],
  ['electric_vehicle_charging_station', 'fuel'],
  ['laundry',               'laundry'],
  // Sport urbain
  ['skateboard_park',       'skatepark'],
  ['cannabis_store',        'cannabis'],
  ['shooting_range',        'shooting'],
  ['gun_store',             'shooting'],
  ['car_repair',            'garage'],
  ['car_wash',              'car_wash'],
  // Sécurité
  ['police_station',        'police'],
  ['police',                'police'],
  // Services
  ['coworking_space',       'coworking'],
  ['library',               'library'],
  // Culte
  ['church',                'place_of_worship'],
  ['mosque',                'place_of_worship'],
  ['synagogue',             'place_of_worship'],
  ['hindu_temple',          'place_of_worship'],
  // Transport & Hébergement
  ['train_station',         'gare'],
  ['transit_station',       'gare'],
  ['subway_station',        'gare'],
  ['bus_station',           'gare'],
  ['light_rail_station',    'gare'],
  ['lodging',               'hotel'],
  ['hotel',                 'hotel'],
  ['motel',                 'hotel'],
  ['hostel',                'hotel'],
  ['resort_hotel',          'hotel'],
  // Générique (toujours en dernier)
  ['bar',                   'bar'],
  ['restaurant',            'restaurant'],
];

const UNIVERSE_SET = new Set<string>(UNIVERSES as readonly string[]);

/** Index type Google → univers (lookup O(1) respectant l'ordre du lieu). */
const GOOGLE_TYPE_LOOKUP = new Map<string, Universe>(GOOGLE_TYPE_TO_UNIVERSE);

/** Types Google à demander pour un univers donné (ou liste large si absent). */
export function universeToGoogleTypes(universe?: Universe): string[] {
  if (!universe) return [...DEFAULT_TYPES];
  return UNIVERSE_TO_GOOGLE_TYPES[universe] ?? ['restaurant'];
}

/**
 * Déduit l'univers YUMIA d'après les types Google d'un lieu.
 *
 * On parcourt les types **dans l'ordre du lieu** : Google place toujours le type
 * PRINCIPAL en premier. Ainsi un cinéma qui vend des bonbons
 * (`['movie_theater','candy_store',…]`) est classé « cinéma » et non
 * « chocolatier ». Le premier type reconnu gagne ; sinon on retombe sur le
 * `fallback` (l'univers explicitement recherché lors d'une requête ciblée).
 */
export function googleTypesToUniverse(types: string[], fallback: Universe = 'restaurant'): Universe {
  for (const t of types) {
    const universe = GOOGLE_TYPE_LOOKUP.get(t);
    if (universe) return universe;
  }
  return UNIVERSE_SET.has(fallback) ? fallback : 'restaurant';
}
