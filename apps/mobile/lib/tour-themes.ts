/**
 * Thèmes de l'écran des visites (`app/guides.tsx`) ouverts depuis les onglets
 * « Réserve chez nos partenaires » d'Explorer. Miroir de TOUR_THEMES côté API
 * (affiliates.service.ts) ; hôtel, location et vols n'y figurent pas : ils
 * ouvrent Booking.com directement.
 */
import type { TranslationKey } from './translations';

/** Titre des thèmes venus d'Explorer — mêmes libellés que leurs tuiles. */
export const THEME_TITLES: Record<string, { emoji: string; labelKey: TranslationKey }> = {
  activities: { emoji: '🎟️', labelKey: 'explorer_generic_activities' },
  skip_the_line: { emoji: '🎫', labelKey: 'explorer_generic_skip_the_line' },
  food_tours: { emoji: '🍽️', labelKey: 'explorer_generic_food_tours' },
  hop_on_hop_off: { emoji: '🚌', labelKey: 'explorer_generic_hop_on_hop_off' },
  airport_transfer: { emoji: '🚕', labelKey: 'explorer_generic_airport_transfer' },
  adventure: { emoji: '🏔️', labelKey: 'explorer_generic_adventure' },
  shows: { emoji: '🌙', labelKey: 'explorer_generic_shows' },
};

/** Thèmes que cet écran sait afficher — les autres onglets ouvrent le partenaire directement. */
export const TOUR_THEME_KEYS = new Set(Object.keys(THEME_TITLES));

/**
 * Sous-filtres d'un thème, affichés en puces sous la barre de ville. Clés
 * identiques à THEME_FACETS côté API (affiliates.service.ts).
 */
export const THEME_FACETS: Record<string, { key: string; emoji: string; labelKey: TranslationKey }[]> = {
  guides: [
    { key: 'walking', emoji: '🚶', labelKey: 'facet_guides_walking' },
    { key: 'bike', emoji: '🚲', labelKey: 'facet_guides_bike' },
    { key: 'boat', emoji: '⛵', labelKey: 'facet_guides_boat' },
    { key: 'night', emoji: '🌙', labelKey: 'facet_guides_night' },
    { key: 'private', emoji: '🔒', labelKey: 'facet_guides_private' },
    { key: 'mystery', emoji: '👻', labelKey: 'facet_guides_mystery' },
    { key: 'street_art', emoji: '🎨', labelKey: 'facet_guides_street_art' },
    { key: 'photo', emoji: '📸', labelKey: 'facet_guides_photo' },
  ],
  adventure: [
    { key: 'hiking', emoji: '🥾', labelKey: 'facet_adventure_hiking' },
    { key: 'kayak', emoji: '🛶', labelKey: 'facet_adventure_kayak' },
    { key: 'water_sports', emoji: '🌊', labelKey: 'facet_adventure_water_sports' },
    { key: 'paragliding', emoji: '🪂', labelKey: 'facet_adventure_paragliding' },
    { key: 'quad', emoji: '🏍️', labelKey: 'facet_adventure_quad' },
    { key: 'climbing', emoji: '🧗', labelKey: 'facet_adventure_climbing' },
    { key: 'horse', emoji: '🐎', labelKey: 'facet_adventure_horse' },
    { key: 'rafting', emoji: '🚣', labelKey: 'facet_adventure_rafting' },
    { key: 'snow', emoji: '⛷️', labelKey: 'facet_adventure_snow' },
    { key: 'jet_ski', emoji: '🚤', labelKey: 'facet_adventure_jet_ski' },
  ],
  food_tours: [
    { key: 'wine', emoji: '🍷', labelKey: 'facet_food_tours_wine' },
    { key: 'cooking', emoji: '👨‍🍳', labelKey: 'facet_food_tours_cooking' },
    { key: 'street_food', emoji: '🌮', labelKey: 'facet_food_tours_street_food' },
    { key: 'market', emoji: '🧺', labelKey: 'facet_food_tours_market' },
    { key: 'chocolate', emoji: '🍫', labelKey: 'facet_food_tours_chocolate' },
    { key: 'cheese', emoji: '🧀', labelKey: 'facet_food_tours_cheese' },
    { key: 'home_meal', emoji: '🏡', labelKey: 'facet_food_tours_home_meal' },
    { key: 'coffee', emoji: '☕', labelKey: 'facet_food_tours_coffee' },
  ],
  activities: [
    { key: 'family', emoji: '👨‍👩‍👧', labelKey: 'facet_activities_family' },
    { key: 'cruise', emoji: '🛳️', labelKey: 'facet_activities_cruise' },
    { key: 'day_trip', emoji: '🗺️', labelKey: 'facet_activities_day_trip' },
    { key: 'workshop', emoji: '🎨', labelKey: 'facet_activities_workshop' },
    { key: 'museum', emoji: '🏛️', labelKey: 'facet_activities_museum' },
    { key: 'spa', emoji: '💆', labelKey: 'facet_activities_spa' },
    { key: 'zoo', emoji: '🦁', labelKey: 'facet_activities_zoo' },
    { key: 'theme_park', emoji: '🎢', labelKey: 'facet_activities_theme_park' },
  ],
  shows: [
    { key: 'nightlife', emoji: '🪩', labelKey: 'facet_nightlife' },
    { key: 'cabaret', emoji: '💃', labelKey: 'facet_cabaret' },
    { key: 'concert', emoji: '🎵', labelKey: 'facet_concert' },
    { key: 'comedy', emoji: '😂', labelKey: 'facet_comedy' },
    { key: 'theatre', emoji: '🎭', labelKey: 'facet_theatre' },
    { key: 'musical', emoji: '🎤', labelKey: 'facet_musical' },
    { key: 'dinner_cruise', emoji: '🛥️', labelKey: 'facet_dinner_cruise' },
    { key: 'pub_crawl', emoji: '🍻', labelKey: 'facet_pub_crawl' },
    { key: 'dance', emoji: '💃', labelKey: 'facet_shows_dance' },
    { key: 'opera', emoji: '🎻', labelKey: 'facet_shows_opera' },
  ],
};

/**
 * Filtres pratiques, présents dans tous les onglets et cumulables entre eux
 * et avec un style. Clés identiques à QUICK_FILTERS côté API.
 */
export const QUICK_FILTERS: { key: string; emoji: string; labelKey: TranslationKey }[] = [
  { key: 'budget', emoji: '💰', labelKey: 'quick_budget' },
  { key: 'short', emoji: '⏱', labelKey: 'quick_short' },
  { key: 'top', emoji: '⭐', labelKey: 'quick_top' },
  { key: 'free_cancel', emoji: '✅', labelKey: 'quick_free_cancel' },
];
