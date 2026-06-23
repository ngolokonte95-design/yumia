/**
 * Client des endpoints Passeport & gamification (`/passport/*`, protégés).
 * Miroir des sorties de `apps/api` (module `passport`).
 */
import type { Badge, Level, Universe } from '@yumia/shared';
import { request } from './api';

/** Ressenti d'une visite (miroir de l'enum Prisma côté API). */
export type VisitFeedback = 'loved' | 'neutral' | 'disliked';

export interface PassportStats {
  totalXp: number;
  level: {
    current: Level;
    next: Level | null;
    xpIntoLevel: number;
    xpForNext: number | null;
    ratio: number;
  };
  streak: { current: number; best: number; lastActivityDay: string | null; freezesLeft: number };
  badges: { earned: Badge[]; total: number };
}

export interface PassportVisit {
  id: string;
  visitedAt: string;
  feedback: VisitFeedback | null;
  xpAwarded: number;
  place: {
    id: string;
    name: string;
    universe: Universe;
    city: string;
    countryCode: string;
    rating: number;
  };
}

export interface Passport {
  totalVisits: number;
  distinctCountries: number;
  distinctUniverses: number;
  visits: PassportVisit[];
}

export interface VisitResult {
  visitId: string;
  xpAwarded: number;
  totalXp: number;
  level: number;
  streak: { current: number; best: number };
  newBadges: Badge[];
}

export function getStats(token: string): Promise<PassportStats> {
  return request<PassportStats>('/passport/stats', { token });
}

export function getPassport(token: string): Promise<Passport> {
  return request<Passport>('/passport', { token });
}

export function getHeatmap(token: string): Promise<Record<string, number>> {
  return request<Record<string, number>>('/passport/heatmap', { token });
}

export interface UniverseCount { universe: string; count: number }

export function getUniverseBreakdown(token: string): Promise<UniverseCount[]> {
  return request<UniverseCount[]>('/passport/universes', { token });
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string | null;
  weeklyXp: number;
  totalXp: number;
  level: number;
  streak: number;
}

export function getLeaderboard(token: string, city?: string): Promise<LeaderboardEntry[]> {
  const path = city
    ? `/passport/leaderboard?city=${encodeURIComponent(city)}`
    : '/passport/leaderboard';
  return request<LeaderboardEntry[]>(path, { token });
}

export function recordVisit(
  token: string,
  placeId: string,
  feedback?: VisitFeedback,
  notes?: string,
): Promise<VisitResult> {
  return request<VisitResult>('/passport/visits', {
    method: 'POST',
    token,
    body: { placeId, ...(feedback ? { feedback } : {}), ...(notes ? { notes } : {}) },
  });
}

export function freezeStreak(
  token: string,
): Promise<{ freezesLeft: number; streakCurrent: number }> {
  return request<{ freezesLeft: number; streakCurrent: number }>('/passport/streak/freeze', {
    method: 'POST',
    token,
  });
}

export interface VisitHistoryItem extends Omit<PassportVisit, 'place'> {
  notes: string | null;
  place: PassportVisit['place'];
}

export interface VisitHistoryPage {
  items: VisitHistoryItem[];
  nextCursor: string | null;
  total: number;
}

export function getVisitHistory(
  token: string,
  limit = 20,
  cursor?: string,
): Promise<VisitHistoryPage> {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (cursor) qs.set('cursor', cursor);
  return request<VisitHistoryPage>(`/passport/visits/history?${qs.toString()}`, { token });
}
