/**
 * Couleurs des univers : chaque univers prend le dégradé de sa catégorie
 * (UNIVERSE_CATEGORIES → tokens.categoryGradients). Partagé par l'Accueil, la
 * page d'univers, la fiche lieu, la carte et le Passeport, pour qu'un même
 * univers ait la même couleur partout.
 */
import { UNIVERSE_CATEGORIES } from '@yumia/shared';
import { categoryGradients } from '../theme/tokens';

/** Catégorie de chaque univers (`restaurant` → `food`). */
export const CATEGORY_OF: Record<string, string> = Object.fromEntries(
  UNIVERSE_CATEGORIES.flatMap((c) => c.universes.map((u) => [u, c.key] as const)),
);

/** Dégradé d'une catégorie (repli : `other`). */
export function categoryGradient(categoryKey: string | undefined | null): readonly [string, string] {
  return categoryGradients[categoryKey ?? 'other'] ?? categoryGradients.other;
}

/** Dégradé d'un univers, d'après sa catégorie. */
export function universeGradient(universe: string | undefined | null): readonly [string, string] {
  return categoryGradient(universe ? CATEGORY_OF[universe] : undefined);
}

/** Couleur pleine d'un univers (teinte claire de son dégradé) — repères, liserés. */
export function universeColor(universe: string | undefined | null): string {
  return universeGradient(universe)[1];
}
