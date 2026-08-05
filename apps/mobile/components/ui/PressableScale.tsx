import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle, useReducedMotion, useSharedValue, withSpring,
} from 'react-native-reanimated';
import type { ReactNode } from 'react';
import * as Haptics from 'expo-haptics';
import { motion } from '../../theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Bouton qui « s'enfonce » à la pression, avec ressort physique et retour
 * haptique optionnel. C'est la micro-interaction de base : tout élément
 * tappable de Yumia devrait l'utiliser plutôt qu'un Pressable nu.
 *
 * Respecte automatiquement « Réduire les animations » du système.
 */
export function PressableScale({
  children,
  onPress,
  onLongPress,
  style,
  /** Échelle atteinte pendant l'appui. Plus la cible est grande, plus on monte. */
  scaleTo = 0.96,
  /** Retour haptique au toucher — à réserver aux actions signifiantes. */
  haptic = false,
  disabled,
  hitSlop,
}: {
  children?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptic?: boolean;
  disabled?: boolean;
  hitSlop?: number;
}) {
  const pressed = useSharedValue(0);
  const reduced = useReducedMotion();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{
      scale: reduced ? 1 : withSpring(1 - pressed.value * (1 - scaleTo), motion.spring.snappy),
    }],
    opacity: withSpring(1 - pressed.value * 0.12, motion.spring.snappy),
  }));

  return (
    <AnimatedPressable
      onPressIn={() => {
        pressed.value = 1;
        if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onPressOut={() => { pressed.value = 0; }}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
