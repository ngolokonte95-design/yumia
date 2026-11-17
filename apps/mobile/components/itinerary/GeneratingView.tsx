/**
 * Attente pendant que l'IA compose l'itinéraire : un orbe au dégradé de
 * marque qui respire, entouré d'un anneau qui tourne, puis une frise
 * « fantôme » dont les étapes apparaissent en cascade et pulsent doucement.
 *
 * Les boucles s'arrêtent dès que l'écran n'est plus affiché ou que la vue
 * disparaît (fin de génération).
 */
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat,
  withSequence, withTiming,
} from 'react-native-reanimated';
import { colors, gradients, radius, spacing } from '../../theme/tokens';
import { GradientText, Reveal } from '../ui';

export function GeneratingView({ label }: { label: string }) {
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  const reduced = useReducedMotion();
  const running = focused && !reduced;

  const spin = useSharedValue(0);
  const breathe = useSharedValue(0);
  const shimmer = useSharedValue(0);

  useEffect(() => {
    if (!running) {
      cancelAnimation(spin);
      cancelAnimation(breathe);
      cancelAnimation(shimmer);
      return;
    }
    spin.value = 0;
    spin.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.linear }), -1);
    const ease = Easing.inOut(Easing.sin);
    breathe.value = withRepeat(withSequence(withTiming(1, { duration: 1100, easing: ease }), withTiming(0, { duration: 1100, easing: ease })), -1);
    shimmer.value = withRepeat(withSequence(withTiming(1, { duration: 900, easing: ease }), withTiming(0, { duration: 900, easing: ease })), -1);
    return () => {
      cancelAnimation(spin);
      cancelAnimation(breathe);
      cancelAnimation(shimmer);
    };
  }, [running, spin, breathe, shimmer]);

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const orbStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.92 + breathe.value * 0.1 }] }));
  const ghostStyle = useAnimatedStyle(() => ({ opacity: 0.35 + shimmer.value * 0.35 }));

  return (
    <View style={styles.wrap}>
      <View style={styles.orbBox}>
        <Animated.View style={[styles.ring, ringStyle]}>
          <LinearGradient
            colors={[colors.brand, 'transparent', colors.accent, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <View style={styles.ringHole} />
        <Animated.View style={orbStyle}>
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.orb}>
            <Text style={styles.orbEmoji}>✨</Text>
          </LinearGradient>
        </Animated.View>
      </View>

      <GradientText style={styles.label}>{label}</GradientText>

      {/* Frise fantôme : la forme de ce qui arrive. */}
      <View style={styles.ghostList}>
        {[0, 1, 2].map((i) => (
          <Reveal key={i} index={i + 1}>
            <Animated.View style={[styles.ghostRow, ghostStyle]}>
              <View style={styles.ghostNode} />
              <View style={styles.ghostCard}>
                <View style={[styles.ghostLine, { width: '35%' }]} />
                <View style={[styles.ghostLine, { width: '80%', height: 14 }]} />
                <View style={[styles.ghostLine, { width: '60%' }]} />
              </View>
            </Animated.View>
          </Reveal>
        ))}
      </View>
    </View>
  );
}

const ORB = 76;
const RING = 112;

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.xl, alignItems: 'center', gap: spacing.md },
  orbBox: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: RING, height: RING, borderRadius: RING / 2, overflow: 'hidden' },
  ringHole: {
    position: 'absolute', width: RING - 6, height: RING - 6, borderRadius: (RING - 6) / 2,
    backgroundColor: colors.bg,
  },
  orb: { width: ORB, height: ORB, borderRadius: ORB / 2, alignItems: 'center', justifyContent: 'center' },
  orbEmoji: { fontSize: 30 },
  label: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  ghostList: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.sm },
  ghostRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  ghostNode: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surfaceElevated },
  ghostCard: {
    flex: 1, padding: spacing.md, gap: 8, borderRadius: radius.lg,
    backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)',
  },
  ghostLine: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceElevated },
});
