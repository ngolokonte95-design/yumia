import { UNIVERSES, type Universe } from '@yumia/shared';

/**
 * Pour les univers dont les types Google Places v1 sont invalides ou absents,
 * on utilise une recherche textuelle géolocalisée en fallback.
 */
export const UNIVERSE_TEXT_QUERIES: Partial<Record<Universe, string>> = {
  cannabis:          'coffeeshop coffee shop cannabis social club dispensary',
  hookah:            'bar à chicha chicha shisha hookah narguilé lounge',
  atm:               'distributeur automatique billets ATM retrait espèces',
  money_transfer:    'transfert argent Western Union MoneyGram Ria envoi mandat cash',
  optician:          'opticien optician lunetterie eye care glasses',
  photo_spot:        'belvédère panorama viewpoint mirador terrasse panoramique',
  shooting:          'stand de tir armurerie shooting range gun range',
  laser_game:        'laser game lasertag laser tag paintball',
  karting:           'karting go kart circuit kart',
  taxi_vtc:          'taxi VTC Uber Bolt chauffeur transport',
  currency_exchange: 'bureau de change currency exchange money changer forex',
  // Beauté
  lash_studio:          'cils sourcils extension cils lash bar institut cils microblading',
  esthetics:            'institut beauté esthétique soin visage épilation peeling',
  tattoo:               'tatouage tattoo studio piercing tatoueur',
  yoga_studio:          'yoga pilates méditation studio yoga cours stretching',
  tanning_studio:       'bronzage UV solarium centre bronzage suncare',
  makeup_studio:        'maquillage makeup artist studio coiffure relooking beauté',
  // Shopping
  lingerie:             'lingerie dessous sous-vêtements mode intime femme',
  vintage_store:        'vintage friperie seconde main dépôt-vente brocante mode',
  luxury_store:         'luxe haute couture boutique luxe Chanel Dior Louis Vuitton',
  // Santé
  mental_health:        'psychologue psychiatre thérapeute psychanalyste cabinet psy',
  laboratory:           'laboratoire analyses médicales prises de sang labo bilan',
  alternative_medicine: 'naturopathie acupuncture ostéopathie médecine douce homéopathie',
  // Manger & Boire
  brunch:               'brunch petit déjeuner tardif brunch café brunch restaurant',
  juice_bar:            'jus smoothie bar à jus acai bowl detox fresh juice',
  food_truck:           'food truck street food camion restaurant mobile cuisine rue',
  // Bars & Soirées
  comedy_club:          'comedy club stand up spectacle humour one-man-show comédie',
  // Nature
  camping:              'camping bivouac camping sauvage tente campsite',
  botanical_garden:     'jardin botanique jardin fleuri parc floral roseraie arboretum',
  picnic_area:          'aire pique-nique parc espace vert pelouse détente nature',
  // Transport
  car_rental:           'location voiture car rental Hertz Europcar Avis rent a car',
  campground:           'camping glamping hébergement insolite cabane lodge nature',
  port:                 'port marina port de plaisance quai bateau embarcadère',
  // Services
  post_office:          'poste bureau de poste Colissimo colis envoi courrier',
  locksmith:            'serrurier locksmith dépannage serrure clé urgence ouverture porte',
  phone_repair:         'réparation téléphone smartphone écran cassé phone repair GSM mobile',
  car_inspection:       'contrôle technique automobile vehicle inspection centre contrôle Dekra Autosur MOT ITV',
  // Automobile
  car_dealership:       'concessionnaire automobile concession voiture neuve garage vente',
  tire_shop:            'pneus centre pneus pneumatiques Euromaster Norauto roues',
  motorcycle:           'moto scooter concession moto deux-roues Honda Yamaha Kawasaki',
  // Activités
  tobacco:              'tabac presse bureau tabac tabaccheria estanco',
  jetski:               'jet ski jetski location nautique ski nautique motomarines',
  quad:                 'quad ATV tout-terrain location quad buggy aventure',
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
  hookah:           ['hookah_bar'], // 'bar' retiré : polluait avec des bars génériques (reclassés en 'bar')
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
  hiking:           ['hiking_area', 'park', 'national_park'],
  natural_site:     ['national_park', 'nature_reserve', 'geological_formation'],
  waterspot:        ['lake', 'river', 'bay', 'beach'],
  // Sport & Loisirs
  fitness:          ['sports_club', 'sports_complex', 'tennis_court', 'stadium'],
  gym:              ['gym', 'fitness_center'],
  aquatic:          ['swimming_pool', 'water_park'],
  jetski:           ['marina', 'boat_rental'],
  quad:             ['off_roading_area', 'park'],
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
  lash_studio:      ['beauty_salon'],
  esthetics:        ['beauty_salon', 'skin_care_clinic'],
  tattoo:           ['tattoo_parlor'],
  yoga_studio:      ['yoga_studio', 'fitness_center'],
  tanning_studio:   ['tanning_studio', 'beauty_salon'],
  makeup_studio:    ['beauty_salon'],
  florist:          ['florist'],
  // Shopping & Commerce
  shopping:         ['clothing_store', 'department_store'],
  mall:             ['shopping_mall'],
  bookstore:        ['book_store'],
  jewelry:          ['jewelry_store'],
  perfume_cosmetics:['cosmetics_store', 'perfume_store'],
  lingerie:         ['clothing_store'],
  vintage_store:    ['clothing_store', 'second_hand_store', 'thrift_store'],
  luxury_store:     ['clothing_store', 'jewelry_store', 'department_store'],
  // Santé
  pharmacy:         ['pharmacy', 'drugstore'],
  doctor:           ['doctor', 'dentist', 'dental_clinic', 'medical_clinic', 'physiotherapist'],
  hospital:         ['hospital'],
  vet:              ['veterinary_care'],
  optician:         ['optician', 'eye_care'],
  mental_health:    ['psychologist', 'mental_health_service', 'doctor'],
  laboratory:       ['medical_lab', 'laboratory'],
  alternative_medicine: ['naturopath', 'acupuncture_clinic', 'doctor'],
  // Stations & Services
  fuel:             ['gas_station', 'electric_vehicle_charging_station'],
  laundry:          ['laundry'],
  tobacco:          ['tobacco_shop', 'convenience_store'],
  post_office:      ['post_office'],
  brunch:           ['cafe', 'restaurant'],
  juice_bar:        ['juice_bar', 'cafe'],
  food_truck:       ['food_truck', 'street_food_gathering'],
  comedy_club:      ['comedy_club'],
  camping:          ['campsite', 'rv_park'],
  botanical_garden: ['botanical_garden', 'park'],
  picnic_area:      ['picnic_ground', 'park'],
  // Sport urbain
  skatepark:        ['skateboard_park'],
  cannabis:         ['cannabis_store'],
  shooting:         ['shooting_range', 'gun_store'],
  // Automobile & Moto
  garage:           ['car_repair'],
  car_wash:         ['car_wash'],
  car_dealership:   ['car_dealer'],
  tire_shop:        ['tire_shop'],
  motorcycle:       ['motorcycle_dealer', 'motorcycle_repair'],
  // Sécurité
  police:           ['police'],
  // Culte & Services
  place_of_worship: ['church', 'mosque', 'synagogue', 'hindu_temple'],
  library:          ['library'],
  coworking:        ['coworking_space'],
  // Transport & Mobilité
  taxi_vtc:         ['taxi_stand'],
  gare:             ['train_station', 'transit_station', 'subway_station', 'bus_station', 'light_rail_station'],
  airport:          ['airport', 'international_airport'],
  parking:          ['parking'],
  hotel:            ['lodging', 'hotel', 'motel', 'hostel', 'resort_hotel'],
  car_rental:       ['car_rental'],
  campground:       ['campground', 'rv_park', 'campsite'],
  port:             ['marina', 'harbor', 'boat_club'],
  // Services du quotidien
  atm:              ['atm'],
  currency_exchange:['currency_exchange'],
  money_transfer:   [], // aucun type Google — géré par text-search (voir TEXT_FIRST_UNIVERSES)
  bank:             ['bank'],
  locksmith:        ['locksmith'],
  phone_repair:     ['cell_phone_store'],
  // Automobile (suite)
  ev_charging:      ['electric_vehicle_charging_station'],
  auto_parts:       ['auto_parts_store'],
  car_inspection:   [], // pas de type Table A fiable — text-search (TEXT_FIRST_UNIVERSES)
  // Événements
  event_venue:      ['event_venue', 'stadium', 'amphitheatre', 'convention_center'],
};

