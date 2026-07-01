/**
 * Client des endpoints "business" : guides locaux, établissements boostés,
 * billetterie. Réservation/achat protégés par JWT ; les listes sont publiques.
 */
import { request } from './api';

/** Guide certifié renvoyé par `GET /guides?city=`. */
export interface Guide {
  id: string;
  name: string;
  city: string;
  countryCode: string;
  certified: boolean;
  pricePerPerson: number;
  rating: number;
  bio: string | null;
  createdAt: string;
}

/** Établissement boosté (avec événement de billetterie) — `GET /venues/boosted`. */
export interface Venue {
  id: string;
  name: string;
  city: string | null;
  countryCode: string | null;
  boostLevel: number;
  eventName: string | null;
  eventDate: string | null;
  ticketPrice: number | null;
  photoUrl: string | null;
}

export interface GuideBooking {
  id: string;
  guideId: string;
  date: string;
  people: number;
  totalPrice: number;
  commission: number;
  status: string;
}

export interface Ticket {
  id: string;
  venueId: string;
  eventId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  commission: number;
  status: string;
}

/** Guides certifiés d'une ville (mieux notés en premier). */
export function fetchGuides(city: string, limit = 20): Promise<Guide[]> {
  const q = new URLSearchParams({ city, limit: String(limit) });
  return request<Guide[]>(`/guides?${q.toString()}`);
}

/** Réserve un guide pour une date et un nombre de personnes (commission 20%). */
export function bookGuide(
  token: string,
  guideId: string,
  dateIso: string,
  people: number,
): Promise<GuideBooking> {
  return request<GuideBooking>('/guides/book', {
    method: 'POST',
    body: { guideId, date: dateIso, people },
    token,
  });
}

/** Établissements actuellement mis en avant (avec leur événement). */
export function fetchBoostedVenues(params?: { lat?: number; lng?: number; radius?: number }): Promise<Venue[]> {
  const q = new URLSearchParams();
  if (params?.lat != null) q.set('lat', String(params.lat));
  if (params?.lng != null) q.set('lng', String(params.lng));
  if (params?.radius != null) q.set('radius', String(params.radius));
  const qs = q.toString();
  return request<Venue[]>(`/venues/boosted${qs ? `?${qs}` : ''}`);
}

/** Achat de billet(s) pour l'événement d'un établissement (commission 15%). */
export function purchaseTicket(
  token: string,
  venueId: string,
  eventId: string,
  quantity: number,
  unitPrice: number,
): Promise<Ticket> {
  return request<Ticket>('/tickets/purchase', {
    method: 'POST',
    body: { venueId, eventId, quantity, unitPrice },
    token,
  });
}
