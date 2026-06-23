import { request, type Top3Response } from './api';

export interface SearchPayload {
  lat: number;
  lng: number;
  query: string;
  radius?: number;
  locale?: string;
  favoriteUniverses?: string[];
  restrictions?: string[];
  universeFilter?: string;
  maxPriceTier?: number;
}

export function searchPlaces(token: string | null, payload: SearchPayload): Promise<Top3Response> {
  return request<Top3Response>('/recommendations/search', {
    method: 'POST',
    body: payload,
    token: token ?? undefined,
  });
}
