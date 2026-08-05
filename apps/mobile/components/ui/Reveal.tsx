import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import type { StyleProp, ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { motion } from '../../theme/tokens';

/** D'où l'élément arrive. `below` = il monte en place (le plus naturel). */
type From = 'below' | 'above' | 'fade';

// Attention au nommage Reanimated, contre-intuitif : `FadeInUp` démarre 25px
// AU-DESSUS et descend ; `FadeInDown` démarre 25px EN DESSOUS et monte.
const ENTERING = {
  below: FadeInDown,
  above: FadeInUp,
  fade: FadeIn,
} as const;

/**
 * Apparition en cascade d'un élément. `index` décale automatiquement le départ
 * pour qu'une liste se révèle en vague plutôt que d'un bloc — c'est ce décalage
 * qui donne l'impression « vivante » plutôt que statique.
 *
 * Les entrées Reanimated respectent nativement « Réduire les animations ».
 */
export function Reveal({
  children,
  index = 0,
  from = 'below',
  duration = motion.duration.normal,
  style,
}: {
  children?: ReactNode;
  /** Position dans la liste — pilote le délai (index × motion.stagger). */
  index?: number;
  from?: From;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const animation = ENTERING[from].duration(duration).delay(index * motion.stagger);

  return (
    <Animated.View entering={animation} style={style}>
      {children}
    </Animated.View>
  );
}
