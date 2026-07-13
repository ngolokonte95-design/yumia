/**
 * Client API typé. Une seule porte d'entrée HTTP côté mobile ; les écrans ne
 * connaissent jamais les URLs ni le format de transport.
 */
import type { Mode, Mood, Suggestion } from '@yumia/shared';
import { API_BASE_URL } from './config';
import type { Universe } from './auth-api';

/**
 * Registered by AuthProvider so that api.ts can silently refresh an expired
 * access token on 401, without a direct React context dependency.
 */
let _tokenRefresher: (() => Promise<string | null>) | null = null;

export function registerTokenRefresher(fn: () => Promise<string | null>): void {
  _tokenRefresher = fn;
}

export function unregisterTokenRefresher(): void {
  _tokenRefresher = null;
}

/** Réponse de `POST /recommendations/top3` (miroir de `Top3Result` de l'API). */
export interface Top3Response {
  generatedAtIso: string;
  context: { mode?: Mode; mood?: Mood; city?: string };
  reason: string;
  suggestions: Suggestion[];
}

export interface Top3Params {
  lat: number;
  lng: number;
  radius?: number;
  city?: string;
  mode?: Mode;
  mood?: Mood;
  query?: string;
  locale?: string;
  localTimeIso?: string;
  favoriteUniverses?: Universe[];
  restrictions?: string[];
  weather?: { tempC: number; condition: string };
}

/** Erreur HTTP enrichie du code de statut. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Jeton d'accès Bearer pour les routes protégées. */
  token?: string;
}

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 800;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function doFetch(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError('La requête a expiré. Vérifie ta connexion.', 0);
    }
    throw new ApiError('Impossible de joindre le serveur YUMIA.', 0);
  } finally {
    clearTimeout(timer);
  }
}

/** Requête HTTP typée vers l'API avec retry exponentiel.
 *
 *  Retry automatique sur :
 *   - status 0  → timeout / pas de réseau
 *   - status ≥ 500 → erreur serveur transitoire
 *
 *  Pas de retry sur 4xx (erreurs client déterministes).
 *  Délais : 800 ms, 1 600 ms (+ jitter ≤ 200 ms).
 */
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await _request<T>(path, opts);
    } catch (err) {
      const retryable =
        err instanceof ApiError && (err.status === 0 || err.status >= 500);
      if (!retryable || attempt >= MAX_RETRIES) throw err;
      await sleep(BASE_BACKOFF_MS * 2 ** attempt + Math.random() * 200);
    }
  }
}

async function _request<T>(path: string, opts: RequestOptions): Promise<T> {
  let res = await doFetch(path, opts);

  // On 401, attempt a silent token refresh once then retry.
  if (res.status === 401 && _tokenRefresher) {
    const freshToken = await _tokenRefresher().catch(() => null);
    if (freshToken) {
      res = await doFetch(path, { ...opts, token: freshToken });
    }
  }

  if (!res.ok) {
    const message = await extractError(res);
    throw new ApiError(message, res.status);
  }
  // 204 No Content (ex. logout) → pas de corps à parser.
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Tente d'extraire un message lisible du corps d'erreur de l'API. */
async function extractError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } | string };
    const err = body?.error;
    if (typeof err === 'string') return err;
    if (err?.message) return err.message;
  } catch {
    // corps non-JSON
  }
  return `Requête échouée (${res.status}).`;
}

/** Récupère le Top 3 contextuel pour une position et des signaux donnés. */
export function fetchTop3(params: Top3Params, token?: string): Promise<Top3Response> {
  return request<Top3Response>('/recommendations/top3', { method: 'POST', body: params, token });
}

export interface FeedParams {
  lat: number;
  lng: number;
  radius?: number;
  mood?: Mood;
  limit?: number;
  locale?: string;
  favoriteUniverses?: Universe[];
  restrictions?: string[];
  weather?: { tempC: number; condition: string };
}

/** Récupère le flux For You (mood-aware). Même forme que le Top 3. */
export function fetchFeed(params: FeedParams, token?: string): Promise<Top3Response> {
  return request<Top3Response>('/recommendations/feed', { method: 'POST', body: params, token });
}

export interface ExperienceStep {
  order: number;
  labelFr: string;
  place: import('@yumia/shared').Place;
  reason: string;
}

export interface ExperienceResult {
  titleFr: string;
  mode: string;
  generatedAtIso: string;
  steps: ExperienceStep[];
}

export interface ExperienceParams {
  lat: number;
  lng: number;
  radius?: number;
  mode: Mode;
  locale?: string;
  favoriteUniverses?: Universe[];
  restrictions?: string[];
}

/** Construit un itinéraire 3 étapes (Date / Travel). */
export function fetchExperience(params: ExperienceParams, token?: string): Promise<ExperienceResult> {
  return request<ExperienceResult>('/recommendations/experience', { method: 'POST', body: params, token });
}
