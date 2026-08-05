/**
 * Client du calendrier Yumia.
 *
 * Les dates circulent en ISO 8601 UTC ; `timezone` porte séparément le fuseau
 * du lieu de l'événement. Voir `lib/calendar-format.ts` pour l'affichage.
 */
import { API_BASE_URL } from './config';

const API = API_BASE_URL;

export const CATEGORIES = [
  'restaurant', 'activity', 'travel', 'hotel', 'event', 'personal', 'birthday',
] as const;
export type EventCategory = (typeof CATEGORIES)[number];

export const CATEGORY_META: Record<EventCategory, { label: string; emoji: string; color: string }> = {
  restaurant: { label: 'Restaurant', emoji: '🍽️', color: '#E8621A' },
  activity: { label: 'Activité', emoji: '🎯', color: '#2BB673' },
  travel: { label: 'Voyage', emoji: '✈️', color: '#5C4ECC' },
  hotel: { label: 'Hôtel', emoji: '🏨', color: '#8B4FD6' },
  event: { label: 'Événement', emoji: '🎟️', color: '#F2B705' },
  personal: { label: 'Personnel', emoji: '📌', color: '#6E6E80' },
  birthday: { label: 'Anniversaire', emoji: '🎂', color: '#E5484D' },
};

export interface CalendarEvent {
  id: string;
  /** Clé unique de CETTE occurrence — à utiliser comme clé de liste. */
  occurrenceId: string;
  title: string;
  notes: string | null;
  category: string;
  startAt: string;
  endAt: string | null;
  timezone: string;
  allDay: boolean;
  recurring: boolean;
  rrule: string | null;
  reminderMinutes: number | null;
  placeId: string | null;
  placeName: string | null;
  address: string | null;
}

export interface EventDraft {
  title: string;
  notes?: string | null;
  category?: string;
  startAt: string;
  endAt?: string | null;
  timezone?: string;
  allDay?: boolean;
  rrule?: string | null;
  reminderMinutes?: number | null;
  placeId?: string | null;
  placeName?: string | null;
  address?: string | null;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}
function json(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
async function safe<T>(res: Response, fallback: T): Promise<T> {
  if (!res.ok) return fallback;
  try { return (await res.json()) as T; } catch { return fallback; }
}

export const calendarApi = {
  /** Occurrences chevauchant la période, séries récurrentes développées. */
  list: (token: string, from: Date, to: Date, category?: string) => {
    const params = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
    });
    if (category) params.set('category', category);
    return fetch(`${API}/calendar?${params}`, { headers: auth(token) })
      .then((r) => safe<CalendarEvent[]>(r, []));
  },

  search: (token: string, q: string) =>
    fetch(`${API}/calendar/search?q=${encodeURIComponent(q)}`, { headers: auth(token) })
      .then((r) => safe<CalendarEvent[]>(r, [])),

  create: (token: string, draft: EventDraft) =>
    fetch(`${API}/calendar`, { method: 'POST', headers: json(token), body: JSON.stringify(draft) })
      .then((r) => safe<CalendarEvent | null>(r, null)),

  update: (token: string, id: string, patch: Partial<EventDraft>) =>
    fetch(`${API}/calendar/${id}`, { method: 'PATCH', headers: json(token), body: JSON.stringify(patch) })
      .then((r) => safe<CalendarEvent | null>(r, null)),

  /** Supprime l'événement et toute sa série. */
  remove: (token: string, id: string) =>
    fetch(`${API}/calendar/${id}`, { method: 'DELETE', headers: auth(token) })
      .then((r) => r.ok),

  /** Supprime une seule occurrence d'une série. */
  removeOccurrence: (token: string, id: string, startAtIso: string) =>
    fetch(`${API}/calendar/${id}/occurrences/${encodeURIComponent(startAtIso)}`, {
      method: 'DELETE', headers: auth(token),
    }).then((r) => r.ok),
};
