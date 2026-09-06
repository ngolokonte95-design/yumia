/**
 * Client des endpoints affiliation (`/affiliates/*`, `/places/:id/affiliate-*`).
 */
import type { Universe } from '@yumia/shared';
import { request } from './api';

export interface AffiliateProviderAvailability {
  key: string;
  configured: boolean;
}

export interface DealPlace {
  id: string;
  name: string;
  universe: Universe;
  lat: number;
  lng: number;
  city: string;
  countryCode: string;
  rating: number;
  priceTier: number;
  photoUrls: string[];
  tags: string[];
  distanceMeters: number;
  affiliateProviders: string[];
}

/** Partenaires d'affiliation pertinents pour ce lieu (peut être vide — la plupart des univers n'en ont pas). */
export async function fetchAffiliateProviders(placeId: string, accessToken: string): Promise<AffiliateProviderAvailability[]> {
  const data = await request<{ providers: AffiliateProviderAvailability[] }>(`/places/${placeId}/affiliate-providers`, { token: accessToken });
  return data.providers;
}

/** Génère (et trace côté serveur) un lien de réservation pour un partenaire donné. */
export async function fetchBookingLink(placeId: string, provider: string, accessToken: string): Promise<string> {
  const data = await request<{ url: string }>(`/places/${placeId}/booking-link?provider=${encodeURIComponent(provider)}`, { token: accessToken });
  return data.url;
}

/** Lien tracké générique (pas de lieu précis) pour un onglet Explorer type "Transfert aéroport". */
export async function fetchGenericAffiliateLink(category: string, accessToken: string): Promise<string> {
  const data = await request<{ url: string }>(`/affiliates/generic-link?category=${encodeURIComponent(category)}`, { token: accessToken });
  return data.url;
}

export interface GenericCategoryAvailability {
  category: string;
  provider: string;
  configured: boolean;
}

/** Catégories génériques réellement disponibles (provider configuré + activé) — permet de masquer une tuile prête côté code mais pas encore activée (ex. Booking.com en attente d'approbation). */
export async function fetchGenericCategories(accessToken: string): Promise<GenericCategoryAvailability[]> {
  const data = await request<{ categories: GenericCategoryAvailability[] }>('/affiliates/generic-categories', { token: accessToken });
  return data.categories;
}

/** Lieux proches avec au moins un partenaire de réservation configuré — alimente l'onglet "Bons plans". */
export async function fetchNearbyDeals(params: { lat: number; lng: number; radius?: number }, accessToken: string): Promise<DealPlace[]> {
  const q = new URLSearchParams();
  q.set('lat', String(params.lat));
  q.set('lng', String(params.lng));
  if (params.radius != null) q.set('radius', String(params.radius));
  return request<DealPlace[]>(`/affiliates/deals?${q.toString()}`, { token: accessToken });
}
