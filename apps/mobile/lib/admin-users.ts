/**
 * Centre de contrôle admin — types et appels partagés par la liste des
 * comptes et la fiche d'un compte.
 */
import { API_BASE_URL } from './config';

export type UserSegment =
  | 'all' | 'premium' | 'active7d' | 'newToday' | 'new7d' | 'new30d' | 'suspended' | 'banned';

export const SEGMENT_LABEL: Record<UserSegment, string> = {
  all: 'Tous',
  premium: 'Premium',
  active7d: 'Actifs 7 j',
  newToday: "Aujourd'hui",
  new7d: 'Nouveaux 7 j',
  new30d: 'Nouveaux 30 j',
  suspended: 'Suspendus',
  banned: 'Bannis',
};

export const PLAN_LABEL: Record<string, string> = {
  free: 'Gratuit', plus: 'Plus', gold: 'Gold', diamond: 'Diamond',
};

export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  photoUrl: string | null;
  countryCode: string | null;
  plan: string;
  isPremium: boolean;
  createdAt: string;
  suspendedUntil: string | null;
  suspendedReason: string | null;
  isAdmin: boolean;
}

export interface AdminUserDetail extends AdminUserRow {
  bio: string | null;
  locale: string;
  authProvider: string;
  premiumSince: string | null;
  updatedAt: string;
  lastVisitAt: string | null;
  stats: {
    visits: number;
    savedPlaces: number;
    orders: number;
    savedItineraries: number;
    posts: number;
    reportsAgainst: number;
    reportsMade: number;
    activeSessions: number;
  };
}

/** État de sanction d'un compte, déduit de sa date de fin. */
export function accountStatus(suspendedUntil: string | null): 'active' | 'suspended' | 'banned' {
  if (!suspendedUntil) return 'active';
  const until = new Date(suspendedUntil).getTime();
  if (until <= Date.now()) return 'active';
  // Au-delà de 50 ans, c'est un bannissement (le serveur pose +100 ans).
  return until - Date.now() > 50 * 365 * 86400000 ? 'banned' : 'suspended';
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

async function call<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } | string };
      const err = body.error;
      if (typeof err === 'string') message = err;
      else if (err?.message) message = err.message;
    } catch {
      // corps non JSON
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const adminUsersApi = {
  list: (token: string, p: { segment: UserSegment; q?: string; country?: string; offset: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (p.segment !== 'all') qs.set('segment', p.segment);
    if (p.q?.trim()) qs.set('q', p.q.trim());
    if (p.country) qs.set('country', p.country);
    qs.set('offset', String(p.offset));
    qs.set('limit', String(p.limit ?? 30));
    return call<{ total: number; items: AdminUserRow[] }>(token, `/admin/users?${qs.toString()}`);
  },
  detail: (token: string, id: string) => call<AdminUserDetail>(token, `/admin/users/${id}`),
  /** `days` absent = bannissement définitif. */
  suspend: (token: string, id: string, days: number | undefined, reason: string) =>
    call<{ suspendedUntil: string }>(token, `/admin/users/${id}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ days, reason: reason.trim() || undefined }),
    }),
  unsuspend: (token: string, id: string) =>
    call<{ ok: boolean }>(token, `/admin/users/${id}/unsuspend`, { method: 'POST' }),
};
