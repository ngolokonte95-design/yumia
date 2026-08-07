/**
 * Client du centre de notifications Yumia.
 *
 * Chaque notification envoyée en push (like, commentaire, abonné, appel,
 * badge…) est aussi persistée côté serveur — voir NotificationsService côté
 * API. Ce client lit cet historique serveur, plutôt que l'ancien historique
 * local (SecureStore) qui ne voyait que les push reçues par CET appareil.
 */
import { API_BASE_URL } from './config';

const API = API_BASE_URL;

export interface ServerNotification {
  id: string;
  /** post_like | post_comment | new_follower | story_reply | incoming_call |
   *  encounter | badge_unlocked | level_up | streak_milestone |
   *  streak_danger | daily_digest | closing_soon | generic */
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationPage {
  items: ServerNotification[];
  nextCursor: string | null;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}
async function safe<T>(res: Response, fallback: T): Promise<T> {
  if (!res.ok) return fallback;
  try { return (await res.json()) as T; } catch { return fallback; }
}

export const notificationsApi = {
  list: (token: string, cursor?: string, limit = 30) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return fetch(`${API}/notifications?${params}`, { headers: auth(token) })
      .then((r) => safe<NotificationPage>(r, { items: [], nextCursor: null }));
  },

  unreadCount: (token: string) =>
    fetch(`${API}/notifications/unread-count`, { headers: auth(token) })
      .then((r) => safe<{ count: number }>(r, { count: 0 }))
      .then((d) => d.count),

  markRead: (token: string, id: string) =>
    fetch(`${API}/notifications/${id}/read`, { method: 'PATCH', headers: auth(token) })
      .then((r) => r.ok),

  markAllRead: (token: string) =>
    fetch(`${API}/notifications/read-all`, { method: 'PATCH', headers: auth(token) })
      .then((r) => r.ok),
};