/** Recherche large par défaut quand aucun univers n'est précisé (home/explore). */
const DEFAULT_TYPES = ['restaurant', 'cafe', 'bar', 'bakery', 'tourist_attraction', 'museum'];

/**
 * Univers « niche » dont les types Google sont absents ou trop génériques
 * (ils reclasseraient les résultats). On les hydrate directement par recherche
 * textuelle géolocalisée avec `forceUniverse`, sans passer par `searchNearby`.
 *  - hookah          : `hookah_bar` rare/invalide → les bars génériques polluaient
 *  - currency_exchange : type Google invalide (INVALID_ARGUMENT)
 *  - money_transfer  : aucun type Google (Western Union/Ria souvent dans un commerce)
 */
export const TEXT_FIRST_UNIVERSES = new Set<Universe>([
  'hookah',
  'currency_exchange',
  'money_transfer',
  'car_inspection', // pas de type Google Table A fiable
]);

/**
 * Univers de service où les types « bloqués » compagnons (banque, finance…)
 * sont légitimes : un ATM est souvent adossé à une banque, un bureau de change
 * ou un point Western Union à un commerce. On ne les écarte donc pas.
 */
const BLOCK_EXEMPT_UNIVERSES = new Set<Universe>([
  'atm',
  'currency_exchange',
  'money_transfer',
  // Univers dont les types Google demandés figurent AUSSI dans la liste bloquée
  // (bloquée pour éviter la pollution des AUTRES univers) : sans exemption,
  // ces univers ne peuvent persister aucun lieu.
  'car_rental',     // 'car_rental' est bloqué globalement
  'car_dealership', // 'car_dealer' est bloqué globalement
  'tobacco',        // la plupart des tabacs sont taggés 'convenience_store'
  'bank',           // 'bank' est bloqué globalement (pollution des autres univers)
  'auto_parts',     // 'auto_parts_store' est bloqué globalement
]);

