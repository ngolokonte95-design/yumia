/**
 * Client des endpoints itinéraire (`/itinerary/*`).
 */
import { request } from './api';

/** Un moment d'une journée — mode semaine uniquement. */
export interface ItineraryMoment {
  time: string;
  type: string;
  name: string;
  description: string;
  emoji: string;
  tips?: string;
  placeId?: string;
  placeRating?: number;
  placePhoto?: string;
  placeLat?: number;
  placeLng?: number;
}

export interface ItineraryStep {
  time: string;
  type: string;
  name: string;
  description: string;
  duration: string;
  emoji: string;
  tips?: string;
  placeId?: string;
  placeRating?: number;
  placePhoto?: string;
  placeLat?: number;
  placeLng?: number;
  /** Découpage de la journée — présent seulement en mode semaine. */
  moments?: ItineraryMoment[];
}

export interface SavedItinerary {
  id: string;
  mood: string;
  duration: string;
  budget: string;
  city: string;
  summary: string;
  steps: ItineraryStep[];
  createdAt: string;
}

export function saveItinerary(
  accessToken: string,
  dto: { mood: string; duration: string; budget: string; city: string; summary: string; steps: ItineraryStep[] },
): Promise<SavedItinerary> {
  return request<SavedItinerary>('/itinerary/save', { method: 'POST', body: dto, token: accessToken });
}

export function fetchSavedItineraries(accessToken: string): Promise<SavedItinerary[]> {
  return request<SavedItinerary[]>('/itinerary/saved', { token: accessToken });
}

export function deleteSavedItinerary(accessToken: string, id: string): Promise<void> {
  return request<void>(`/itinerary/saved/${id}`, { method: 'DELETE', token: accessToken });
}
