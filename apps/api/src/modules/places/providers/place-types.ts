import { UNIVERSES, type Universe } from '@yumia/shared';

/**
 * Univers YUMIA ⇄ Google Places (API « New »).
 *
 * Un lieu n'a qu'UN univers en base. Deux règles tiennent tout le fichier :
 *
 * 1. Le classement d'un lieu ne dépend que de LUI (son nom, ses types), jamais
 *    de la recherche qui l'a trouvé — voir {@link classifyGooglePlace}. Avant
 *    (17/11/2026), « l'univers demandé l'emporte » faisait changer un lieu
 *    d'univers au gré des recherches : un bar-tabac passait de Tabac à Bars
 *    dès que quelqu'un ouvrait les bars de son quartier.
 *
 * 2. Un univers ne demande à Google que les types qui le DÉFINISSENT. Les
 *    types « compagnons » (demander `bar` pour remplir Rooftops, `park` pour
 *    Quad, `clothing_store` pour Lingerie) y rangeaient tous les bars, tous
 *    les parcs, toutes les boutiques. Un univers sans type Google à lui passe
 *    par une recherche textuelle ({@link TEXT_FIRST_UNIVERSES}).
 *
 * Types vérifiés sur la « Table A » de Google le 17/11/2026. Un type refusé
 * (400 INVALID_ARGUMENT) est retiré de la requête et celle-ci rejouée, voir
 * `GooglePlacesProvider.request`.
 */

/**
 * Requêtes textuelles géolocalisées.
 *
 * Une valeur `string[]` déclenche plusieurs appels Text Search (un par entrée,
 * fusionnés + dédupliqués) plutôt qu'un seul. Nécessaire quand la liste de
 * synonymes est longue : Google Text Search traite tout le `textQuery` comme
 * UNE seule phrase à faire correspondre (pas un OR de mots-clés) — au-delà
 * d'une poignée de mots, la pertinence s'effondre et ne renvoie presque plus
 * rien (constaté avec `waterspot` : 17 mots concaténés → 1 seul résultat brut
 * quel que soit le rayon). Découper en 2-3 groupes courts et cohérents résout
 * le problème, au prix de plusieurs appels Pro-tier au lieu d'un seul.
 */
export const UNIVERSE_TEXT_QUERIES: Partial<Record<Universe, string | string[]>> = {
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
  makeup_studio:        'maquillage makeup artist relooking',
  // Shopping
  lingerie:             'boutique lingerie sous-vêtements',
  vintage_store:        'vintage friperie seconde main dépôt-vente brocante mode',
  luxury_store:         'luxe haute couture boutique luxe Chanel Dior Louis Vuitton',
  // Épiceries de quartier : en plus des types (voir TEXT_ALSO_UNIVERSES).
  // Deux requêtes COURTES (18/11/2026) : la phrase unique « épicerie
  // alimentation générale » ne remontait presque rien de local à Cergy, et
  // aucune des épiceries que Google Maps affiche pour « épicerie » (Proxi,
  // épiceries exotiques, supérettes Lycamobile…).
  grocery_store:        ['épicerie', 'alimentation générale'],
  // Santé
  mental_health:        'psychologue psychiatre thérapeute psychanalyste cabinet psy',
  laboratory:           'laboratoire analyses médicales prises de sang labo bilan',
  alternative_medicine: 'naturopathie acupuncture ostéopathie médecine douce homéopathie',
  // Manger & Boire
  brunch:               'brunch',
  juice_bar:            'jus smoothie bar à jus acai bowl detox fresh juice',
  food_truck:           'food truck street food camion restaurant mobile cuisine rue',
  // Bars & Soirées
  rooftop:              'rooftop bar',
  comedy_club:          'comedy club stand up spectacle humour one-man-show comédie',
  // Nature
  camping:              'camping bivouac camping sauvage tente campsite',
  botanical_garden:     'jardin botanique jardin fleuri parc floral roseraie arboretum',
  picnic_area:          'aire pique-nique parc espace vert pelouse détente nature',
  waterspot:            ['cascade lac rivière source', 'crique baie lagon fjord île', 'gorge glacier canal estuaire marais étang', 'spot de plongée spot de pêche'],
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
  tobacco:              ['bureau de tabac presse', 'tobacco shop tabaccheria estanco'],
  jetski:               'jet ski jetski location nautique ski nautique motomarines',
  quad:                 'quad ATV tout-terrain location quad buggy aventure',
  escape_game:          'escape game escape room',
};

/**
 * Types Google qui DÉFINISSENT chaque univers : un lieu qui en porte un y a
 * sa place. Jamais de type générique « pour avoir des résultats » (règle 2).
 * Liste vide = aucun type Google propre → recherche textuelle seule.
 */
