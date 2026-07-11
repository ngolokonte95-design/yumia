import { API_BASE_URL } from './config';

const API = API_BASE_URL;

export type IntentType = 'dispo' | 'explore' | 'event';

export interface SocialIntent {
  userId:      string;
  displayName: string;
  photoUrl?:   string;
  level:       number;
  lat:         number;
  lng:         number;
  intent:      IntentType;
  universe?:   string;
  note?:       string;
  expiresAt:   string;
  createdAt:   string;
}

export interface SocialEvent {
  id:               string;
  creatorId:        string;
  creatorName:      string;
  creatorPhotoUrl?: string;
  lat:              number;
  lng:              number;
  universe?:        string;
  title:            string;
  note?:            string;
  scheduledAt:      string;
  maxPeople:        number;
  participants:     string[];
  createdAt:        string;
  distanceKm?:      number;
}

export interface DiscoveredUser {
  userId:      string;
  lat:         number;
  lng:         number;
  distanceKm:  number;
  intent:      SocialIntent | null;
  user: { id: string; displayName: string; photoUrl?: string | null; bio?: string | null; level: number } | null;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function jsonHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function safeJson<T>(res: Response): Promise<T | null> {
  if (!res.ok) return null;
  try { return (await res.json()) as T; } catch { return null; }
}

export const socialApi = {
  // ── Intent signals ──────────────────────────────────────────────────────

  setIntent: (token: string, data: {
    lat: number; lng: number; intent: IntentType; universe?: string; note?: string; durationHours: number;
  }) =>
    fetch(`${API}/social/intent`, {
      method: 'PUT',
      headers: jsonHeaders(token),
      body: JSON.stringify(data),
    }).then((r) => safeJson<SocialIntent>(r)),

  clearIntent: (token: string) =>
    fetch(`${API}/social/intent`, { method: 'DELETE', headers: authHeaders(token) }),

  getMyIntent: (token: string) =>
    fetch(`${API}/social/intent/me`, { headers: authHeaders(token) }).then((r) =>
      safeJson<SocialIntent | null>(r),
    ),

  getNearbyIntents: (token: string, lat: number, lng: number, radius = 5) =>
    fetch(`${API}/social/intents/nearby?lat=${lat}&lng=${lng}&radius=${radius}`, {
      headers: authHeaders(token),
    }).then(async (r) => {
      const d = await safeJson<SocialIntent[]>(r);
      return d ?? [];
    }),

  // ── Social Events ────────────────────────────────────────────────────────

  createEvent: (token: string, data: {
    lat: number; lng: number; universe?: string; title: string; note?: string; scheduledAt: string; maxPeople?: number;
  }) =>
    fetch(`${API}/social/events`, {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify(data),
    }).then((r) => safeJson<SocialEvent>(r)),

  getNearbyEvents: (token: string, lat: number, lng: number, radius = 10) =>
    fetch(`${API}/social/events/nearby?lat=${lat}&lng=${lng}&radius=${radius}`, {
      headers: authHeaders(token),
    }).then(async (r) => {
      const d = await safeJson<SocialEvent[]>(r);
      return d ?? [];
    }),

  joinEvent: (token: string, eventId: string) =>
    fetch(`${API}/social/events/${eventId}/join`, {
      method: 'POST',
      headers: authHeaders(token),
    }).then((r) => safeJson<SocialEvent>(r)),

  leaveEvent: (token: string, eventId: string) =>
    fetch(`${API}/social/events/${eventId}/leave`, {
      method: 'DELETE',
      headers: authHeaders(token),
    }),

  // ── Découverte ───────────────────────────────────────────────────────────

  discoverNearby: (token: string, lat: number, lng: number, radius = 5) =>
    fetch(`${API}/social/discover?lat=${lat}&lng=${lng}&radius=${radius}`, {
      headers: authHeaders(token),
    }).then(async (r) => {
      const d = await safeJson<DiscoveredUser[]>(r);
      return d ?? [];
    }),

  // ── Follow ───────────────────────────────────────────────────────────────

  follow: (token: string, userId: string) =>
    fetch(`${API}/social/follow/${userId}`, { method: 'POST', headers: authHeaders(token) }),

  unfollow: (token: string, userId: string) =>
    fetch(`${API}/social/follow/${userId}`, { method: 'DELETE', headers: authHeaders(token) }),

  // ── Profiles & lists ─────────────────────────────────────────────────────

  getProfile: (token: string, userId: string) =>
    fetch(`${API}/social/users/${userId}`, { headers: authHeaders(token) }).then((r) =>
      safeJson<{
        id: string; displayName: string; photoUrl?: string; bio?: string;
        totalXp: number; level: number; followersCount: number;
        followingCount: number; visitCount: number; isFollowedByMe: boolean;
      }>(r),
    ),

  getFollowers: (token: string, userId: string) =>
    fetch(`${API}/social/users/${userId}/followers`, { headers: authHeaders(token) }).then(async (r) => {
      const d = await safeJson<{ id: string; displayName: string; photoUrl?: string; bio?: string; level: number }[]>(r);
      return d ?? [];
    }),

  getFollowing: (token: string, userId: string) =>
    fetch(`${API}/social/users/${userId}/following`, { headers: authHeaders(token) }).then(async (r) => {
      const d = await safeJson<{ id: string; displayName: string; photoUrl?: string; bio?: string; level: number }[]>(r);
      return d ?? [];
    }),

  searchUsers: (token: string, query: string, limit = 20) =>
    fetch(`${API}/social/users/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
      headers: authHeaders(token),
    }).then(async (r) => {
      const d = await safeJson<{ id: string; displayName: string; photoUrl?: string; bio?: string; totalXp: number; level: number }[]>(r);
      return d ?? [];
    }),

  getFeed: (token: string, limit = 30) =>
    fetch(`${API}/social/feed?limit=${limit}`, { headers: authHeaders(token) }).then(async (r) => {
      const d = await safeJson<unknown[]>(r);
      return d ?? [];
    }),
};
