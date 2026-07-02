import { Logger } from '@nestjs/common';
import type { Universe } from '@yumia/shared';
import {
  googleTypesToUniverse,
  universeToGoogleTypes,
} from './place-types';
import type {
  PlacesProvider,
  ProviderNearbyParams,
  ProviderPlace,
} from './places-provider.interface';

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchNearby';
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RADIUS_M = 50_000;
const MAX_RESULTS = 20;

// Champs demandés (FieldMask) — pilote le coût (SKU). On reste sur le strict
// nécessaire : identité, position, note, prix, types et adresse structurée.
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.rating',
  'places.priceLevel',
  'places.types',
  'places.formattedAddress',
  'places.addressComponents',
  'places.photos',
  'places.regularOpeningHours',
].join(',');

const MAX_PHOTOS = 3;

const PRICE_LEVEL_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 1,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

interface GoogleAddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  priceLevel?: string;
  types?: string[];
  formattedAddress?: string;
  addressComponents?: GoogleAddressComponent[];
  photos?: { name?: string }[];
  regularOpeningHours?: { weekdayDescriptions?: string[] };
}

/** Erreur interne : `includedTypes` refusé par Google (400 INVALID_ARGUMENT). */
class InvalidArgumentError extends Error {}

/**
 * Fournisseur Google Places API (« New ») — `places:searchNearby`.
 * Couverture mondiale en direct ; les résultats sont normalisés en
 * {@link ProviderPlace} puis persistés par `PlacesService`.
 */
export class GooglePlacesProvider implements PlacesProvider {
  readonly isEnabled = true;
  private readonly logger = new Logger(GooglePlacesProvider.name);

  constructor(private readonly apiKey: string) {}

  async searchNearby(params: ProviderNearbyParams): Promise<ProviderPlace[]> {
    const includedTypes = universeToGoogleTypes(params.universe);
    try {
      return await this.request(params, includedTypes);
    } catch (err) {
      // Type Google refusé → repli en recherche large puis filtrage local.
      if (err instanceof InvalidArgumentError && includedTypes.length > 0) {
        this.logger.warn(`includedTypes refusé, repli large : ${err.message}`);
        const all = await this.request(params, []);
        return params.universe ? all.filter((p) => p.universe === params.universe) : all;
      }
      throw err;
    }
  }