const UNIVERSE_TO_GOOGLE_TYPES: Record<Universe, string[]> = {
  // Manger & Boire
  restaurant:       ['restaurant', 'fast_food_restaurant'], // fast_food fusionné ici
  cafe:             ['cafe', 'coffee_shop'],
  bakery:           ['bakery'],
  brunch:           ['brunch_restaurant'],
  dessert:          ['dessert_shop', 'dessert_restaurant', 'pastry_shop', 'cake_shop', 'donut_shop'],
  ice_cream:        ['ice_cream_shop'],
  chocolatier:      ['chocolate_shop', 'candy_store', 'confectionery'],
  wine_cellar:      ['liquor_store'],
  tea_house:        ['tea_house'],
  juice_bar:        ['juice_shop', 'acai_shop'],
  food_truck:       [],
  butcher:          ['butcher_shop'],
  // Bars & Soirées
  bar:              ['bar', 'wine_bar', 'cocktail_bar', 'lounge_bar', 'sports_bar'],
  pub:              ['pub', 'irish_pub', 'gastropub', 'brewpub'],
  nightclub:        ['night_club'],
  hookah:           ['hookah_bar'],
  live_music:       ['live_music_venue'],
  rooftop:          [],
  karaoke:          ['karaoke'],
  comedy_club:      ['comedy_club'],
  // Culture & Tourisme
  museum:           ['museum', 'art_gallery', 'art_museum', 'history_museum'],
  monument:         ['historical_landmark', 'monument', 'historical_place', 'cultural_landmark', 'castle'],
  tourist_activity: ['tourist_attraction'],
  cultural_outing:  ['concert_hall', 'cultural_center', 'opera_house', 'philharmonic_hall', 'auditorium'],
  cinema:           ['movie_theater'],
  zoo:              ['zoo', 'aquarium', 'wildlife_park'],
  amusement_park:   ['amusement_park', 'amusement_center'],
  photo_spot:       ['observation_deck', 'scenic_spot'],
  // Nature & Plein air
  park:             ['park', 'city_park', 'state_park', 'garden'],
  beach:            ['beach'],
  hiking:           ['hiking_area'],
  natural_site:     ['national_park', 'nature_preserve', 'wildlife_refuge', 'mountain_peak'],
  waterspot:        ['lake', 'river'],
  camping:          ['campground', 'rv_park'],
  botanical_garden: ['botanical_garden'],
  picnic_area:      ['picnic_ground', 'barbecue_area'],
  // Sport & Loisirs
  fitness:          ['sports_club', 'sports_complex', 'tennis_court', 'athletic_field'],
  gym:              ['gym', 'fitness_center'],
  aquatic:          ['swimming_pool', 'water_park'],
  jetski:           [],
  quad:             ['off_roading_area'],
  escape_game:      [],
  laser_game:       ['paintball_center'],
  karting:          ['go_karting_venue'],
  bowling:          ['bowling_alley'],
  casino:           ['casino'],
  skatepark:        ['skateboard_park'],
  cannabis:         ['cannabis_store'],
  shooting:         ['shooting_range', 'gun_store'],
  // Bien-être & Beauté
  spa:              ['spa', 'sauna'],
  massage:          ['massage', 'massage_spa'],
  nail_salon:       ['nail_salon'],
  hair_salon:       ['hair_salon', 'hair_care'],
  barber:           ['barber_shop'],
  lash_studio:      [],
  esthetics:        ['beauty_salon', 'skin_care_clinic', 'beautician'],
  tattoo:           ['body_art_service'],
  yoga_studio:      ['yoga_studio'],
  tanning_studio:   ['tanning_studio'],
  makeup_studio:    ['makeup_artist'],
  florist:          ['florist'],
  // Shopping & Commerce
  shopping:         ['clothing_store', 'shoe_store', 'womens_clothing_store'],
  mall:             ['shopping_mall', 'department_store'],
  bookstore:        ['book_store'],
  jewelry:          ['jewelry_store'],
  perfume_cosmetics:['cosmetics_store'],
  lingerie:         [],
  vintage_store:    ['thrift_store'],
  luxury_store:     [],
  // Santé
  pharmacy:         ['pharmacy', 'drugstore'],
  doctor:           ['doctor', 'dentist', 'dental_clinic', 'medical_clinic', 'medical_center', 'physiotherapist'],
  hospital:         ['hospital', 'general_hospital'],
  vet:              ['veterinary_care'],
  optician:         [],
  mental_health:    [],
  laboratory:       ['medical_lab'],
  alternative_medicine: ['chiropractor'],
  // Stations & Services
  fuel:             ['gas_station'],
  laundry:          ['laundry'],
  tobacco:          ['tobacco_shop'],
  post_office:      ['post_office'],
  // Sport urbain
  // Automobile & Moto
  garage:           ['car_repair'],
  car_wash:         ['car_wash'],
  car_dealership:   ['car_dealer'],
  tire_shop:        ['tire_shop'],
  motorcycle:       ['motorcycle_dealer', 'motorcycle_repair'],
  // Sécurité
  police:           ['police'],
  // Culte & Services
  place_of_worship: ['church', 'mosque', 'synagogue', 'hindu_temple', 'buddhist_temple', 'shinto_shrine'],
  library:          ['library'],
  travel_agency:    ['travel_agency', 'tour_agency'],
  supermarket:      ['supermarket', 'hypermarket', 'discount_supermarket', 'warehouse_store'],
  // Épiceries de quartier : `convenience_store` est leur type le plus courant.
  grocery_store:    ['grocery_store', 'convenience_store', 'asian_grocery_store'],
  pet_store:        ['pet_store'],
  sporting_goods:   ['sporting_goods_store'],
  city_hall:        ['city_hall', 'local_government_office'],
  fire_station:     ['fire_station'],
  theater:          ['performing_arts_theater'],
  coworking:        ['coworking_space'],
  // Transport & Mobilité
  taxi_vtc:         ['taxi_stand', 'taxi_service'],
  gare:             ['train_station', 'transit_station', 'subway_station', 'bus_station', 'light_rail_station'],
  airport:          ['airport', 'international_airport'],
  parking:          ['parking', 'parking_garage', 'parking_lot'],
  hotel:            ['lodging', 'hotel', 'motel', 'hostel', 'resort_hotel', 'bed_and_breakfast', 'guest_house', 'inn'],
  car_rental:       ['car_rental'],
  campground:       ['camping_cabin'],
  port:             ['marina', 'ferry_terminal'],
  // Services du quotidien
  atm:              ['atm'],
  currency_exchange:[],
  money_transfer:   [],
  bank:             ['bank'],
  locksmith:        ['locksmith'],
  phone_repair:     ['cell_phone_store'],
  // Automobile (suite)
  ev_charging:      ['electric_vehicle_charging_station'],
  auto_parts:       ['auto_parts_store'],
  car_inspection:   [],
  // Événements
  event_venue:      ['event_venue', 'stadium', 'arena', 'amphitheatre', 'convention_center'],
};

