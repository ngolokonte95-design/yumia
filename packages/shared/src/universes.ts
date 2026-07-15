/**
 * Univers YUMIA — expériences du quotidien.
 * RÈGLE ABSOLUE : YUMIA n'est PAS une app de restaurants — « restaurant » n'est
 * qu'un univers parmi toutes les expériences proposées.
 *
 * Ordre du tableau = ordre d'affichage dans la grille home (par catégorie logique).
 */

export const UNIVERSES = [
  // ── Manger & Boire ────────────────────────────────────────────────────────
  'restaurant',   // inclut fast_food (fusionné — même expérience utilisateur)
  'cafe',         // inclut bubble_tea (fusionné — même expérience boisson)
  'bar',
  'bakery',
  'brunch',
  'dessert',
  'nightclub',
  'pub',
  'ice_cream',
  'chocolatier',
  'wine_cellar',
  'tea_house',
  'juice_bar',
  'food_truck',
  'local_specialty',
  // ── Bars & Soirées ────────────────────────────────────────────────────────
  'hookah',
  'live_music',
  'rooftop',
  'karaoke',
  'comedy_club',
  // ── Culture & Divertissement ──────────────────────────────────────────────
  'cinema',
  'museum',
  'amusement_park',
  'escape_game',
  'bowling',
  'laser_game',
  'karting',
  'monument',
  'tourist_activity',
  'cultural_outing',
  'zoo',
  'photo_spot',
  // ── Nature & Plein air ────────────────────────────────────────────────────
  'park',
  'beach',
  'hiking',
  'natural_site',
  'waterspot',
  'camping',
  'botanical_garden',
  'picnic_area',
  // ── Sport & Fitness ───────────────────────────────────────────────────────
  'fitness',      // inclut padel/tennis (fusionné — même univers sportif)
  'gym',
  'aquatic',
  'jetski',
  'quad',
  'casino',
  'skatepark',
  'cannabis',
  'shooting',
  // ── Bien-être & Beauté ────────────────────────────────────────────────────
  'spa',
  'massage',
  'hair_salon',
  'barber',
  'nail_salon',
  'lash_studio',
  'esthetics',
  'tattoo',
  'yoga_studio',
  'tanning_studio',
  'makeup_studio',
  'florist',
  // ── Shopping & Commerce ───────────────────────────────────────────────────
  'shopping',
  'mall',
  'bookstore',
  'jewelry',
  'perfume_cosmetics',
  'lingerie',
  'vintage_store',
  'luxury_store',
  // ── Transport & Mobilité ──────────────────────────────────────────────────
  'taxi_vtc',
  'gare',
  'airport',
  'parking',
  'hotel',
  'car_rental',
  'campground',
  'port',
  // ── Services du quotidien ─────────────────────────────────────────────────
  'atm',
  'currency_exchange',
  'money_transfer',
  'pharmacy',
  'fuel',
  'laundry',
  'coworking',
  'tobacco',
  'post_office',
  // ── Santé ─────────────────────────────────────────────────────────────────
  'doctor',
  'hospital',
  'vet',
  'optician',
  'mental_health',
  'laboratory',
  'alternative_medicine',
  // ── Automobile & Moto ─────────────────────────────────────────────────────
  'garage',
  'car_wash',
  'car_dealership',
  'tire_shop',
  'motorcycle',
  // ── Culte & Autres ────────────────────────────────────────────────────────
  'place_of_worship',
  'library',
  'police',
  'event_venue',
  // Valeurs héritées supprimées de l'UI (enum PG non supprimable) :
  // 'fast_food'   → fusionné dans 'restaurant'
  // 'padel'       → fusionné dans 'fitness'
  // 'market'      → fusionné dans 'shopping'
  // 'nightlife'   → fusionné dans 'bar'/'nightclub'
  // 'art_gallery' → fusionné dans 'museum'
  // 'cheese_shop' → fusionné dans 'local_specialty'
  // 'bubble_tea'  → fusionné dans 'cafe'
] as const;

