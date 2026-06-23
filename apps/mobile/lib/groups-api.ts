import { request } from './api';

export interface GroupMember {
  id: string;
  userId: string | null;
  displayName: string | null;
  photoUrl: string | null;
  votes: Record<string, 'like' | 'dislike'>;
  joinedAt: string;
  votedCount: number;
}

export interface GroupSuggestion {
  placeId: string;
  name: string;
  universe: string;
  city: string;
  rating: number;
  priceTier: number;
  photoUrl: string | null;
  likes: number;
  dislikes: number;
  score: number;
  myVote: 'like' | 'dislike' | null;
}

export interface GroupSession {
  id: string;
  inviteCode: string;
  status: 'waiting' | 'voting' | 'done';
  createdById: string | null;
  createdAt: string;
  decidedPlaceId: string | null;
  members: GroupMember[];
  suggestions: GroupSuggestion[];
  scores: Array<{ placeId: string; likes: number; dislikes: number; score: number }>;
}

export function createGroupRequest(token: string): Promise<GroupSession> {
  return request<GroupSession>('/groups', { method: 'POST', body: {}, token });
}

export function joinGroupRequest(token: string, code: string): Promise<GroupSession> {
  return request<GroupSession>(`/groups/join/${encodeURIComponent(code)}`, { method: 'POST', body: {}, token });
}

export function getGroupSession(token: string, id: string): Promise<GroupSession> {
  return request<GroupSession>(`/groups/${id}`, { token });
}

export function suggestGroupPlaces(
  token: string,
  id: string,
  lat: number,
  lng: number,
  locale: string,
): Promise<GroupSession> {
  return request<GroupSession>(`/groups/${id}/suggest`, {
    method: 'POST',
    body: { lat, lng, locale },
    token,
  });
}

export function voteGroupPlace(
  token: string,
  id: string,
  placeId: string,
  vote: 'like' | 'dislike',
): Promise<GroupSession> {
  return request<GroupSession>(`/groups/${id}/vote`, {
    method: 'POST',
    body: { placeId, vote },
    token,
  });
}

export function decideGroupPlace(token: string, id: string, placeId: string): Promise<GroupSession> {
  return request<GroupSession>(`/groups/${id}/decide`, {
    method: 'POST',
    body: { placeId },
    token,
  });
}