/** Recherche large par défaut quand aucun univers n'est précisé (home/explore). */
const DEFAULT_TYPES = ['restaurant', 'cafe', 'bar', 'bakery', 'tourist_attraction', 'museum'];

/**
 * Univers définis par un MOT plus que par un type Google : on les hydrate par
 * recherche textuelle géolocalisée, et chaque résultat prend l'univers demandé
 * (un rooftop reste typé `bar`, un coffeeshop `cafe`).
 *
 *  - type Google absent ou refusé : tobacco, cannabis, optician, food_truck,
 *    currency_exchange, money_transfer, car_inspection, mental_health… ;
 *  - type trop rare pour remplir l'univers : hookah, karting, laser_game,
 *    quad, juice_bar, tattoo, waterspot ;
 *  - notion sans type : rooftop, brunch, lingerie, luxury_store, lash_studio,
 *    makeup_studio, escape_game, jetski, vintage_store, campground.
 */
export const TEXT_FIRST_UNIVERSES = new Set<Universe>([
  'hookah',
  'currency_exchange',
  'money_transfer',
  'car_inspection',
  'waterspot',
  'tobacco',
  'cannabis',
  'optician',
  'food_truck',
  'rooftop',
  'brunch',
  'juice_bar',
  'escape_game',
  'laser_game',
  'karting',
  'quad',
  'jetski',
  'lash_studio',
  'makeup_studio',
  'tattoo',
  'lingerie',
  'vintage_store',
  'luxury_store',
  'mental_health',
  'alternative_medicine',
  'campground',
]);

/**
 * Univers hydratés par leurs types ET par leur requête textuelle (deux appels
 * Google par zone neuve). Réservé aux épiceries de quartier : Google en type
 * une bonne part `supermarket`, et classe les grandes enseignes en tête de
 * toute recherche par type.
 */
export const TEXT_ALSO_UNIVERSES = new Set<Universe>(['grocery_store']);

/**
 * Univers alimentés par recherche textuelle forcée. Rien dans les types du
 * lieu ne dit qu'il leur appartient : une fois rangé là, un lieu y reste —
 * sinon la première recherche par type (bars, cafés…) l'en ressortirait.
 * Voir `PlacesService.persistProviderPlaces`.
 */
export const KEYWORD_UNIVERSES = new Set<Universe>([
  ...TEXT_FIRST_UNIVERSES,
  // Types incertains : si Google les refuse, ces univers passent en texte.
  'shooting',
  'motorcycle',
]);

/**
 * Version d'hydratation par univers (clé de tuile Redis). Changer la façon
 * d'interroger Google pour un univers ne recharge que LUI : ses zones déjà
 * « chargées » le seraient avec l'ancienne recherche. Absent = 'v6'.
 */
const HYDRATION_VERSIONS: Partial<Record<Universe, string>> = Object.fromEntries(
  ([
    // 17/11/2026 — types compagnons retirés, univers passés en texte.
    'tobacco', 'grocery_store', 'supermarket', 'rooftop', 'brunch', 'dessert', 'tea_house', 'juice_bar',
    'pub', 'live_music', 'hiking', 'natural_site', 'quad', 'botanical_garden', 'picnic_area', 'jetski',
    'escape_game', 'laser_game', 'karting', 'yoga_studio', 'tanning_studio', 'lash_studio',
    'makeup_studio', 'tattoo', 'lingerie', 'vintage_store', 'luxury_store', 'perfume_cosmetics',
    'mental_health', 'alternative_medicine', 'laboratory', 'camping', 'campground', 'port',
    'cultural_outing', 'theater', 'photo_spot', 'cafe', 'fuel', 'monument', 'fitness',
  ] as Universe[]).map((u) => [u, 'v7']),
);

