import type { Universe } from '@yumia/shared';

/**
 * Abstraction d'un fournisseur de lieux externe (Google Places, Foursquare…).
 * Permet d'hydrater la base locale à la demande pour une couverture mondiale,
 * sans coupler `PlacesService` à une API précise.
 */

/** Jeton d'injection NestJS pour le provider courant. */
export const PLACES_PROVIDER = Symbol('PLACES_PROVIDER');

export interface ProviderNearbyParams {
  lat: number;
  lng: number;
  /** Rayon en mètres (borné par le provider, max 50 km pour Google). */
  radius: number;
  /** Univers YUMIA recherché ; absent = recherche large. */
  universe?: Universe;
  /** Nombre max de lieux souhaités. */
  limit: number;
}

/** Lieu normalisé renvoyé par un provider, prêt à être persisté en base. */
export interface ProviderPlace {
  /** Identifiant stable côté fournisseur (sert à la déduplication). */
  providerPlaceId: string;
  name: string;
  universe: Universe;
  lat: number;
  lng: number;
  city: string;
  countryCode: string;
  address?: string;
  rating: number;
  priceTier: number;
  tags: string[];
}

export interface PlacesProvider {
  /** `false` = aucun fournisseur configuré → l'hydratation est désactivée. */
  readonly isEnabled: boolean;
  searchNearby(params: ProviderNearbyParams): Promise<ProviderPlace[]>;
}
