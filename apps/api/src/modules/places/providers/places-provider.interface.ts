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
  /** Références opaques des photos côté fournisseur (résolues via proxy). */
  photoRefs?: string[];
  /** Horaires lisibles par jour (ex. "lundi : 09:00 – 18:00"). */
  openingHours?: string[];
}

export interface PlacesProvider {
  /** `false` = aucun fournisseur configuré → l'hydratation est désactivée. */
  readonly isEnabled: boolean;
  searchNearby(params: ProviderNearbyParams): Promise<ProviderPlace[]>;
  /** Recherche textuelle (par ville, sans géoloc). Optionnelle selon le provider. */
  searchByText?(textQuery: string, universe?: Universe, limit?: number): Promise<ProviderPlace[]>;
  /**
   * Recherche textuelle **géolocalisée** (ex. plat précis « couscous » autour de
   * l'utilisateur). Biaisée par un cercle lat/lng/rayon. Optionnelle.
   */
  searchTextNearby?(
    textQuery: string,
    lat: number,
    lng: number,
    radius: number,
    universe?: Universe,
    limit?: number,
    /** Force l'univers demandé sur les résultats (recherche textuelle ciblée). */
    forceUniverse?: boolean,
  ): Promise<ProviderPlace[]>;
  /**
   * Résout une référence photo en URL d'image directe (sans clé API), pour le
   * proxy `GET /places/photo`. `null` si non supporté ou indisponible.
   */
  resolvePhotoUrl?(ref: string, maxWidthPx: number): Promise<string | null>;
}