/**
 * 18/11/2026 — épiceries : recherche au plus près (DISTANCE), zone stricte,
 * deux requêtes courtes ; supermarchés : les grandes surfaces sorties des
 * épiceries y arrivent. Seuls ces deux univers sont rechargés.
 */
HYDRATION_VERSIONS.grocery_store = 'v8';
HYDRATION_VERSIONS.supermarket = 'v8';

/**
 * Univers dont les recherches Google se font au plus près (`DISTANCE`) dans
 * une zone stricte, au lieu de « les plus populaires » : sinon les grandes
 * surfaces occupent les 20 places et les commerces de quartier n'arrivent
 * jamais.
 */
export const NEAREST_FIRST_UNIVERSES = new Set<Universe>(['grocery_store']);

export function hydrationVersion(universe?: Universe): string {
  return (universe && HYDRATION_VERSIONS[universe]) || 'v6';
}

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
  // 'supermarket' et 'grocery_or_supermarket' sont bloqués globalement (ils
  // polluaient les univers restauration/shopping). Ils restent bloqués
  // partout ailleurs, mais sont légitimes quand l'utilisateur demande
  // explicitement ces deux univers-là.
  'supermarket',
  'grocery_store',
  // 'sporting_goods_store' est bloqué globalement (grande surface non-
  // expérience) mais légitime pour l'univers 'sporting_goods' dédié.
  'sporting_goods',
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
 * Type Google → univers. Le lieu est classé d'après le premier de SES types
 * qui figure ici (Google donne le type principal en premier), avec deux
 * nuances : voir {@link universeFromTypes}.
 */
