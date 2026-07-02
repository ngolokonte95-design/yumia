/**
 * Univers YUMIA — expériences du quotidien.
 * RÈGLE ABSOLUE : YUMIA n'est PAS une app de restaurants — « restaurant » n'est
 * qu'un univers parmi toutes les expériences proposées.
 */

export const UNIVERSES = [
  'restaurant',
  'cafe',
  'bakery',
  'dessert',
  'bar',
  'bubble_tea',
  'local_specialty',
  'ice_cream',
  'chocolatier',
  'wine_cellar',
  'tourist_activity',
  'rooftop',
  'cultural_outing',
  'nightlife',
  'nightclub',
  'pub',
  'beach',
  'place_of_worship',
  'spa',
  'park',
  'cinema',
  'market',
  'fitness',
  'live_music',
  'escape_game',
  'museum',
  'zoo',
  'amusement_park',
  'bookstore',
  'tea_house',
  'karaoke',
  'library',
  'bowling',
  'casino',
  'art_gallery',
  'aquatic',
  'florist',
  'nail_salon',
  'hair_salon',
  'barber',
  'shopping',
  'jewelry',
  'massage',
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
  restaurant: { key: 'restaurant', emoji: '🍽️', i18nKey: 'universe.restaurant', labelFr: 'Restaurants' },
  cafe: { key: 'cafe', emoji: '☕', i18nKey: 'universe.cafe', labelFr: 'Cafés' },
  bakery: { key: 'bakery', emoji: '🥐', i18nKey: 'universe.bakery', labelFr: 'Boulangeries' },
  dessert: { key: 'dessert', emoji: '🍰', i18nKey: 'universe.dessert', labelFr: 'Desserts' },
  bar: { key: 'bar', emoji: '🍹', i18nKey: 'universe.bar', labelFr: 'Bars' },
  bubble_tea: { key: 'bubble_tea', emoji: '🧋', i18nKey: 'universe.bubble_tea', labelFr: 'Bubble Tea' },
  local_specialty: { key: 'local_specialty', emoji: '🥩', i18nKey: 'universe.local_specialty', labelFr: 'Spécialités locales' },
  ice_cream: { key: 'ice_cream', emoji: '🍦', i18nKey: 'universe.ice_cream', labelFr: 'Glaciers' },
  chocolatier: { key: 'chocolatier', emoji: '🍫', i18nKey: 'universe.chocolatier', labelFr: 'Chocolatiers' },
  wine_cellar: { key: 'wine_cellar', emoji: '🍷', i18nKey: 'universe.wine_cellar', labelFr: 'Caves à vin' },
  tourist_activity: { key: 'tourist_activity', emoji: '🎡', i18nKey: 'universe.tourist_activity', labelFr: 'Activités touristiques' },
  rooftop: { key: 'rooftop', emoji: '🌇', i18nKey: 'universe.rooftop', labelFr: 'Rooftops' },
  cultural_outing: { key: 'cultural_outing', emoji: '🎭', i18nKey: 'universe.cultural_outing', labelFr: 'Sorties culturelles' },
  nightlife: { key: 'nightlife', emoji: '🎉', i18nKey: 'universe.nightlife', labelFr: 'Lieux de sortie' },
  nightclub: { key: 'nightclub', emoji: '🎧', i18nKey: 'universe.nightclub', labelFr: 'Night-clubs' },
  pub: { key: 'pub', emoji: '🍺', i18nKey: 'universe.pub', labelFr: 'Pubs' },
  beach: { key: 'beach', emoji: '🏖️', i18nKey: 'universe.beach', labelFr: 'Plages & vacances' },
  place_of_worship: { key: 'place_of_worship', emoji: '🛐', i18nKey: 'universe.place_of_worship', labelFr: 'Lieux de culte' },
  spa: { key: 'spa', emoji: '🧖', i18nKey: 'universe.spa', labelFr: 'Spa & Bien-être' },
  park: { key: 'park', emoji: '🌿', i18nKey: 'universe.park', labelFr: 'Parcs & Nature' },
  cinema: { key: 'cinema', emoji: '🎬', i18nKey: 'universe.cinema', labelFr: 'Cinémas' },
  market: { key: 'market', emoji: '🛒', i18nKey: 'universe.market', labelFr: 'Marchés' },
  fitness: { key: 'fitness', emoji: '🏋️', i18nKey: 'universe.fitness', labelFr: 'Sport & Fitness' },
  live_music: { key: 'live_music', emoji: '🎵', i18nKey: 'universe.live_music', labelFr: 'Musique Live' },
  escape_game: { key: 'escape_game', emoji: '🔐', i18nKey: 'universe.escape_game', labelFr: 'Loisirs & Jeux' },
  museum: { key: 'museum', emoji: '🏛️', i18nKey: 'universe.museum', labelFr: 'Musées' },
  zoo: { key: 'zoo', emoji: '🦁', i18nKey: 'universe.zoo', labelFr: 'Zoo & Aquarium' },
  amusement_park: { key: 'amusement_park', emoji: '🎢', i18nKey: 'universe.amusement_park', labelFr: "Parcs d'attractions" },
  bookstore: { key: 'bookstore', emoji: '📚', i18nKey: 'universe.bookstore', labelFr: 'Librairies' },
  tea_house: { key: 'tea_house', emoji: '🫖', i18nKey: 'universe.tea_house', labelFr: 'Salons de thé' },
  karaoke: { key: 'karaoke', emoji: '🎤', i18nKey: 'universe.karaoke', labelFr: 'Karaoké' },
  library: { key: 'library', emoji: '📖', i18nKey: 'universe.library', labelFr: 'Bibliothèques' },
  bowling: { key: 'bowling', emoji: '🎳', i18nKey: 'universe.bowling', labelFr: 'Bowling' },
  casino: { key: 'casino', emoji: '🎰', i18nKey: 'universe.casino', labelFr: 'Casinos' },
  art_gallery: { key: 'art_gallery', emoji: '🖼️', i18nKey: 'universe.art_gallery', labelFr: "Galeries d'art" },
  aquatic: { key: 'aquatic', emoji: '🏊', i18nKey: 'universe.aquatic', labelFr: 'Piscines & Aquatique' },
  florist: { key: 'florist', emoji: '💐', i18nKey: 'universe.florist', labelFr: 'Fleuristes' },
  nail_salon: { key: 'nail_salon', emoji: '💅', i18nKey: 'universe.nail_salon', labelFr: 'Ongleries' },
  hair_salon: { key: 'hair_salon', emoji: '💇‍♀️', i18nKey: 'universe.hair_salon', labelFr: 'Coiffure & Beauté' },
  barber: { key: 'barber', emoji: '💈', i18nKey: 'universe.barber', labelFr: 'Barbiers' },
  shopping: { key: 'shopping', emoji: '🛍️', i18nKey: 'universe.shopping', labelFr: 'Shopping & Mode' },
  jewelry: { key: 'jewelry', emoji: '💍', i18nKey: 'universe.jewelry', labelFr: 'Bijouteries' },
  massage: { key: 'massage', emoji: '💆‍♀️', i18nKey: 'universe.massage', labelFr: 'Massage & Détente' },
};

export const isUniverse = (v: string): v is Universe => (UNIVERSES as readonly string[]).includes(v);
