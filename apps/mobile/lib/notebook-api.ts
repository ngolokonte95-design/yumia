/**
 * Client du bloc-notes Yumia.
 *
 * Synchronisation : dernier écrivain gagne. Les mises à jour transmettent
 * l'`updatedAt` connu du client ; le serveur répond `staleWrite: true` s'il
 * détient une version plus récente, ce qui permet de prévenir l'utilisateur
 * plutôt que d'écraser en silence une saisie faite sur un autre appareil.
 */
import { API_BASE_URL } from './config';

const API = API_BASE_URL;

export type NoteKind = 'note' | 'checklist';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Note {
  id: string;
  title: string | null;
  content: string;
  kind: NoteKind;
  items: ChecklistItem[];
  color: string | null;
  pinned: boolean;
  archived: boolean;
  favorite: boolean;
  photoUrls: string[];
  links: string[];
  placeId: string | null;
  placeName: string | null;
  lat: number | null;
  lng: number | null;
  noteDate: string | null;
  calendarEventId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Présent en réponse d'une mise à jour concurrente. */
  staleWrite?: boolean;
}

export interface NoteDraft {
  title?: string | null;
  content?: string;
  kind?: NoteKind;
  items?: ChecklistItem[];
  color?: string | null;
  pinned?: boolean;
  archived?: boolean;
  favorite?: boolean;
  photoUrls?: string[];
  links?: string[];
  placeId?: string | null;
  placeName?: string | null;
  noteDate?: string | null;
  calendarEventId?: string | null;
  knownUpdatedAt?: string;
}

export interface NoteFilters {
  archived?: boolean;
  favorite?: boolean;
  q?: string;
  placeId?: string;
  calendarEventId?: string;
  date?: string;
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

export const notebookApi = {
  list: (token: string, filters: NoteFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.archived) params.set('archived', 'true');
    if (filters.favorite !== undefined) params.set('favorite', String(filters.favorite));
    if (filters.q) params.set('q', filters.q);
    if (filters.placeId) params.set('placeId', filters.placeId);
    if (filters.calendarEventId) params.set('calendarEventId', filters.calendarEventId);
    if (filters.date) params.set('date', filters.date);
    const qs = params.toString();
    return fetch(`${API}/notebook${qs ? `?${qs}` : ''}`, { headers: auth(token) })
      .then((r) => safe<Note[]>(r, []));
  },

  create: (token: string, draft: NoteDraft) =>
    fetch(`${API}/notebook`, { method: 'POST', headers: json(token), body: JSON.stringify(draft) })
      .then((r) => safe<Note | null>(r, null)),

  update: (token: string, id: string, draft: NoteDraft) =>
    fetch(`${API}/notebook/${id}`, { method: 'PATCH', headers: json(token), body: JSON.stringify(draft) })
      .then((r) => safe<Note | null>(r, null)),

  setArchived: (token: string, id: string, archived: boolean) =>
    fetch(`${API}/notebook/${id}/archive`, {
      method: 'PATCH', headers: json(token), body: JSON.stringify({ archived }),
    }).then((r) => safe<Note | null>(r, null)),

  remove: (token: string, id: string) =>
    fetch(`${API}/notebook/${id}`, { method: 'DELETE', headers: auth(token) })
      .then((r) => r.ok),
};
