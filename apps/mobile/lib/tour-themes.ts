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
