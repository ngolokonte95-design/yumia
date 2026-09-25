/**
 * Retire la query string d'une URL de requête (`/api/places/nearby?lat=..&lng=..`
 * → `/api/places/nearby`). Les query strings portent des positions exactes
 * (lat/lng), des recherches et parfois des jetons : elles n'ont rien à faire
 * dans les logs ni dans Sentry.
 */
export function stripQuery(url: string | undefined | null): string {
  if (!url) return '';
  const i = url.search(/[?#]/);
  return i === -1 ? url : url.slice(0, i);
}

/**
 * Sérialiseur `req` de pino-http : garde méthode, chemin, identifiants, mais
 * jamais la query (`url` tronquée, `query` retirée). Les en-têtes sensibles
 * restent masqués par `redact`.
 */
export function serializeReqWithoutQuery<T extends { url?: string; query?: unknown }>(req: T): T {
  if (!req || typeof req !== 'object') return req;
  const { query: _query, ...rest } = req;
  void _query;
  return { ...rest, url: stripQuery(req.url) } as T;
}