/** Types Google à exclure de l'hydratation (épiceries, banques…). */
export const BLOCKED_GOOGLE_TYPES = new Set([
  'convenience_store',
  'supermarket',
  'grocery_or_supermarket',
  'dry_cleaning',
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

/**
 * Renvoie true si le lieu doit être écarté (épicerie, banque, grande surface…).
 * Exception : pour les univers de service (ATM, change, transfert d'argent),
 * les tags banque/finance sont attendus → on ne bloque pas.
 */
export function isBlockedPlace(types: string[], universe?: Universe): boolean {
  if (universe && BLOCK_EXEMPT_UNIVERSES.has(universe)) return false;
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
  ['hiking_area',           'hiking'],
  ['lake',                  'waterspot'],
  ['river',                 'waterspot'],
  ['bay',                   'waterspot'],
  ['geological_formation',  'natural_site'],
  ['nature_reserve',        'natural_site'],
  ['national_park',         'natural_site'],
  ['park',                  'park'],
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
  ['amusement_center',      'escape_game'],
  ['bowling_alley',         'bowling'],
  ['water_park',            'aquatic'],
  ['swimming_pool',         'aquatic'],
  ['marina',                'jetski'],
  ['boat_rental',           'jetski'],
  ['off_roading_area',      'quad'],
  ['casino',                'casino'],
  ['skateboard_park',       'skatepark'],
  // Bien-être & Beauté — types spécifiques AVANT spa/beauty_salon
  ['tattoo_parlor',         'tattoo'],
  ['nail_salon',            'nail_salon'],
  ['barber_shop',           'barber'],
  ['hair_salon',            'hair_salon'],
  ['hair_care',             'hair_salon'],
  ['skin_care_clinic',      'esthetics'],
  ['massage',               'massage'],
  ['spa',                   'spa'],
  ['beauty_salon',          'esthetics'],  // instituts → esthetics (plus précis que spa)
  // Shopping & Commerce
  ['shopping_mall',         'mall'],
  ['department_store',      'mall'],
  ['clothing_store',        'shopping'],
  ['shoe_store',            'shopping'],
  ['cosmetics_store',       'perfume_cosmetics'],
  ['perfume_store',         'perfume_cosmetics'],
  ['beauty_products',       'perfume_cosmetics'],
  ['book_store',            'bookstore'],
  ['florist',               'florist'],
  ['jewelry_store',         'jewelry'],
  ['market',                'shopping'],
  ['farmer_market',         'shopping'],
  ['liquor_store',          'wine_cellar'],
  ['tobacco_shop',          'tobacco'],
  ['juice_bar',             'juice_bar'],
  ['food_truck',            'food_truck'],
  ['comedy_club',           'comedy_club'],
  ['campsite',              'camping'],
  ['rv_park',               'camping'],
  ['botanical_garden',      'botanical_garden'],
  ['picnic_ground',         'picnic_area'],
  ['yoga_studio',           'yoga_studio'],
  ['tanning_studio',        'tanning_studio'],
  ['tattoo_parlor',         'tattoo'],
  ['second_hand_store',     'vintage_store'],
  ['thrift_store',          'vintage_store'],
  ['post_office',           'post_office'],
  ['car_rental',            'car_rental'],
  ['campground',            'campground'],
  ['harbor',                'port'],
  ['boat_club',             'port'],
  ['car_dealer',            'car_dealership'],
  ['tire_shop',             'tire_shop'],
  ['motorcycle_dealer',     'motorcycle'],
  ['motorcycle_repair',     'motorcycle'],
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
  ['electric_vehicle_charging_station', 'ev_charging'], // univers dédié (avant : fuel)
  ['laundry',               'laundry'],
  ['bank',                  'bank'],
  ['locksmith',             'locksmith'],
  ['cell_phone_store',      'phone_repair'],
  ['auto_parts_store',      'auto_parts'],
  // Cannabis & Tir
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
  ['airport',               'airport'],
  ['international_airport', 'airport'],
  ['parking',               'parking'],
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