const GOOGLE_TYPE_TO_UNIVERSE: Array<[string, Universe]> = [
  // Manger & Boire
  ['ice_cream_shop',        'ice_cream'],
  ['chocolate_shop',        'chocolatier'],
  ['confectionery',         'chocolatier'],
  ['candy_store',           'chocolatier'],
  ['dessert_shop',          'dessert'],
  ['dessert_restaurant',    'dessert'],
  ['pastry_shop',           'dessert'],
  ['cake_shop',             'dessert'],
  ['donut_shop',            'dessert'],
  ['bakery',                'bakery'],
  ['butcher_shop',          'butcher'],
  ['brunch_restaurant',     'brunch'],
  ['fast_food_restaurant',  'restaurant'], // fast_food → restaurant (fusionné)
  ['bubble_tea_store',      'cafe'],  // bubble_tea → cafe (fusionné)
  ['coffee_shop',           'cafe'],
  ['cafe',                  'cafe'],
  ['tea_house',             'tea_house'],
  ['juice_shop',            'juice_bar'],
  ['acai_shop',             'juice_bar'],
  ['juice_bar',             'juice_bar'],
  ['food_truck',            'food_truck'],
  ['liquor_store',          'wine_cellar'],
  // Bars & Soirées
  ['hookah_bar',            'hookah'],
  ['live_music_venue',      'live_music'],
  ['night_club',            'nightclub'],
  ['pub',                   'pub'],
  ['irish_pub',             'pub'],
  ['gastropub',             'pub'],
  ['brewpub',               'pub'],
  ['karaoke',               'karaoke'],
  ['comedy_club',           'comedy_club'],
  ['wine_bar',              'bar'],
  ['cocktail_bar',          'bar'],
  ['lounge_bar',            'bar'],
  ['sports_bar',            'bar'],
  // Culture & Tourisme
  ['art_gallery',           'museum'],   // fusionné dans museum
  ['art_museum',            'museum'],
  ['history_museum',        'museum'],
  ['museum',                'museum'],
  ['historical_landmark',   'monument'],
  ['historical_place',      'monument'],
  ['cultural_landmark',     'monument'],
  ['castle',                'monument'],
  ['monument',              'monument'],
  ['scenic_viewpoint',      'photo_spot'],
  ['scenic_spot',           'photo_spot'],
  ['observation_deck',      'photo_spot'],
  ['performing_arts_theater', 'theater'],
  ['concert_hall',          'cultural_outing'],
  ['cultural_center',       'cultural_outing'],
  ['opera_house',           'cultural_outing'],
  ['philharmonic_hall',     'cultural_outing'],
  ['auditorium',            'cultural_outing'],
  ['event_venue',           'event_venue'],
  ['stadium',               'event_venue'],
  ['arena',                 'event_venue'],
  ['amphitheatre',          'event_venue'],
  ['convention_center',     'event_venue'],
  ['movie_theater',         'cinema'],
  ['amusement_park',        'amusement_park'],
  // Salles de jeux, trampolines, arcades : c'était « Escape Games », à tort.
  ['amusement_center',      'amusement_park'],
  ['zoo',                   'zoo'],
  ['aquarium',              'zoo'],
  ['wildlife_park',         'zoo'],
  // Nature & Plein air
  ['beach',                 'beach'],
  ['hiking_area',           'hiking'],
  ['lake',                  'waterspot'],
  ['river',                 'waterspot'],
  ['nature_preserve',       'natural_site'],
  ['wildlife_refuge',       'natural_site'],
  ['mountain_peak',         'natural_site'],
  ['national_park',         'natural_site'],
  ['botanical_garden',      'botanical_garden'],
  ['picnic_ground',         'picnic_area'],
  ['barbecue_area',         'picnic_area'],
  ['city_park',             'park'],
  ['state_park',            'park'],
  ['dog_park',              'park'],
  ['garden',                'park'],
  ['park',                  'park'],
  ['tourist_attraction',    'tourist_activity'],
  // Sport & Loisirs
  ['paintball_center',      'laser_game'],
  ['laser_tag_center',      'laser_game'],
  ['go_karting_venue',      'karting'],
  ['go_kart_track',         'karting'],
  ['fitness_center',        'gym'],
  ['gym',                   'gym'],
  ['sports_complex',        'fitness'],
  ['tennis_court',          'fitness'],
  ['athletic_field',        'fitness'],
  ['sports_club',           'fitness'],
  ['bowling_alley',         'bowling'],
  ['water_park',            'aquatic'],
  ['swimming_pool',         'aquatic'],
  ['off_roading_area',      'quad'],
  ['casino',                'casino'],
  ['skateboard_park',       'skatepark'],
  // Bien-être & Beauté
  ['body_art_service',      'tattoo'],
  ['tattoo_parlor',         'tattoo'],
  ['nail_salon',            'nail_salon'],
  ['barber_shop',           'barber'],
  ['hair_salon',            'hair_salon'],
  ['hair_care',             'hair_salon'],
  ['skin_care_clinic',      'esthetics'],
  ['massage',               'massage'],
  ['massage_spa',           'massage'],
  ['sauna',                 'spa'],
  ['spa',                   'spa'],
  ['makeup_artist',         'makeup_studio'],
  ['beautician',            'esthetics'],
  ['beauty_salon',          'esthetics'],
  ['yoga_studio',           'yoga_studio'],
  ['tanning_studio',        'tanning_studio'],
  // Shopping & Commerce
  ['shopping_mall',         'mall'],
  ['department_store',      'mall'],
  ['thrift_store',          'vintage_store'],
  ['second_hand_store',     'vintage_store'],
  ['clothing_store',        'shopping'],
  ['womens_clothing_store', 'shopping'],
  ['shoe_store',            'shopping'],
  ['cosmetics_store',       'perfume_cosmetics'],
  ['perfume_store',         'perfume_cosmetics'],
  ['beauty_products',       'perfume_cosmetics'],
  ['book_store',            'bookstore'],
  ['florist',               'florist'],
  ['jewelry_store',         'jewelry'],
  ['market',                'shopping'],
  ['farmers_market',        'shopping'],
  ['farmer_market',         'shopping'],
  // Alimentation : départagée ensuite par groceryFamily (enseigne, format).
  ['hypermarket',           'supermarket'],
  ['discount_supermarket',  'supermarket'],
  ['warehouse_store',       'supermarket'],
  ['supermarket',           'supermarket'],
  ['grocery_store',         'grocery_store'],
  ['asian_grocery_store',   'grocery_store'],
  ['convenience_store',     'grocery_store'],
  ['food_store',            'grocery_store'],
  ['travel_agency',         'travel_agency'],
  ['tour_agency',           'travel_agency'],
  ['pet_store',             'pet_store'],
  ['sporting_goods_store',  'sporting_goods'],
  ['city_hall',             'city_hall'],
  ['local_government_office', 'city_hall'],
  ['fire_station',          'fire_station'],
  ['tobacco_shop',          'tobacco'],
  ['post_office',           'post_office'],
  // Santé
  ['general_hospital',      'hospital'],
  ['hospital',              'hospital'],
  ['chiropractor',          'alternative_medicine'],
  ['medical_lab',           'laboratory'],
  ['doctor',                'doctor'],
  ['dentist',               'doctor'],
  ['dental_clinic',         'doctor'],
  ['medical_clinic',        'doctor'],
  ['medical_center',        'doctor'],
  ['physiotherapist',       'doctor'],
  ['pharmacy',              'pharmacy'],
  ['drugstore',             'pharmacy'],
  ['veterinary_care',       'vet'],
  ['optician',              'optician'],
  ['eye_care',              'optician'],
  // Stations & Services
  ['gas_station',           'fuel'],
  ['electric_vehicle_charging_station', 'ev_charging'],
  ['laundry',               'laundry'],
  ['bank',                  'bank'],
  ['atm',                   'atm'],
  ['locksmith',             'locksmith'],
  ['cell_phone_store',      'phone_repair'],
  ['auto_parts_store',      'auto_parts'],
  ['cannabis_store',        'cannabis'],
  ['shooting_range',        'shooting'],
  ['gun_store',             'shooting'],
  ['car_repair',            'garage'],
  ['car_wash',              'car_wash'],
  ['car_dealer',            'car_dealership'],
  ['car_rental',            'car_rental'],
  ['tire_shop',             'tire_shop'],
  ['motorcycle_dealer',     'motorcycle'],
  ['motorcycle_repair',     'motorcycle'],
  ['police_station',        'police'],
  ['police',                'police'],
  ['coworking_space',       'coworking'],
  ['library',               'library'],
  // Culte
  ['church',                'place_of_worship'],
  ['mosque',                'place_of_worship'],
  ['synagogue',             'place_of_worship'],
  ['hindu_temple',          'place_of_worship'],
  ['buddhist_temple',       'place_of_worship'],
  ['shinto_shrine',         'place_of_worship'],
  // Transport & Hébergement
  ['international_airport', 'airport'],
  ['airport',               'airport'],
  ['parking',               'parking'],
  ['parking_garage',        'parking'],
  ['parking_lot',           'parking'],
  ['taxi_stand',            'taxi_vtc'],
  ['taxi_service',          'taxi_vtc'],
  ['train_station',         'gare'],
  ['transit_station',       'gare'],
  ['subway_station',        'gare'],
  ['bus_station',           'gare'],
  ['light_rail_station',    'gare'],
  // Les ports de plaisance étaient rangés en « Jet ski ».
  ['marina',                'port'],
  ['ferry_terminal',        'port'],
  ['harbor',                'port'],
  ['campground',            'camping'],
  ['campsite',              'camping'],
  ['rv_park',               'camping'],
  ['camping_cabin',         'campground'],
  ['lodging',               'hotel'],
  ['hotel',                 'hotel'],
  ['motel',                 'hotel'],
  ['hostel',                'hotel'],
  ['resort_hotel',          'hotel'],
  ['bed_and_breakfast',     'hotel'],
  ['guest_house',           'hotel'],
  ['inn',                   'hotel'],
  // Générique
  ['bar',                   'bar'],
  ['restaurant',            'restaurant'],
];

