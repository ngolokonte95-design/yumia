import { WeatherUnavailableError } from './provider';
import type { Coordinates } from './types';

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

/**
 * Résultat d'une recherche de ville — assez d'info pour l'afficher (nom, pays,
 * région) et pour interroger le fournisseur météo (coordonnées).
 */
export interface CitySuggestion extends Coordinates {
  id: number;
  name: string;
  country?: string;
  /** Région/état, pour désambiguïser (ex. plusieurs « Springfield »). */
  admin1?: string;
}

interface RawCity {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

/**
 * Recherche de ville dans le monde entier. Utilise l'API de géocodage
 * d'Open-Meteo — même fournisseur que la météo elle-même, donc gratuite, sans
 * clé et sans quota bloquant, cohérent avec le reste de la couche Services.
 */
export async function searchCities(query: string, signal?: AbortSignal): Promise<CitySuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const params = new URLSearchParams({ name: q, count: '8', language: 'fr', format: 'json' });
  const res = await fetch(`${GEOCODING_URL}?${params}`, { signal });
  if (!res.ok) throw new WeatherUnavailableError(`Recherche de ville : HTTP ${res.status}`);

  const data = (await res.json()) as { results?: RawCity[] };
  if (!Array.isArray(data.results)) return [];

  return data.results.map((r) => ({
    id: r.id,
    name: r.name,
    country: r.country,
    admin1: r.admin1,
    lat: r.latitude,
    lng: r.longitude,
  }));
}
