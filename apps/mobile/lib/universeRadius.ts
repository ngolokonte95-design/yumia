import type { Universe } from '@yumia/shared';

/**
 * Univers à couverture Google éparse (recherche textuelle dédiée côté API —
 * voir TEXT_FIRST_UNIVERSES dans place-types.ts). Miroir manuel : le mobile
 * n'importe pas de code backend.
 */
const NICHE_UNIVERSES = new Set<string>([
  'waterspot', 'hookah', 'currency_exchange', 'money_transfer', 'car_inspection',
]);

const BASE_RADIUS_M = 20_000;
const NICHE_RADIUS_M = 40_000;

/** Rayon de recherche pour un écran qui liste les lieux d'un univers donné. */
export function universeSearchRadius(universe: Universe | string | null): number {
  if (universe && NICHE_UNIVERSES.has(universe)) return NICHE_RADIUS_M;
  return BASE_RADIUS_M;
}