const UNIVERSE_SET = new Set<string>(UNIVERSES as readonly string[]);

/** Index type Google → univers. */
const GOOGLE_TYPE_LOOKUP = new Map<string, Universe>(GOOGLE_TYPE_TO_UNIVERSE);

/**
 * Types « parents » et leurs spécialisations. Google type un pub
 * `['bar', 'pub']`, un jardin botanique `['park', 'botanical_garden']`, une
 * onglerie `['beauty_salon', 'nail_salon']` : le parent vient en premier,
 * c'est pourtant l'enfant qui dit ce qu'est le lieu. Limité aux vraies
 * relations « est une sorte de » — `restaurant` n'a pas d'enfant, sinon une
 * brasserie typée `['restaurant', 'cafe']` filerait en Cafés.
 */
const SPECIALIZATIONS: Record<string, string[]> = {
  bar: ['hookah_bar', 'karaoke', 'live_music_venue', 'night_club', 'pub', 'irish_pub', 'gastropub', 'brewpub', 'comedy_club'],
  cafe: ['tea_house'],
  park: ['botanical_garden', 'hiking_area', 'picnic_ground', 'national_park', 'zoo', 'amusement_park'],
  beauty_salon: ['nail_salon', 'hair_salon', 'hair_care', 'barber_shop', 'spa', 'massage', 'tanning_studio', 'skin_care_clinic'],
};

/** Types « fourre-tout » : ne décident que si le lieu n'a rien d'autre. */
const LAST_RESORT_TYPES = new Set(['tourist_attraction']);

/** Types Google à demander pour un univers donné (ou liste large si absent). */
export function universeToGoogleTypes(universe?: Universe): string[] {
  if (!universe) return [...DEFAULT_TYPES];
  return [...(UNIVERSE_TO_GOOGLE_TYPES[universe] ?? [])];
}

/**
 * Univers d'après les seuls types Google, `null` si aucun n'est connu.
 *
 * On suit l'ordre du lieu (type principal en premier) : un cinéma qui vend
 * des bonbons (`['movie_theater', 'candy_store']`) reste un cinéma. Sauf :
 *  - un type parent cède à sa spécialisation ({@link SPECIALIZATIONS}) ;
 *  - `tourist_attraction` ne décide qu'en dernier recours — Google le pose en
 *    tête de musées, de monuments et de parcs.
 */
function universeFromTypes(types: string[]): Universe | null {
  let lastResort: Universe | null = null;
  for (const t of types) {
    const universe = GOOGLE_TYPE_LOOKUP.get(t);
    if (!universe) continue;
    if (LAST_RESORT_TYPES.has(t)) {
      lastResort ??= universe;
      continue;
    }
    const children = SPECIALIZATIONS[t];
    const child = children && types.find((x) => children.includes(x));
    return child ? GOOGLE_TYPE_LOOKUP.get(child)! : universe;
  }
  return lastResort;
}

/**
 * Déduit l'univers YUMIA d'après les types Google d'un lieu ; sinon le
 * `fallback` (l'univers recherché lors d'une requête ciblée).
 */
export function googleTypesToUniverse(types: string[], fallback: Universe = 'restaurant'): Universe {
  return universeFromTypes(types) ?? (UNIVERSE_SET.has(fallback) ? fallback : 'restaurant');
}

