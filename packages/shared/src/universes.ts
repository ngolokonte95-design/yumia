/**
 * Univers YUMIA — expériences du quotidien.
 * RÈGLE ABSOLUE : YUMIA n'est PAS une app de restaurants — « restaurant » n'est
 * qu'un univers parmi toutes les expériences proposées.
 *
 * Ordre du tableau = ordre d'affichage dans la grille home (par catégorie logique).
 */

export const UNIVERSES = [
  // ── Manger & Boire ────────────────────────────────────────────────────────
  'restaurant',
  'cafe',
  'bakery',
  'fast_food',
  'dessert',
  'ice_cream',
  'chocolatier',
  'bubble_tea',
  'wine_cellar',
  'tea_house',
  'local_specialty',
  // ── Bars & Soirées ────────────────────────────────────────────────────────
  'bar',
  'pub',
  'nightclub',
  'hookah',
  'live_music',
  'rooftop',
  'karaoke',
  // ── Culture & Tourisme ────────────────────────────────────────────────────
  'museum',
  'monument',
  'tourist_activity',
  'cultural_outing',
  'cinema',
  'zoo',
  'amusement_park',
  'photo_spot',
  // ── Nature & Plein air ────────────────────────────────────────────────────
  'park',
  'beach',
  // ── Sport & Loisirs ───────────────────────────────────────────────────────
  'fitness',
  'aquatic',
  'padel',
  'escape_game',
  'laser_game',
  'karting',
  'bowling',
  'casino',
  // ── Bien-être & Beauté ────────────────────────────────────────────────────
  'spa',
  'massage',
  'nail_salon',
  'hair_salon',
  'barber',
  'florist',
  // ── Shopping & Commerce ───────────────────────────────────────────────────
  'shopping',
  'mall',
  'market',
  'bookstore',
  'jewelry',
  // ── Culte & Services ──────────────────────────────────────────────────────
  'place_of_worship',
  'library',
  'coworking',
  // ── Transport & Hébergement ───────────────────────────────────────────────
  'gare',
  'hotel',
  'event_venue',
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
  restaurant:      { key: 'restaurant',      emoji: '🍽️',  i18nKey: 'universe.restaurant',      labelFr: 'Restaurants' },
  cafe:            { key: 'cafe',            emoji: '☕',   i18nKey: 'universe.cafe',            labelFr: 'Cafés' },
  bakery:          { key: 'bakery',          emoji: '🥐',   i18nKey: 'universe.bakery',          labelFr: 'Boulangeries' },
  fast_food:       { key: 'fast_food',       emoji: '🍔',   i18nKey: 'universe.fast_food',       labelFr: 'Restauration rapide' },
  dessert:         { key: 'dessert',         emoji: '🍰',   i18nKey: 'universe.dessert',         labelFr: 'Desserts' },
  ice_cream:       { key: 'ice_cream',       emoji: '🍦',   i18nKey: 'universe.ice_cream',       labelFr: 'Glaciers' },
  chocolatier:     { key: 'chocolatier',     emoji: '🍫',   i18nKey: 'universe.chocolatier',     labelFr: 'Chocolatiers' },
  bubble_tea:      { key: 'bubble_tea',      emoji: '🧋',   i18nKey: 'universe.bubble_tea',      labelFr: 'Bubble Tea' },
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
  fitness:         { key: 'fitness',         emoji: '🏋️',  i18nKey: 'universe.fitness',         labelFr: 'Sport & Fitness' },
  aquatic:         { key: 'aquatic',         emoji: '🏊',   i18nKey: 'universe.aquatic',         labelFr: 'Piscines & Aquatique' },
  padel:           { key: 'padel',           emoji: '🎾',   i18nKey: 'universe.padel',           labelFr: 'Padel & Tennis' },
  escape_game:     { key: 'escape_game',     emoji: '🔐',   i18nKey: 'universe.escape_game',     labelFr: 'Escape Games' },
  laser_game:      { key: 'laser_game',      emoji: '🔫',   i18nKey: 'universe.laser_game',      labelFr: 'Laser Game & Paintball' },
  karting:         { key: 'karting',         emoji: '🏎️',  i18nKey: 'universe.karting',         labelFr: 'Karting & Course' },
  bowling:         { key: 'bowling',         emoji: '🎳',   i18nKey: 'universe.bowling',         labelFr: 'Bowling' },
  casino:          { key: 'casino',          emoji: '🎰',   i18nKey: 'universe.casino',          labelFr: 'Casinos' },
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
  market:          { key: 'market',          emoji: '🛒',   i18nKey: 'universe.market',          labelFr: 'Marchés' },
  bookstore:       { key: 'bookstore',       emoji: '📚',   i18nKey: 'universe.bookstore',       labelFr: 'Librairies' },
  jewelry:         { key: 'jewelry',         emoji: '💍',   i18nKey: 'universe.jewelry',         labelFr: 'Bijouteries' },
  // Culte & Services
  place_of_worship:{ key: 'place_of_worship',emoji: '🛐',   i18nKey: 'universe.place_of_worship',labelFr: 'Lieux de culte' },
  library:         { key: 'library',         emoji: '📖',   i18nKey: 'universe.library',         labelFr: 'Bibliothèques' },
  coworking:       { key: 'coworking',       emoji: '💻',   i18nKey: 'universe.coworking',       labelFr: 'Coworking & Bureaux' },
  // Transport & Hébergement
  gare:            { key: 'gare',            emoji: '🚉',   i18nKey: 'universe.gare',            labelFr: 'Gares & Transports' },
  hotel:           { key: 'hotel',           emoji: '🏨',   i18nKey: 'universe.hotel',           labelFr: 'Hôtels & Séjours' },
  event_venue:     { key: 'event_venue',     emoji: '🎪',   i18nKey: 'universe.event_venue',     labelFr: 'Événements & Spectacles' },
};

export const isUniverse = (v: string): v is Universe => (UNIVERSES as readonly string[]).includes(v);