export type Universe = (typeof UNIVERSES)[number];

export interface UniverseMeta {
  key: Universe;
  emoji: string;
  /** Clé i18n ; libellé FR fourni comme repli. */
  i18nKey: string;
  labelFr: string;
}

export const UNIVERSE_META: Record<Universe, UniverseMeta> = {
  // Manger & Boire
  restaurant:      { key: 'restaurant',      emoji: '🍽️',  i18nKey: 'universe.restaurant',      labelFr: 'Restaurants & Fast-food' },
  cafe:            { key: 'cafe',            emoji: '☕',   i18nKey: 'universe.cafe',            labelFr: 'Cafés' },
  bakery:          { key: 'bakery',          emoji: '🥐',   i18nKey: 'universe.bakery',          labelFr: 'Boulangeries' },
  brunch:          { key: 'brunch',          emoji: '🥞',   i18nKey: 'universe.brunch',          labelFr: 'Brunch & Petit-déjeuner' },
  dessert:         { key: 'dessert',         emoji: '🍰',   i18nKey: 'universe.dessert',         labelFr: 'Desserts' },
  ice_cream:       { key: 'ice_cream',       emoji: '🍦',   i18nKey: 'universe.ice_cream',       labelFr: 'Glaciers' },
  chocolatier:     { key: 'chocolatier',     emoji: '🍫',   i18nKey: 'universe.chocolatier',     labelFr: 'Chocolatiers' },
  wine_cellar:     { key: 'wine_cellar',     emoji: '🍷',   i18nKey: 'universe.wine_cellar',     labelFr: 'Caves à vin' },
  tea_house:       { key: 'tea_house',       emoji: '🫖',   i18nKey: 'universe.tea_house',       labelFr: 'Salons de thé' },
  juice_bar:       { key: 'juice_bar',       emoji: '🥤',   i18nKey: 'universe.juice_bar',       labelFr: 'Jus & Smoothies' },
  food_truck:      { key: 'food_truck',      emoji: '🚐',   i18nKey: 'universe.food_truck',      labelFr: 'Food Trucks & Street food' },
  local_specialty: { key: 'local_specialty', emoji: '🥩',   i18nKey: 'universe.local_specialty', labelFr: 'Spécialités locales' },
  // Bars & Soirées
  bar:             { key: 'bar',             emoji: '🍹',   i18nKey: 'universe.bar',             labelFr: 'Bars' },
  pub:             { key: 'pub',             emoji: '🍺',   i18nKey: 'universe.pub',             labelFr: 'Pubs' },
  nightclub:       { key: 'nightclub',       emoji: '🎧',   i18nKey: 'universe.nightclub',       labelFr: 'Night-clubs' },
  hookah:          { key: 'hookah',          emoji: '💨',   i18nKey: 'universe.hookah',          labelFr: 'Bars à chicha' },
  live_music:      { key: 'live_music',      emoji: '🎵',   i18nKey: 'universe.live_music',      labelFr: 'Musique Live' },
  rooftop:         { key: 'rooftop',         emoji: '🌇',   i18nKey: 'universe.rooftop',         labelFr: 'Rooftops' },
  karaoke:         { key: 'karaoke',         emoji: '🎤',   i18nKey: 'universe.karaoke',         labelFr: 'Karaoké' },
  comedy_club:     { key: 'comedy_club',     emoji: '😂',   i18nKey: 'universe.comedy_club',     labelFr: 'Comedy Club & Stand-up' },
  // Culture & Tourisme
  museum:          { key: 'museum',          emoji: '🏛️',  i18nKey: 'universe.museum',          labelFr: 'Musées & Galeries' },
  monument:        { key: 'monument',        emoji: '🗿',   i18nKey: 'universe.monument',        labelFr: 'Monuments & Sites' },
  tourist_activity:{ key: 'tourist_activity',emoji: '🎡',   i18nKey: 'universe.tourist_activity',labelFr: 'Activités touristiques' },
  cultural_outing: { key: 'cultural_outing', emoji: '🎭',   i18nKey: 'universe.cultural_outing', labelFr: 'Sorties culturelles' },
  cinema:          { key: 'cinema',          emoji: '🎬',   i18nKey: 'universe.cinema',          labelFr: 'Cinémas' },
  zoo:             { key: 'zoo',             emoji: '🦁',   i18nKey: 'universe.zoo',             labelFr: 'Zoo & Aquarium' },
  amusement_park:  { key: 'amusement_park',  emoji: '🎢',   i18nKey: 'universe.amusement_park',  labelFr: "Parcs d'attractions" },
  photo_spot:      { key: 'photo_spot',      emoji: '📸',   i18nKey: 'universe.photo_spot',      labelFr: 'Spots photo & Panoramas' },
  // Nature & Plein air
  park:            { key: 'park',            emoji: '🌿',   i18nKey: 'universe.park',            labelFr: 'Parcs & Nature' },
  beach:           { key: 'beach',           emoji: '🏖️',  i18nKey: 'universe.beach',           labelFr: 'Plages & Vacances' },
  hiking:          { key: 'hiking',          emoji: '🥾',   i18nKey: 'universe.hiking',          labelFr: 'Randonnée' },
  natural_site:    { key: 'natural_site',    emoji: '🏔️',  i18nKey: 'universe.natural_site',    labelFr: 'Sites naturels' },
  waterspot:       { key: 'waterspot',       emoji: '💧',   i18nKey: 'universe.waterspot',       labelFr: 'Points d\'eau & Criques' },
  camping:         { key: 'camping',         emoji: '⛺',   i18nKey: 'universe.camping',         labelFr: 'Camping & Bivouac' },
  botanical_garden:{ key: 'botanical_garden',emoji: '🌺',   i18nKey: 'universe.botanical_garden',labelFr: 'Jardins botaniques' },
  picnic_area:     { key: 'picnic_area',     emoji: '🧺',   i18nKey: 'universe.picnic_area',     labelFr: 'Aires de pique-nique' },
  // Sport & Loisirs
  fitness:         { key: 'fitness',         emoji: '🏃',   i18nKey: 'universe.fitness',         labelFr: 'Sport & Fitness' },
  gym:             { key: 'gym',             emoji: '🏋️',  i18nKey: 'universe.gym',             labelFr: 'Salles de sport' },
  aquatic:         { key: 'aquatic',         emoji: '🏊',   i18nKey: 'universe.aquatic',         labelFr: 'Piscines & Aquatique' },
  jetski:          { key: 'jetski',          emoji: '🚤',   i18nKey: 'universe.jetski',          labelFr: 'Jet ski & Nautisme' },
  quad:            { key: 'quad',            emoji: '🏍️',  i18nKey: 'universe.quad',            labelFr: 'Quad & Off-road' },
  escape_game:     { key: 'escape_game',     emoji: '🔐',   i18nKey: 'universe.escape_game',     labelFr: 'Escape Games' },
  laser_game:      { key: 'laser_game',      emoji: '🔫',   i18nKey: 'universe.laser_game',      labelFr: 'Laser Game & Paintball' },
  karting:         { key: 'karting',         emoji: '🏎️',  i18nKey: 'universe.karting',         labelFr: 'Karting & Course' },
  bowling:         { key: 'bowling',         emoji: '🎳',   i18nKey: 'universe.bowling',         labelFr: 'Bowling' },
  casino:          { key: 'casino',          emoji: '🎰',   i18nKey: 'universe.casino',          labelFr: 'Casinos' },
  skatepark:       { key: 'skatepark',       emoji: '🛹',   i18nKey: 'universe.skatepark',       labelFr: 'Skateparks & Sports urbains' },
  cannabis:        { key: 'cannabis',        emoji: '🍃',   i18nKey: 'universe.cannabis',        labelFr: 'Coffee shops & Cannabis' },
  shooting:        { key: 'shooting',        emoji: '🎯',   i18nKey: 'universe.shooting',        labelFr: 'Armureries & Stands de tir' },
  // Bien-être & Beauté
  spa:             { key: 'spa',             emoji: '🧖',   i18nKey: 'universe.spa',             labelFr: 'Spa & Bien-être' },
  massage:         { key: 'massage',         emoji: '💆‍♀️', i18nKey: 'universe.massage',         labelFr: 'Massage & Détente' },
  nail_salon:      { key: 'nail_salon',      emoji: '💅',   i18nKey: 'universe.nail_salon',      labelFr: 'Ongleries' },
  hair_salon:      { key: 'hair_salon',      emoji: '💇‍♀️', i18nKey: 'universe.hair_salon',      labelFr: 'Coiffure & Beauté' },
  barber:          { key: 'barber',          emoji: '💈',   i18nKey: 'universe.barber',          labelFr: 'Barbiers' },
  lash_studio:     { key: 'lash_studio',     emoji: '👁️',  i18nKey: 'universe.lash_studio',     labelFr: 'Cils & Sourcils' },
  esthetics:       { key: 'esthetics',       emoji: '✨',   i18nKey: 'universe.esthetics',       labelFr: 'Esthétique & Soins' },
  tattoo:          { key: 'tattoo',          emoji: '🖋️',  i18nKey: 'universe.tattoo',          labelFr: 'Tatouage & Piercing' },
  yoga_studio:     { key: 'yoga_studio',     emoji: '🧘',   i18nKey: 'universe.yoga_studio',     labelFr: 'Yoga & Pilates' },
  tanning_studio:  { key: 'tanning_studio',  emoji: '🌞',   i18nKey: 'universe.tanning_studio',  labelFr: 'Bronzage & UV' },
  makeup_studio:   { key: 'makeup_studio',   emoji: '💄',   i18nKey: 'universe.makeup_studio',   labelFr: 'Maquillage & Relooking' },
  florist:         { key: 'florist',         emoji: '💐',   i18nKey: 'universe.florist',         labelFr: 'Fleuristes' },
  // Shopping & Commerce
  shopping:        { key: 'shopping',        emoji: '🛍️',  i18nKey: 'universe.shopping',        labelFr: 'Shopping & Mode' },
  mall:            { key: 'mall',            emoji: '🏬',   i18nKey: 'universe.mall',            labelFr: 'Centres commerciaux' },
  bookstore:       { key: 'bookstore',       emoji: '📚',   i18nKey: 'universe.bookstore',       labelFr: 'Librairies' },
  jewelry:         { key: 'jewelry',         emoji: '💍',   i18nKey: 'universe.jewelry',         labelFr: 'Bijouteries' },
  perfume_cosmetics: { key: 'perfume_cosmetics', emoji: '🌸', i18nKey: 'universe.perfume_cosmetics', labelFr: 'Parfums & Cosmétiques' },
  lingerie:        { key: 'lingerie',        emoji: '👙',   i18nKey: 'universe.lingerie',        labelFr: 'Lingerie & Mode intime' },
  vintage_store:   { key: 'vintage_store',   emoji: '👗',   i18nKey: 'universe.vintage_store',   labelFr: 'Vintage & Seconde main' },
  luxury_store:    { key: 'luxury_store',    emoji: '💎',   i18nKey: 'universe.luxury_store',    labelFr: 'Boutiques de luxe' },
  // Santé
  pharmacy:        { key: 'pharmacy',        emoji: '💊',   i18nKey: 'universe.pharmacy',        labelFr: 'Pharmacies' },
  doctor:          { key: 'doctor',          emoji: '🩺',   i18nKey: 'universe.doctor',          labelFr: 'Médecins & Dentistes' },
  hospital:        { key: 'hospital',        emoji: '🏥',   i18nKey: 'universe.hospital',        labelFr: 'Hôpitaux & Urgences' },
  vet:             { key: 'vet',             emoji: '🐾',   i18nKey: 'universe.vet',             labelFr: 'Vétérinaires' },
  optician:        { key: 'optician',        emoji: '👓',   i18nKey: 'universe.optician',        labelFr: 'Opticiens' },
  mental_health:   { key: 'mental_health',   emoji: '🧠',   i18nKey: 'universe.mental_health',   labelFr: 'Psychologues & Thérapeutes' },
  laboratory:      { key: 'laboratory',      emoji: '🔬',   i18nKey: 'universe.laboratory',      labelFr: 'Laboratoires d\'analyses' },
  alternative_medicine: { key: 'alternative_medicine', emoji: '🌿', i18nKey: 'universe.alternative_medicine', labelFr: 'Médecines douces & Naturopathie' },
  // Culte & Services
  place_of_worship:{ key: 'place_of_worship',emoji: '🛐',   i18nKey: 'universe.place_of_worship',labelFr: 'Lieux de culte' },
  library:         { key: 'library',         emoji: '📖',   i18nKey: 'universe.library',         labelFr: 'Bibliothèques' },
  coworking:       { key: 'coworking',       emoji: '💻',   i18nKey: 'universe.coworking',       labelFr: 'Coworking & Bureaux' },
  tobacco:         { key: 'tobacco',         emoji: '🚬',   i18nKey: 'universe.tobacco',         labelFr: 'Tabac & Presse' },
  post_office:     { key: 'post_office',     emoji: '📬',   i18nKey: 'universe.post_office',     labelFr: 'La Poste & Envoi colis' },
  police:          { key: 'police',          emoji: '🚔',   i18nKey: 'universe.police',          labelFr: 'Commissariats & Police' },
  fuel:            { key: 'fuel',            emoji: '⛽',   i18nKey: 'universe.fuel',            labelFr: 'Stations service & Bornes électriques' },
  laundry:         { key: 'laundry',         emoji: '🧺',   i18nKey: 'universe.laundry',         labelFr: 'Laveries automatiques' },
  // Transport & Mobilité
  taxi_vtc:        { key: 'taxi_vtc',        emoji: '🚕',   i18nKey: 'universe.taxi_vtc',        labelFr: 'Taxi & VTC' },
  gare:            { key: 'gare',            emoji: '🚉',   i18nKey: 'universe.gare',            labelFr: 'Gares & Transports' },
  airport:         { key: 'airport',         emoji: '✈️',   i18nKey: 'universe.airport',         labelFr: 'Aéroports' },
  parking:         { key: 'parking',         emoji: '🅿️',   i18nKey: 'universe.parking',         labelFr: 'Parkings' },
  hotel:           { key: 'hotel',           emoji: '🏨',   i18nKey: 'universe.hotel',           labelFr: 'Hôtels & Séjours' },
  car_rental:      { key: 'car_rental',      emoji: '🚗',   i18nKey: 'universe.car_rental',      labelFr: 'Location de voitures' },
  campground:      { key: 'campground',      emoji: '🏕️',  i18nKey: 'universe.campground',      labelFr: 'Campings & Glamping' },
  port:            { key: 'port',            emoji: '⚓',   i18nKey: 'universe.port',            labelFr: 'Ports & Marinas' },
  // Services du quotidien
  atm:             { key: 'atm',             emoji: '🏧',   i18nKey: 'universe.atm',             labelFr: 'Distributeurs ATM' },
  currency_exchange:{ key: 'currency_exchange', emoji: '💱', i18nKey: 'universe.currency_exchange', labelFr: 'Bureaux de change' },
  money_transfer:  { key: 'money_transfer',  emoji: '💸',   i18nKey: 'universe.money_transfer',  labelFr: "Transfert d'argent" },
  // Automobile
  garage:          { key: 'garage',          emoji: '🔧',   i18nKey: 'universe.garage',          labelFr: 'Garages & Mécanique' },
  car_wash:        { key: 'car_wash',        emoji: '🫧',   i18nKey: 'universe.car_wash',        labelFr: 'Stations de lavage' },
  car_dealership:  { key: 'car_dealership',  emoji: '🚘',   i18nKey: 'universe.car_dealership',  labelFr: 'Concessionnaires auto' },
  tire_shop:       { key: 'tire_shop',       emoji: '🔩',   i18nKey: 'universe.tire_shop',       labelFr: 'Centres de pneus' },
  motorcycle:      { key: 'motorcycle',      emoji: '🏍️',  i18nKey: 'universe.motorcycle',      labelFr: 'Moto & Scooter' },
  // Culte & Autres
  event_venue:     { key: 'event_venue',     emoji: '🎪',   i18nKey: 'universe.event_venue',     labelFr: 'Événements & Spectacles' },
};