// ── Classement par le nom ────────────────────────────────────────────────────

/** Minuscules sans accents, pour comparer des enseignes. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * Bureau de tabac. Google n'a pas de type pour eux : un bar-tabac est typé
 * `bar`, un tabac-presse `convenience_store` ou `store`. Le nom, lui, le dit.
 */
const TOBACCO_NAME = /\b(tabacs?|bureau de tabac|tabaccheria|tabacchi|estanco|tobacco|tobacconist|tabakwaren|civette)\b/;
/** Marchand de journaux (« Tabac & Presse ») — hors cafés « de la Presse ». */
const PRESS_NAME = /\b(maison de la presse|point presse|tabac presse|presse|kiosque a journaux|newsagent)\b/;
const FOOD_DRINK_TYPES = new Set(['bar', 'restaurant', 'cafe', 'coffee_shop', 'pub', 'bakery', 'hotel', 'lodging']);

/**
 * Grandes enseignes alimentaires : toujours « Supermarchés », quel que soit le
 * format du magasin. « Épiceries & Alimentation » est réservé aux commerces de
 * quartier (alimentation générale, épicerie exotique, supérette indépendante).
 */
const SUPERMARKET_CHAIN = new RegExp(
  '\\b(' + [
    // France, Belgique, Suisse
    'carrefour', 'auchan', 'e\\.? ?leclerc', 'leclerc', 'lidl', 'aldi', 'intermarche', 'monoprix', "monop'?",
    'franprix', 'geant casino', 'casino supermarche', 'petit casino', 'super u', 'hyper u', 'u express',
    'marche u', 'cora', 'supermarche match', 'netto', 'leader price', 'g20', 'picard', 'biocoop', 'naturalia',
    "bio c'? ?bon", 'la vie claire', 'grand frais', 'colruyt', 'delhaize', 'migros', 'denner',
    // Royaume-Uni, Irlande
    'tesco', "sainsbury'?s?", 'asda', 'morrisons', 'waitrose', 'marks ?& ?spencer', 'm&s',
    // Espagne, Portugal, Italie
    'mercadona', 'eroski', 'alcampo', 'el corte ingles', 'hipercor', 'pingo doce', 'continente',
    'esselunga', 'conad', 'eurospin',
    // Allemagne, Pays-Bas, Nord
    'rewe', 'edeka', 'kaufland', 'penny', 'albert heijn', 'jumbo', 'ica', 'coop',
    // Amérique du Nord
    'walmart', 'costco', 'kroger', 'safeway', 'whole foods', "trader joe'?s?", 'publix',
    // Enseignes de supermarchés de quartier (Île-de-France)
    'hmarket',
    // Surgelés (comme Picard)
    'thiriet',
    // Le mot lui-même
    'hypermarche', 'hypermarket', 'supermarche', 'supermarket', 'supermercado', 'supermarkt', 'supermercato',
  ].join('|') + ')\\b'
  // Carrefour Market rebaptisé « Market <ville> » (« Market Jouy-le-Moutier ») :
  // « Market » en PREMIER mot seulement — « Fenicia Market », « Exotique Market »
  // sont des épiceries de quartier.
  + '|^market\\b',
);

/** Commerce de quartier, d'après son nom. */
const SMALL_GROCERY_NAME = /\b(epicerie|alimentation|superette|mini ?market|minimarket|lycamobile|lebara)\b/;

/** Formats de grande surface. */
const BIG_STORE_TYPES = ['hypermarket', 'discount_supermarket', 'warehouse_store', 'wholesaler'];
/** Types que porte une épicerie de quartier. */
const SMALL_GROCERY_TYPES = ['convenience_store', 'grocery_store', 'asian_grocery_store', 'food_store', 'market'];

/**
 * Supermarché ou épicerie de quartier ? Google type les deux
 * `['supermarket', 'grocery_store']`, dans un ordre qui ne dit rien (à Paris,
 * une épicerie est typée `supermarket` d'abord). L'enseigne tranche.
 *
 * @param otherwise  univers retenu quand ni le nom ni les types ne tranchent.
 */
/** Le nom dit-il « grande enseigne » ou « épicerie de quartier » ? */
export function hasGroceryNameEvidence(name: string): boolean {
  const folded = fold(name);
  return SUPERMARKET_CHAIN.test(folded) || SMALL_GROCERY_NAME.test(folded);
}

/** Le lieu porte-t-il un type de commerce alimentaire (grande surface ou quartier) ? */
export function hasGroceryType(types: string[]): boolean {
  return types.some((t) => t === 'supermarket' || BIG_STORE_TYPES.includes(t) || SMALL_GROCERY_TYPES.includes(t));
}

/** Le nom désigne-t-il un tabac ou un marchand de journaux ? */
export function hasTobaccoNameEvidence(name: string): boolean {
  const folded = fold(name);
  return TOBACCO_NAME.test(folded) || PRESS_NAME.test(folded);
}

