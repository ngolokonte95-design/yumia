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
  'dessert',
  'nightclub',
  'pub',
  'ice_cream',
  'chocolatier',
  'wine_cellar',
  'tea_house',
  'local_specialty',
  // ── Bars & Soirées ────────────────────────────────────────────────────────
  'hookah',
  'live_music',
  'rooftop',
  'karaoke',
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
  // ── Sport & Fitness ───────────────────────────────────────────────────────
  'fitness',      // inclut padel/tennis (fusionné — même univers sportif)
  'gym',
  'aquatic',
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
  'florist',
  // ── Shopping & Commerce ───────────────────────────────────────────────────
  'shopping',
  'mall',
  'bookstore',
  'jewelry',
  // ── Transport & Mobilité ──────────────────────────────────────────────────
  'taxi_vtc',
  'gare',
  'hotel',
  // ── Services du quotidien ─────────────────────────────────────────────────
  'atm',
  'currency_exchange',
  'pharmacy',
  'fuel',
  'laundry',
  'coworking',
  // ── Santé ─────────────────────────────────────────────────────────────────
  'doctor',
  'hospital',
  'vet',
  'optician',
  // ── Automobile & Moto ─────────────────────────────────────────────────────
  'garage',
  'car_wash',
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
  dessert:         { key: 'dessert',         emoji: '🍰',   i18nKey: 'universe.dessert',         labelFr: 'Desserts' },
  ice_cream:       { key: 'ice_cream',       emoji: '🍦',   i18nKey: 'universe.ice_cream',       labelFr: 'Glaciers' },
  chocolatier:     { key: 'chocolatier',     emoji: '🍫',   i18nKey: 'universe.chocolatier',     labelFr: 'Chocolatiers' },
  wine_cellar:     { key: 'wine_cellar',     emoji: '🍷',   i18nKey: 'universe.wine_cellar',     labelFr: 'Caves à vin' },
  tea_house:       { key: 'tea_house',       emoji: '🫖',   i18nKey: 'universe.tea_house',       labelFr: 'Salons de thé' },
  local_specialty: { key: 'local_specialty', emoji: '🥩',   i18nKey: 'universe.local_specialty', labelFr: 'Spécialités locales' },
  // Bars & Soirées
  bar:             { key: 'bar',             emoji: '🍹',   i18nKey: 'universe.bar',             labelFr: 'Bars' },
  pub:             { key: 'pub',             emoji: '🍺',   i18nKey: 'universe.pub',             labelFr: 'Pubs' },
  nightclub:       { key: 'nightclub',       emoji: '🎧',   i18nKey: 'universe.nightclub',       labelFr: 'Night-clubs' },
  hookah:          { key: 'hookah',          emoji: '💨',   i18nKey: 'universe.hookah',          labelFr: 'Bars à chicha' },
  live_music:      { key: 'live_music',      emoji: '🎵',   i18nKey: 'universe.live_music',      labelFr: 'Musique Live' },
  rooftop:         { key: 'rooftop',         emoji: '🌇',   i18nKey: 'universe.rooftop',         labelFr: 'Rooftops' },
  karaoke:         { key: 'karaoke',         emoji: '🎤',   i18nKey: 'universe.karaoke',         labelFr: 'Karaoké' },
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
  // Sport & Loisirs
  fitness:         { key: 'fitness',         emoji: '🏃',   i18nKey: 'universe.fitness',         labelFr: 'Sport & Fitness' },
  gym:             { key: 'gym',             emoji: '🏋️',  i18nKey: 'universe.gym',             labelFr: 'Salles de sport' },
  aquatic:         { key: 'aquatic',         emoji: '🏊',   i18nKey: 'universe.aquatic',         labelFr: 'Piscines & Aquatique' },
  escape_game:     { key: 'escape_game',     emoji: '🔐',   i18nKey: 'universe.escape_game',     labelFr: 'Escape Games' },
  laser_game:      { key: 'laser_game',      emoji: '🔫',   i18nKey: 'universe.laser_game',      labelFr: 'Laser Game & Paintball' },
  karting:         { key: 'karting',         emoji: '🏎️',  i18nKey: 'universe.karting',         labelFr: 'Karting & Course' },
  bowling:         { key: 'bowling',         emoji: '🎳',   i18nKey: 'universe.bowling',         labelFr: 'Bowling' },
  casino:          { key: 'casino',          emoji: '🎰',   i18nKey: 'universe.casino',          labelFr: 'Casinos' },
  skatepark:       { key: 'skatepark',       emoji: '🛹',   i18nKey: 'universe.skatepark',       labelFr: 'Skateparks & Sports urbains' },
  cannabis:        { key: 'cannabis',        emoji: '🍃',   i18nKey: 'universe.cannabis',        labelFr: 'Coffee shops & Cannabis' },
  shooting:        { key: 'shooting',        emoji: '🎯',   i18nKey: 'universe.shooting',        labelFr: 'Armureries & Stands de tir' },
  // Automobile & Moto
  garage:          { key: 'garage',          emoji: '🔧',   i18nKey: 'universe.garage',          labelFr: 'Garages & Mécanique' },
  car_wash:        { key: 'car_wash',        emoji: '🫧',   i18nKey: 'universe.car_wash',        labelFr: 'Stations de lavage' },
  // Bien-être & Beauté
  spa:             { key: 'spa',             emoji: '🧖',   i18nKey: 'universe.spa',             labelFr: 'Spa & Bien-être' },
  massage:         { key: 'massage',         emoji: '💆‍♀️', i18nKey: 'universe.massage',         labelFr: 'Massage & Détente' },
  nail_salon:      { key: 'nail_salon',      emoji: '💅',   i18nKey: 'universe.nail_salon',      labelFr: 'Ongleries' },
  hair_salon:      { key: 'hair_salon',      emoji: '💇‍♀️', i18nKey: 'universe.hair_salon',      labelFr: 'Coiffure & Beauté' },
  barber:          { key: 'barber',          emoji: '💈',   i18nKey: 'universe.barber',          labelFr: 'Barbiers' },
  florist:         { key: 'florist',         emoji: '💐',   i18nKey: 'universe.florist',         labelFr: 'Fleuristes' },
  // Shopping & Commerce
  shopping:        { key: 'shopping',        emoji: '🛍️',  i18nKey: 'universe.shopping',        labelFr: 'Shopping & Mode' },
  mall:            { key: 'mall',            emoji: '🏬',   i18nKey: 'universe.mall',            labelFr: 'Centres commerciaux' },
  bookstore:       { key: 'bookstore',       emoji: '📚',   i18nKey: 'universe.bookstore',       labelFr: 'Librairies' },
  jewelry:         { key: 'jewelry',         emoji: '💍',   i18nKey: 'universe.jewelry',         labelFr: 'Bijouteries' },
  // Santé
  pharmacy:        { key: 'pharmacy',        emoji: '💊',   i18nKey: 'universe.pharmacy',        labelFr: 'Pharmacies' },
  doctor:          { key: 'doctor',          emoji: '🩺',   i18nKey: 'universe.doctor',          labelFr: 'Médecins & Dentistes' },
  hospital:        { key: 'hospital',        emoji: '🏥',   i18nKey: 'universe.hospital',        labelFr: 'Hôpitaux & Urgences' },
  vet:             { key: 'vet',             emoji: '🐾',   i18nKey: 'universe.vet',             labelFr: 'Vétérinaires' },
  optician:        { key: 'optician',        emoji: '👓',   i18nKey: 'universe.optician',        labelFr: 'Opticiens' },
  // Culte & Services
  place_of_worship:{ key: 'place_of_worship',emoji: '🛐',   i18nKey: 'universe.place_of_worship',labelFr: 'Lieux de culte' },
  library:         { key: 'library',         emoji: '📖',   i18nKey: 'universe.library',         labelFr: 'Bibliothèques' },
  coworking:       { key: 'coworking',       emoji: '💻',   i18nKey: 'universe.coworking',       labelFr: 'Coworking & Bureaux' },
  police:          { key: 'police',          emoji: '🚔',   i18nKey: 'universe.police',          labelFr: 'Commissariats & Police' },
  fuel:            { key: 'fuel',            emoji: '⛽',   i18nKey: 'universe.fuel',            labelFr: 'Stations service & Bornes électriques' },
  laundry:         { key: 'laundry',         emoji: '🧺',   i18nKey: 'universe.laundry',         labelFr: 'Laveries automatiques' },
  // Transport & Mobilité
  taxi_vtc:        { key: 'taxi_vtc',        emoji: '🚕',   i18nKey: 'universe.taxi_vtc',        labelFr: 'Taxi & VTC' },
  gare:            { key: 'gare',            emoji: '🚉',   i18nKey: 'universe.gare',            labelFr: 'Gares & Transports' },
  hotel:           { key: 'hotel',           emoji: '🏨',   i18nKey: 'universe.hotel',           labelFr: 'Hôtels & Séjours' },
  // Services du quotidien
  atm:             { key: 'atm',             emoji: '🏧',   i18nKey: 'universe.atm',             labelFr: 'Distributeurs ATM' },
  currency_exchange:{ key: 'currency_exchange', emoji: '💱', i18nKey: 'universe.currency_exchange', labelFr: 'Bureaux de change' },
  // Culte & Autres
  event_venue:     { key: 'event_venue',     emoji: '🎪',   i18nKey: 'universe.event_venue',     labelFr: 'Événements & Spectacles' },
};

export const isUniverse = (v: string): v is Universe => (UNIVERSES as readonly string[]).includes(v);