export const isUniverse = (v: string): v is Universe => (UNIVERSES as readonly string[]).includes(v);

export interface UniverseCategory {
  label: string;
  emoji: string;
  universes: Universe[];
}

export const UNIVERSE_CATEGORIES: UniverseCategory[] = [
  {
    label: 'Manger & Boire',
    emoji: '🍽️',
    universes: ['restaurant', 'cafe', 'bakery', 'brunch', 'juice_bar', 'food_truck', 'dessert', 'ice_cream', 'chocolatier', 'wine_cellar', 'tea_house', 'local_specialty'],
  },
  {
    label: 'Bars & Soirées',
    emoji: '🍹',
    universes: ['bar', 'pub', 'nightclub', 'hookah', 'live_music', 'rooftop', 'karaoke', 'comedy_club'],
  },
  {
    label: 'Culture & Tourisme',
    emoji: '🎭',
    universes: ['cinema', 'museum', 'monument', 'tourist_activity', 'cultural_outing', 'amusement_park', 'zoo', 'photo_spot'],
  },
  {
    label: 'Sport & Loisirs',
    emoji: '🏃',
    universes: ['fitness', 'gym', 'aquatic', 'jetski', 'quad', 'escape_game', 'laser_game', 'karting', 'bowling', 'casino', 'skatepark', 'shooting'],
  },
  {
    label: 'Nature & Plein air',
    emoji: '🌿',
    universes: ['park', 'beach', 'hiking', 'natural_site', 'waterspot', 'camping', 'botanical_garden', 'picnic_area'],
  },
  {
    label: 'Bien-être & Beauté',
    emoji: '🧖',
    universes: ['spa', 'massage', 'esthetics', 'yoga_studio', 'tanning_studio', 'makeup_studio', 'hair_salon', 'barber', 'nail_salon', 'lash_studio', 'tattoo', 'florist'],
  },
  {
    label: 'Shopping & Commerce',
    emoji: '🛍️',
    universes: ['shopping', 'mall', 'luxury_store', 'lingerie', 'vintage_store', 'bookstore', 'jewelry', 'perfume_cosmetics'],
  },
  {
    label: 'Santé',
    emoji: '🩺',
    universes: ['pharmacy', 'doctor', 'hospital', 'mental_health', 'laboratory', 'alternative_medicine', 'vet', 'optician'],
  },
  {
    label: 'Transport & Hébergement',
    emoji: '🚕',
    universes: ['hotel', 'campground', 'port', 'airport', 'parking', 'taxi_vtc', 'gare', 'car_rental'],
  },
  {
    label: 'Services du quotidien',
    emoji: '🏧',
    universes: ['atm', 'currency_exchange', 'money_transfer', 'post_office', 'fuel', 'laundry', 'coworking', 'tobacco', 'cannabis'],
  },
  {
    label: 'Automobile',
    emoji: '🔧',
    universes: ['garage', 'car_wash', 'car_dealership', 'tire_shop', 'motorcycle'],
  },
  {
    label: 'Culte & Autres',
    emoji: '🛐',
    universes: ['place_of_worship', 'library', 'police', 'event_venue'],
  },
];