function groceryFamily(name: string, types: string[], otherwise: Universe): Universe {
  if (SUPERMARKET_CHAIN.test(fold(name))) return 'supermarket';
  if (types.some((t) => BIG_STORE_TYPES.includes(t))) return 'supermarket';
  if (types.some((t) => SMALL_GROCERY_TYPES.includes(t))) return 'grocery_store';
  // Le nom dit « épicerie », « alimentation », « Lycamobile »… : quartier.
  if (SMALL_GROCERY_NAME.test(fold(name))) return 'grocery_store';
  // Typé `supermarket` sans AUCUN type ni nom de commerce de quartier : une grande
  // surface, même remontée par la recherche « épicerie » (18/11 : des Carrefour
  // Market `supermarket, cosmetics_store, bakery` restaient en Épiceries).
  if (types.includes('supermarket')) return 'supermarket';
  return otherwise;
}

export interface GooglePlaceIdentity {
  name: string;
  /** Types Google, type principal en premier. */
  types: string[];
  /** Univers de la recherche qui a trouvé le lieu. */
  requested?: Universe;
  /**
   * Recherche textuelle dédiée à l'univers demandé : celui-ci s'impose, les
   * types du lieu ne disant rien de lui (rooftop typé `bar`).
   */
  forced?: boolean;
}

/**
 * Univers d'un lieu Google. Même réponse quelle que soit la recherche qui l'a
 * trouvé (hors recherche textuelle dédiée) — c'est ce qui empêche un lieu de
 * changer d'univers d'une recherche à l'autre.
 *
 *  1. Un tabac se reconnaît à son nom, même typé `bar`.
 *  2. Recherche textuelle dédiée → l'univers demandé.
 *  3. Sinon les types ({@link universeFromTypes}), puis l'univers demandé.
 *  4. Supermarché / épicerie : départagés par l'enseigne ({@link groceryFamily}).
 */
export function classifyGooglePlace({ name, types, requested, forced }: GooglePlaceIdentity): Universe {
  const folded = fold(name);
  const forcedUniverse = forced && requested ? requested : null;

  // Un bar à chicha ou un coffeeshop peut s'appeler « Tabac … » : la
  // recherche dédiée a raison contre le nom.
  if (TOBACCO_NAME.test(folded) && forcedUniverse !== 'hookah' && forcedUniverse !== 'cannabis') {
    return 'tobacco';
  }

  if (forcedUniverse) {
    // « Bureau de tabac » remonte aussi des épiceries qui vendent du tabac :
    // une épicerie reste une épicerie.
    if (forcedUniverse === 'tobacco' && SMALL_GROCERY_NAME.test(folded) && !PRESS_NAME.test(folded)) {
      return groceryFamily(name, types, 'grocery_store');
    }
    return forcedUniverse === 'grocery_store' || forcedUniverse === 'supermarket'
      ? groceryFamily(name, types, forcedUniverse)
      : forcedUniverse;
  }

  const fromTypes = universeFromTypes(types);
  if (fromTypes === 'supermarket' || fromTypes === 'grocery_store') {
    return groceryFamily(name, types, fromTypes);
  }
  if (PRESS_NAME.test(folded) && !types.some((t) => FOOD_DRINK_TYPES.has(t))
    && (fromTypes === null || fromTypes === 'bookstore')) {
    return 'tobacco';
  }
  return fromTypes ?? (requested && UNIVERSE_SET.has(requested) ? requested : 'restaurant');
}

/**
 * Indices de nom des univers « mot-clé » que l'ancienne recherche par type
 * compagnon avait remplis à tort (tous les bars en Rooftops, toutes les
 * boutiques en Lingerie…). Sert au script de reclassement : un lieu n'y reste
 * que si son nom le justifie. Texte comparé sans accents, en minuscules.
 */
export const KEYWORD_NAME_HINTS: Partial<Record<Universe, RegExp>> = {
  rooftop: /roof|toit|sky ?bar|skybar|perchoir|terrass|panoram/,
  escape_game: /escape|enigm|evasion|mystere|\broom\b/,
  quad: /quad|buggy|off[- ]?road|4x4|tout[- ]terrain|\batv\b|motocross|\bssv\b/,
  brunch: /brunch|breakfast|petit[- ]dej|pancake|\begg/,
  lash_studio: /\bcils?\b|lash|sourcil|brow|microblading/,
  makeup_studio: /maquill|make[- ]?up|relooking/,
  lingerie: /lingerie|etam|undiz|intimissimi|victoria'?s secret|darjeeling|aubade|chantelle|princesse tam|calzedonia|tezenis|oysho|rouge[- ]?gorge|simone perele|sous[- ]vetement/,
  luxury_store: /chanel|dior|louis vuitton|hermes|gucci|prada|cartier|saint laurent|\bysl\b|balenciaga|fendi|givenchy|celine|bulgari|bvlgari|tiffany|rolex|burberry|versace|valentino|bottega|loewe|moncler|van cleef|chopard|\bluxe\b|luxury/,
};

/** Le nom du lieu justifie-t-il l'univers « mot-clé » où il est rangé ? */
export function nameSupportsUniverse(name: string, universe: Universe): boolean {
  const hint = KEYWORD_NAME_HINTS[universe];
  return hint ? hint.test(fold(name)) : false;
}
