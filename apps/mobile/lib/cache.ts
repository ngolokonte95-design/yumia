/**
 * Persistent JSON cache backed by AsyncStorage.
 *
 * Provides stale-while-revalidate helpers used by the data-fetching hooks
 * (useFeed, useTop3, usePassport…) to serve cached content while offline or
 * while a fresh request is in-flight.
 *
 * Cache entries are JSON-serialised and stored under namespaced keys.
 * Each entry carries an expiry timestamp; stale entries are returned but
 * flagged as stale so callers can decide whether to re-fetch.
 */

let AsyncStorage: { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void>; removeItem(k: string): Promise<void> } | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  AsyncStorage = null;
}

interface CacheEntry<T> {
  data: T;
  /** Unix ms — when the entry expires. */
  expiresAt: number;
  /** Unix ms — when the entry was stored. */
  cachedAt: number;
}

const PREFIX = '@yumia/cache/';

function key(ns: string): string {
  return PREFIX + ns;
}

/**
 * Write a value to the cache.
 * @param ns      Unique namespace / key (e.g. "feed:48.856,2.352")
 * @param data    Value to cache
 * @param ttlMs   Time-to-live in milliseconds (default: 5 minutes)
 */
export async function cacheSet<T>(ns: string, data: T, ttlMs = 5 * 60_000): Promise<void> {
  if (!AsyncStorage) return;
  const entry: CacheEntry<T> = { data, expiresAt: Date.now() + ttlMs, cachedAt: Date.now() };
  try {
    await AsyncStorage.setItem(key(ns), JSON.stringify(entry));
  } catch {
    // Storage quota or serialisation error — ignore, app still works online.
  }
}

/**
 * Read a value from the cache.
 * Returns `{ data, stale }` where `stale` is true when the TTL has expired.
 * Returns `null` when no entry exists.
 */
export async function cacheGet<T>(ns: string): Promise<{ data: T; stale: boolean } | null> {
  if (!AsyncStorage) return null;
  try {
    const raw = await AsyncStorage.getItem(key(ns));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    return { data: entry.data, stale: Date.now() > entry.expiresAt };
  } catch {
    return null;
  }
}

/**
 * Delete a cache entry.
 */
export async function cacheDel(ns: string): Promise<void> {
  if (!AsyncStorage) return;
  try {
    await AsyncStorage.removeItem(key(ns));
  } catch {
    // ignore
  }
}

/**
 * Build a stable cache key from a params object.
 * Sorts keys so that `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` produce the
 * same key.
 */
export function cacheKey(prefix: string, params: Record<string, unknown>): string {
  const sorted = Object.keys(params)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      if (params[k] !== undefined && params[k] !== null) acc[k] = params[k];
      return acc;
    }, {});
  return `${prefix}:${JSON.stringify(sorted)}`;
}
