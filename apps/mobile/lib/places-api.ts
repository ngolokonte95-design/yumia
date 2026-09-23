/**
 * Client des endpoints Lieux (`/places/*`, publics).
 */
import type { Universe } from '@yumia/shared';
import { request } from './api';
import { API_BASE_URL } from './config';
import { appendFile } from './upload';

/** Lieu renvoyé par `/places/nearby` (miroir de `PlaceWithDistance` de l'API). */
export interface NearbyPlace {
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
  openingHours?: string[];
  distanceMeters: number;
}

export interface NearbyParams {
  lat: number;
  lng: number;
  radius?: number;
  universe?: Universe;
  limit?: number;
}

/** Lieux proches d'un point, triés par distance croissante. */
export function fetchNearby(params: NearbyParams): Promise<NearbyPlace[]> {
  const q = new URLSearchParams();
  q.set('lat', String(params.lat));
  q.set('lng', String(params.lng));
  if (params.radius != null) q.set('radius', String(params.radius));
  if (params.universe) q.set('universe', params.universe);
  if (params.limit != null) q.set('limit', String(params.limit));
  return request<NearbyPlace[]>(`/places/nearby?${q.toString()}`);
}

/**
 * Recherche de lieux par nom (`/places/search`).
 *
 * La position n'est qu'une préférence : elle fait remonter les résultats
 * proches en premier, mais on peut chercher un lieu à l'autre bout du monde.
 */
export function searchPlacesByName(
  query: string,
  near?: { lat: number; lng: number },
  limit = 20,
): Promise<NearbyPlace[]> {
  const q = new URLSearchParams();
  q.set('q', query);
  if (near) {
    q.set('lat', String(near.lat));
    q.set('lng', String(near.lng));
  }
  q.set('limit', String(limit));
  return request<NearbyPlace[]>(`/places/search?${q.toString()}`);
}

/** Lieu tendance : NearbyPlace enrichi du nombre de visites récentes. */
export interface TrendingPlace extends NearbyPlace {
  visitCount: number;
}

export interface TrendingParams {
  lat: number;
  lng: number;
  radius?: number;
  limit?: number;
  hours?: number;
}

/** Lieux les plus visités dans un rayon donné sur les dernières N heures. */
export function fetchTrending(params: TrendingParams): Promise<TrendingPlace[]> {
  const q = new URLSearchParams();
  q.set('lat', String(params.lat));
  q.set('lng', String(params.lng));
  if (params.radius != null) q.set('radius', String(params.radius));
  if (params.limit != null) q.set('limit', String(params.limit));
  if (params.hours != null) q.set('hours', String(params.hours));
  return request<TrendingPlace[]>(`/places/trending?${q.toString()}`);
}

/** Lieu renvoyé par `/places/city` (sans distance). */
export interface CityPlace {
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
}

/**
 * Retrouve un lieu par son NOM dans une ville, en l'important au besoin.
 *
 * Sert les moments d'un itinéraire, qui désignent des endroits précis absents
 * de notre base. Appelé au CLIC et non à l'affichage : chaque résolution
 * interroge le fournisseur de lieux, facturé à l'appel.
 *
 * Renvoie `null` plutôt que de lever quand rien ne correspond — c'est une
 * issue normale, pas une panne.
 */
export async function resolvePlaceByName(
  name: string,
  city: string,
  universe?: Universe,
  /** Pour illustrer : n'accepter qu'un lieu qui porte vraiment ce nom. */
  verify = false,
): Promise<CityPlace | null> {
  const q = new URLSearchParams();
  q.set('name', name);
  q.set('city', city);
  if (universe) q.set('universe', universe);
  if (verify) q.set('verify', '1');
  try {
    return await request<CityPlace>(`/places/resolve?${q.toString()}`);
  } catch {
    return null;
  }
}

/** Recherche de lieux par ville (sans géolocalisation), filtrable par univers. */
export function fetchByCity(name: string, universe?: Universe, limit?: number): Promise<CityPlace[]> {
  const q = new URLSearchParams();
  q.set('name', name);
  if (universe) q.set('universe', universe);
  if (limit != null) q.set('limit', String(limit));
  return request<CityPlace[]>(`/places/city?${q.toString()}`);
}

export interface PlaceStats {
  loved: number;
  neutral: number;
  disliked: number;
  total: number;
}

/** Avis agrégés de la communauté pour un lieu. */
export function fetchPlaceStats(placeId: string): Promise<PlaceStats> {
  return request<PlaceStats>(`/places/${placeId}/stats`);
}

/** Détail d'un lieu par son identifiant (pour les deep links). */
export function fetchPlaceById(id: string): Promise<NearbyPlace & { openNow?: boolean }> {
  return request<NearbyPlace & { openNow?: boolean }>(`/places/${id}`);
}

/** Ce que la fiche d'un lieu charge à son ouverture (`GET /places/:id/details`). */
export interface PlaceDetails {
  photoUrls: string[];
  openingHours: string[];
  /** Moyenne des avis YUMIA, 0 si personne n'a noté. */
  rating: number;
  reviewCount: number;
}

export function fetchPlaceDetails(id: string): Promise<PlaceDetails> {
  return request<PlaceDetails>(`/places/${id}/details`);
}

/** Upload d'une photo de visite pour un lieu (multipart/form-data). */
export async function uploadPlacePhoto(
  accessToken: string,
  placeId: string,
  imageUri: string,
): Promise<{ photoUrl: string }> {
  const form = new FormData();
  appendFile(form, 'photo', imageUri);

  const res = await fetch(`${API_BASE_URL}/places/${placeId}/photos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? 'Upload échoué.');
  }
  return res.json() as Promise<{ photoUrl: string }>;
}
