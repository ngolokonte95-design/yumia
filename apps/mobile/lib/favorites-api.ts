/**
 * Client de l'espace Favoris unifié.
 *
 * Les lieux et les publications enregistrées vivaient dans deux systèmes
 * séparés ; le backend les réunit derrière `/favorites`, et une même collection
 * peut désormais contenir les deux.
 */
import { API_BASE_URL } from './config';

const API = API_BASE_URL;

export type FavoriteKind = 'place' | 'post';
export type FavoriteSort = 'recent' | 'oldest' | 'name';

export interface FavoriteItem {
  /** Discriminant : décide du rendu et de la destination au tap. */
  kind: FavoriteKind;
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  /** Univers Yumia pour un lieu ; `null` pour une publication. */
  universe: string | null;
  collectionId: string | null;
  savedAt: string;
}

export interface FavoriteCollection {
  id: string;
  name: string;
  coverUrl: string | null;
  placesCount: number;
  postsCount: number;
  itemsCount: number;
  createdAt: string;
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

export const favoritesApi = {
  list: (
    token: string,
    opts: { collectionId?: string; q?: string; kind?: FavoriteKind; sort?: FavoriteSort } = {},
  ) => {
    const params = new URLSearchParams();
    if (opts.collectionId) params.set('collectionId', opts.collectionId);
    if (opts.q) params.set('q', opts.q);
    if (opts.kind) params.set('kind', opts.kind);
    if (opts.sort) params.set('sort', opts.sort);
    const qs = params.toString();
    return fetch(`${API}/favorites${qs ? `?${qs}` : ''}`, { headers: auth(token) })
      .then((r) => safe<FavoriteItem[]>(r, []));
  },

  collections: (token: string) =>
    fetch(`${API}/favorites/collections`, { headers: auth(token) })
      .then((r) => safe<FavoriteCollection[]>(r, [])),

  createCollection: (token: string, name: string) =>
    fetch(`${API}/favorites/collections`, {
      method: 'POST', headers: json(token), body: JSON.stringify({ name }),
    }).then((r) => safe<FavoriteCollection | null>(r, null)),

  renameCollection: (token: string, id: string, name: string) =>
    fetch(`${API}/favorites/collections/${id}`, {
      method: 'PATCH', headers: json(token), body: JSON.stringify({ name }),
    }).then((r) => r.ok),

  deleteCollection: (token: string, id: string) =>
    fetch(`${API}/favorites/collections/${id}`, { method: 'DELETE', headers: auth(token) })
      .then((r) => r.ok),

  /** Range un favori dans une collection — `null` l'en retire. */
  setCollection: (
    token: string, kind: FavoriteKind, id: string, collectionId: string | null,
  ) => {
    const path = kind === 'place' ? 'places' : 'posts';
    return fetch(`${API}/favorites/${path}/${id}/collection`, {
      method: 'PATCH', headers: json(token), body: JSON.stringify({ collectionId }),
    }).then((r) => r.ok);
  },
};
