import { useEffect } from 'react';
import { StyleSheet, TextInput, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  useAnimatedProps, useReducedMotion, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { motion } from '../../theme/tokens';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/**
 * Nombre qui défile jusqu'à sa valeur (température, compteur de favoris…).
 *
 * Astuce standard Reanimated : on anime la prop `text` d'un TextInput en
 * lecture seule plutôt qu'un <Text>, car c'est la seule façon de mettre à jour
 * le rendu depuis le thread UI sans repasser par un re-render React à chaque
 * frame — indispensable pour rester fluide.
 */
export function AnimatedNumber({
  value,
  style,
  decimals = 0,
  suffix = '',
  duration = motion.duration.slow,
}: {
  value: number;
  style?: StyleProp<TextStyle>;
  /** Décimales affichées (0 pour une température ronde). */
  decimals?: number;
  /** Texte collé après le nombre, ex. « ° ». */
  suffix?: string;
  duration?: number;
}) {
  const progress = useSharedValue(value);
  const reduced = useReducedMotion();

  useEffect(() => {
    progress.value = reduced ? value : withTiming(value, { duration });
  }, [value, duration, reduced, progress]);

  const animatedProps = useAnimatedProps(() => ({
    text: `${progress.value.toFixed(decimals)}${suffix}`,
    // `defaultValue` garde le premier rendu correct avant la 1re frame animée.
    defaultValue: `${progress.value.toFixed(decimals)}${suffix}`,
  })) as never;

  return (
    <AnimatedTextInput
      editable={false}
      // Non focusable : c'est un affichage, pas un champ de saisie.
      pointerEvents="none"
      underlineColorAndroid="transparent"
      style={[styles.reset, style]}
      animatedProps={animatedProps}
    />
  );
}

const styles = StyleSheet.create({
  // Neutralise le style natif d'un TextInput pour qu'il se comporte en Text.
  reset: { padding: 0, margin: 0, borderWidth: 0, includeFontPadding: false },
});
