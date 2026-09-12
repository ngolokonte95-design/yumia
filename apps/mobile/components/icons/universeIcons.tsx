import type { ReactElement } from 'react';
import { CoffeeShopIcon } from './CoffeeShopIcon';
import { TobaccoIcon } from './TobaccoIcon';

/**
 * Univers dessinés à la main plutôt que représentés par un emoji.
 *
 * Deux rayons ne peuvent pas s'en remettre à un emoji : celui qui les
 * représenterait le mieux montre un produit consommé (joint, cigarette), ce
 * que les boutiques d'applications refusent. On dessine donc le LIEU.
 *
 * Ce registre existe parce que le premier cas était codé en dur dans quatre
 * endroits de la carte (`universe === 'cannabis' ? … : …`). Un deuxième aurait
 * doublé ces conditions ; un troisième les aurait rendues illisibles.
 */
const CUSTOM_ICONS: Record<string, (props: { size?: number }) => ReactElement> = {
  cannabis: CoffeeShopIcon,
  tobacco: TobaccoIcon,
};

/** `true` si cet univers a un dessin propre — donc pas d'emoji à afficher. */
export function hasCustomIcon(universe: string | null | undefined): boolean {
  return !!universe && universe in CUSTOM_ICONS;
}

/**
 * Le dessin d'un univers, ou `null` s'il s'en remet à son emoji.
 *
 * Rendre `null` plutôt que lever laisse l'appelant écrire un simple
 * `{universeIcon(u, 22) ?? <Text>{emoji}</Text>}`.
 */
export function universeIcon(universe: string | null | undefined, size: number): ReactElement | null {
  if (!universe) return null;
  const Icon = CUSTOM_ICONS[universe];
  return Icon ? <Icon size={size} /> : null;
}
