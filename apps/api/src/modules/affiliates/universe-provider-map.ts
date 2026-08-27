import type { AffiliateProviderKey } from './providers/affiliate-provider.interface';

/**
 * Correspondance univers → provider(s) d'affiliation pertinent(s).
 * Un univers absent de cette table n'a simplement aucun partenaire —
 * c'est le cas normal pour la majorité des 125 univers (petits commerces
 * locaux, sans plateforme de réservation en ligne standardisée).
 */
export const UNIVERSE_AFFILIATE_PROVIDERS: Record<string, AffiliateProviderKey[]> = {
  // Hébergement / mobilité — Booking.com (couvre les 3 d'un seul compte)
  hotel: ['booking'],
  camping: ['booking'],
  campground: ['booking'],
  car_rental: ['booking'],

  // Activités touristiques / culture
  tourist_activity: ['getyourguide', 'viator'],
  cultural_outing: ['getyourguide', 'viator'],
  museum: ['getyourguide', 'viator'],
  monument: ['getyourguide', 'viator'],
  zoo: ['getyourguide', 'viator'],
  amusement_park: ['getyourguide', 'viator', 'fever'],

  // Sorties / divertissement
  escape_game: ['fever'],
  bowling: ['fever'],
  karting: ['fever'],
  laser_game: ['fever'],
  comedy_club: ['fever'],
  live_music: ['fever'],
  karaoke: ['fever'],
  nightclub: ['fever', 'shotgun'],

  // Bien-être & beauté
  spa: ['treatwell'],
  massage: ['treatwell'],
  hair_salon: ['treatwell'],
  barber: ['treatwell'],
  nail_salon: ['treatwell'],
  lash_studio: ['treatwell'],
  esthetics: ['treatwell'],
  yoga_studio: ['treatwell'],
  tanning_studio: ['treatwell'],
  makeup_studio: ['treatwell'],

  // Transport longue distance
  gare: ['trainline'],
};

export function providersForUniverse(universe: string | null | undefined): AffiliateProviderKey[] {
  if (!universe) return [];
  return UNIVERSE_AFFILIATE_PROVIDERS[universe] ?? [];
}
