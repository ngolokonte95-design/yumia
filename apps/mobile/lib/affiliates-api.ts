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

/** Lieux proches avec au moins un partenaire de réservation configuré — alimente l'onglet "Bons plans". */
export async function fetchNearbyDeals(params: { lat: number; lng: number; radius?: number }, accessToken: string): Promise<DealPlace[]> {
  const q = new URLSearchParams();
  q.set('lat', String(params.lat));
  q.set('lng', String(params.lng));
  if (params.radius != null) q.set('radius', String(params.radius));
  return request<DealPlace[]>(`/affiliates/deals?${q.toString()}`, { token: accessToken });
}
