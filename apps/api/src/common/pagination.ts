/** Plafond par défaut d'une page de liste. */
export const MAX_PAGE_LIMIT = 100;

/**
 * Lit un `limit` de query string et le borne à [1, max].
 * Absent, invalide (NaN) ou ≤ 0 : `fallback`. Sans ce garde-fou, `?limit=1000000`
 * chargeait toute la table, et `?limit=abc` faisait planter Prisma (take: NaN).
 */
export function clampLimit(raw: string | number | undefined, fallback: number, max = MAX_PAGE_LIMIT): number {
  const n = typeof raw === 'number' ? raw : raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return Math.min(fallback, max);
  return Math.min(Math.floor(n), max);
}