  private async request(
    params: ProviderNearbyParams,
    includedTypes: string[],
  ): Promise<ProviderPlace[]> {
    const body: Record<string, unknown> = {
      maxResultCount: Math.min(params.limit, MAX_RESULTS),
      locationRestriction: {
        circle: {
          center: { latitude: params.lat, longitude: params.lng },
          radius: Math.min(Math.max(params.radius, 1), MAX_RADIUS_M),
        },
      },
    };
    if (includedTypes.length > 0) body.includedTypes = includedTypes;

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 400 && text.includes('INVALID_ARGUMENT')) {
        throw new InvalidArgumentError(text.slice(0, 200));
      }
      throw new Error(`Google Places ${res.status} : ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as { places?: GooglePlace[] };
    return (data.places ?? []).flatMap((g) => {
      const mapped = this.mapPlace(g, params.universe);
      return mapped ? [mapped] : [];
    });
  }

  private mapPlace(g: GooglePlace, requested?: Universe): ProviderPlace | null {
    const name = g.displayName?.text;
    const lat = g.location?.latitude;
    const lng = g.location?.longitude;
    if (!g.id || !name || typeof lat !== 'number' || typeof lng !== 'number') return null;

    const types = g.types ?? [];
    const { city, countryCode } = extractLocality(g.addressComponents ?? [], g.formattedAddress);

    const photoRefs = (g.photos ?? [])
      .slice(0, MAX_PHOTOS)
      .map((p) => p.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0);
    const openingHours = g.regularOpeningHours?.weekdayDescriptions;

    return {
      providerPlaceId: g.id,
      name,
      universe: googleTypesToUniverse(types, requested ?? 'restaurant'),
      lat,
      lng,
      city,
      countryCode,
      ...(g.formattedAddress ? { address: g.formattedAddress } : {}),
      rating: typeof g.rating === 'number' ? g.rating : 0,
      priceTier: g.priceLevel ? PRICE_LEVEL_MAP[g.priceLevel] ?? 2 : 2,
      tags: types.slice(0, 6),
      ...(photoRefs.length > 0 ? { photoRefs } : {}),
      ...(openingHours && openingHours.length > 0 ? { openingHours } : {}),
    };
  }

  /**
   * Recherche textuelle (Text Search) — ex. « restaurant in Tokyo ». Permet la
   * recherche par ville sans géolocalisation. Mappe vers {@link ProviderPlace}.
   */
  async searchByText(textQuery: string, universe?: Universe, limit = MAX_RESULTS): Promise<ProviderPlace[]> {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({ textQuery, maxResultCount: Math.min(limit, MAX_RESULTS) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Google Places (text) ${res.status} : ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { places?: GooglePlace[] };
    return (data.places ?? []).flatMap((g) => {
      const mapped = this.mapPlace(g, universe);
      return mapped ? [mapped] : [];
    });
  }

  /**
   * Recherche textuelle **géolocalisée** — ex. « couscous », « ramen », biaisée
   * autour d'un point. Google cherche dans le nom, les types ET les avis, donc
   * un plat précis remonte les lieux qui le servent réellement (précision
   * « carte des menus » sans base de menus). Mappe vers {@link ProviderPlace}.
   */
  async searchTextNearby(
    textQuery: string,
    lat: number,
    lng: number,
    radius: number,
    universe?: Universe,
    limit = MAX_RESULTS,
  ): Promise<ProviderPlace[]> {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery,
        maxResultCount: Math.min(limit, MAX_RESULTS),
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: Math.min(Math.max(radius, 1), MAX_RADIUS_M),
          },
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Google Places (textNearby) ${res.status} : ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { places?: GooglePlace[] };
    return (data.places ?? []).flatMap((g) => {
      const mapped = this.mapPlace(g, universe);
      return mapped ? [mapped] : [];
    });
  }

  /**
   * Retrouve les références photo d'un lieu par son nom + position (Text Search),
   * pour enrichir a posteriori les lieux seed dépourvus de photos.
   * Renvoie au plus {@link MAX_PHOTOS} références (vide si rien trouvé).
   */
  async findPhotoRefs(textQuery: string, lat: number, lng: number): Promise<string[]> {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': 'places.id,places.photos',
      },
      body: JSON.stringify({
        textQuery,
        maxResultCount: 1,
        locationBias: {
          circle: { center: { latitude: lat, longitude: lng }, radius: 500 },
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      this.logger.warn(`findPhotoRefs ${res.status} pour "${textQuery}"`);
      return [];
    }
    const data = (await res.json()) as { places?: GooglePlace[] };
    const photos = data.places?.[0]?.photos ?? [];
    return photos
      .slice(0, MAX_PHOTOS)
      .map((p) => p.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0);
  }

  /**
   * Résout une référence photo Google en URL d'image directe (googleusercontent),
   * SANS exposer la clé : on demande `skipHttpRedirect` pour récupérer `photoUri`
   * (une URL signée, sans clé), que le proxy renverra au client.
   */
  async resolvePhotoUrl(ref: string, maxWidthPx: number): Promise<string | null> {
    const width = Math.min(Math.max(maxWidthPx || 800, 1), 4_800);
    const url = `https://places.googleapis.com/v1/${ref}/media?maxWidthPx=${width}&skipHttpRedirect=true`;
    const res = await fetch(url, {
      headers: { 'X-Goog-Api-Key': this.apiKey },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      this.logger.warn(`Résolution photo échouée (${res.status}) pour ${ref}`);
      return null;
    }
    const data = (await res.json()) as { photoUri?: string };
    return data.photoUri ?? null;
  }
}

/** Extrait ville + code pays des composants d'adresse Google (avec repli). */
function extractLocality(
  components: GoogleAddressComponent[],
  formattedAddress?: string,
): { city: string; countryCode: string } {
  let city = '';
  let countryCode = '';
  for (const c of components) {
    const t = c.types ?? [];
    if (!city && (t.includes('locality') || t.includes('postal_town'))) {
      city = c.longText ?? c.shortText ?? '';
    }
    if (!city && t.includes('administrative_area_level_2')) {
      city = c.longText ?? c.shortText ?? '';
    }
    if (!countryCode && t.includes('country')) {
      countryCode = (c.shortText ?? '').toUpperCase();
    }
  }
  // Repli ville : avant-dernier segment de l'adresse formatée ("…, Ville, Pays").
  if (!city && formattedAddress) {
    const parts = formattedAddress.split(',').map((s) => s.trim()).filter(Boolean);
    city = parts.length >= 2 ? parts[parts.length - 2] : parts[0] ?? 'Inconnu';
  }
  return { city: city || 'Inconnu', countryCode };
}
