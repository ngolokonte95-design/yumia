/**
 * Client API du feed social : posts globaux (« Pour vous »), actions
 * (like / save / repost / commentaire), et stories (feed global + à la une).
 */
import { API_BASE_URL } from './config';

const API = API_BASE_URL;

export interface FeedPost {
  id: string;
  userId: string;
  caption?: string | null;
  mediaUrls: string[];
  videoUrl?: string | null;
  musicTrack?: string | null;
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
  repostedByMe: boolean;
  isReel?: boolean;
  pinned?: boolean;
  archived?: boolean;
  editedAt?: string | null;
  commentsDisabled?: boolean;
  hideLikeCount?: boolean;
  coverUrl?: string | null;
  viewsCount?: number;
  hashtags?: string[];
  createdAt: string;
  user: { id: string; displayName: string; photoUrl?: string } | null;
  place?: { id?: string; name: string; city?: string; universe?: string } | null;
}

/** Sticker posé sur une story (position x/y en % du cadre). */
export interface StorySticker {
  kind: 'poll' | 'question' | 'mention' | 'location' | 'hashtag' | 'text' | 'emoji_slider' | 'countdown' | 'link';
  x: number;
  y: number;
  question?: string;
  options?: string[];
  userId?: string;
  label?: string;
  placeId?: string;
  url?: string;
  text?: string;
  emoji?: string;
  endsAt?: string;
  color?: string;
}

export interface StoryItem {
  id: string;
  mediaUrl: string;
  type: 'photo' | 'video';
  caption?: string | null;
  seen: boolean;
  closeFriendsOnly?: boolean;
  stickers?: StorySticker[] | null;
  viewCount?: number;
  userId?: string;
  createdAt: string;
}

export interface StoryGroup {
  user: { id: string; displayName: string; photoUrl?: string };
  stories: StoryItem[];
  hasUnseen: boolean;
}

export interface HighlightItem {
  id: string;
  mediaUrl: string;
  type: 'photo' | 'video';
  caption?: string | null;
}

export interface StoryHighlight {
  id: string;
  title: string;
  coverUrl?: string | null;
  items: HighlightItem[];
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}
function json(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
async function safe<T>(r: Response, fallback: T): Promise<T> {
  if (!r.ok) return fallback;
  try { return (await r.json()) as T; } catch { return fallback; }
}

export const feedApi = {
  // ── Posts ──────────────────────────────────────────────────────────────
  globalFeed: (token: string, limit = 30) =>
    fetch(`${API}/posts/global?limit=${limit}`, { headers: auth(token) }).then((r) => safe<FeedPost[]>(r, [])),

  followingFeed: (token: string, limit = 30) =>
    fetch(`${API}/posts/feed?limit=${limit}`, { headers: auth(token) }).then((r) => safe<FeedPost[]>(r, [])),

  savedPosts: (token: string, limit = 30) =>
    fetch(`${API}/posts/saved?limit=${limit}`, { headers: auth(token) }).then((r) => safe<FeedPost[]>(r, [])),

  toggleLike: (token: string, postId: string) =>
    fetch(`${API}/posts/${postId}/like`, { method: 'POST', headers: auth(token) })
      .then((r) => safe<{ liked: boolean; likesCount: number }>(r, { liked: false, likesCount: 0 })),

  toggleSave: (token: string, postId: string) =>
    fetch(`${API}/posts/${postId}/save`, { method: 'POST', headers: auth(token) })
      .then((r) => safe<{ saved: boolean }>(r, { saved: false })),

  toggleRepost: (token: string, postId: string, caption?: string) =>
    fetch(`${API}/posts/${postId}/repost`, { method: 'POST', headers: json(token), body: JSON.stringify({ caption }) })
      .then((r) => safe<{ reposted: boolean; repostsCount: number }>(r, { reposted: false, repostsCount: 0 })),

  // ── Stories ────────────────────────────────────────────────────────────
  globalStories: (token: string) =>
    fetch(`${API}/stories/global`, { headers: auth(token) }).then((r) => safe<StoryGroup[]>(r, [])),

  createStory: (token: string, dto: {
    mediaUrl: string; type?: 'photo' | 'video'; caption?: string; placeId?: string;
    closeFriendsOnly?: boolean; stickers?: StorySticker[];
  }) =>
    fetch(`${API}/stories`, { method: 'POST', headers: json(token), body: JSON.stringify(dto) })
      .then((r) => safe<{ id: string } | null>(r, null)),

  markStoryViewed: (token: string, storyId: string) =>
    fetch(`${API}/stories/${storyId}/view`, { method: 'POST', headers: auth(token) }),

  /** Qui a vu ma story (auteur uniquement). */
  storyViewers: (token: string, storyId: string) =>
    fetch(`${API}/stories/${storyId}/viewers`, { headers: auth(token) })
      .then((r) => safe<Array<{ viewedAt: string; user: { id: string; displayName: string; photoUrl?: string } }>>(r, [])),

  /** Vote sur le sondage d'une story. */
  votePoll: (token: string, storyId: string, optionIndex: number) =>
    fetch(`${API}/stories/${storyId}/poll-vote`, { method: 'POST', headers: json(token), body: JSON.stringify({ optionIndex }) })
      .then((r) => safe<{ results: number[]; myVote: number } | null>(r, null)),

  /** Résultats du sondage d'une story. */
  pollResults: (token: string, storyId: string) =>
    fetch(`${API}/stories/${storyId}/poll-results`, { headers: auth(token) })
      .then((r) => safe<{ results: number[]; myVote: number | null }>(r, { results: [], myVote: null })),

  /** Répondre à une story (part en DM chez l'auteur). */
  replyToStory: (token: string, storyId: string, text: string) =>
    fetch(`${API}/stories/${storyId}/reply`, { method: 'POST', headers: json(token), body: JSON.stringify({ text }) })
      .then((r) => r.ok),

  // ── Highlights (à la une) ────────────────────────────────────────────────
  getHighlights: (token: string, userId: string) =>
    fetch(`${API}/stories/highlights/${userId}`, { headers: auth(token) }).then((r) => safe<StoryHighlight[]>(r, [])),

  createHighlight: (token: string, title: string, items: Array<{ mediaUrl: string; type?: 'photo' | 'video'; caption?: string }>) =>
    fetch(`${API}/stories/highlights`, { method: 'POST', headers: json(token), body: JSON.stringify({ title, items }) })
      .then((r) => safe<StoryHighlight | null>(r, null)),

  deleteHighlight: (token: string, id: string) =>
    fetch(`${API}/stories/highlights/${id}`, { method: 'DELETE', headers: auth(token) }),

  // ── Upload média (réutilise l'endpoint posts/upload) ──────────────────────
  uploadMedia: async (token: string, uri: string): Promise<string | null> => {
    const form = new FormData();
    const name = uri.split('/').pop() ?? 'photo.jpg';
    const ext = name.split('.').pop()?.toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    // @ts-expect-error React Native FormData file shape
    form.append('file', { uri, name, type: mime });
    const r = await fetch(`${API}/posts/upload`, { method: 'POST', headers: auth(token), body: form });
    const d = await safe<{ url: string } | null>(r, null);
    return d?.url ?? null;
  },
};
