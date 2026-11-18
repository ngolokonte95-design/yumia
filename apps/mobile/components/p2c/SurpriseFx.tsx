/**
 * Effets de l'écran Surprise : fond spatial, dé lumineux, révélation du lieu
 * (carte qui se retourne + gerbe de particules au dégradé de marque +
 * vibration de succès). Purement visuels : ils ne déclenchent aucun tirage et
 * ne lisent aucune donnée. Les boucles s'arrêtent hors de l'écran.
 */
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat,
  withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { elevation, gradients, motion } from '../../theme/tokens';
import { PressableScale } from '../ui';
import { SpaceBackground } from '../space/SpaceBackground';
import { haptics } from '../../lib/useHaptics';

/** Fond « espace profond » de l'Accueil, animé tant que l'écran est affiché. */
export function SurpriseBackdrop() {
  const focused = useIsFocused();
  return <SpaceBackground active={focused} />;
}

// ── Le dé ────────────────────────────────────────────────────────────────────

const DICE = 132;

/**
 * Dé au dégradé de marque. Au repos, un halo s'en échappe en boucle (il
 * appelle le toucher) ; pendant le tirage, le dé tourne sur lui-même.
 */
export function DiceButton({ loading, onPress }: { loading: boolean; onPress: () => void }) {
  const focused = useIsFocused();
  const halo = useSharedValue(0);
  const spin = useSharedValue(0);

  useEffect(() => {
    if (!focused || loading) {
      cancelAnimation(halo);
      halo.value = 0;
      return;
    }
    halo.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1);
    return () => cancelAnimation(halo);
  }, [focused, loading, halo]);

  useEffect(() => {
    if (!loading) {
      cancelAnimation(spin);
      spin.value = withTiming(0, { duration: 200 });
      return;
    }
    spin.value = 0;
    spin.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.linear }), -1);
    return () => cancelAnimation(spin);
  }, [loading, spin]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - halo.value),
    transform: [{ scale: 1 + halo.value * 0.45 }],
  }));
  const diceStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  return (
    <View style={styles.diceBox}>
      <Animated.View style={[styles.halo, haloStyle]} pointerEvents="none">
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <PressableScale onPress={onPress} disabled={loading} haptic scaleTo={0.92} style={styles.dice}>
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={gradients.glassSheen} style={StyleSheet.absoluteFill} />
        <Animated.Text style={[styles.diceEmoji, diceStyle]}>🎲</Animated.Text>
      </PressableScale>
    </View>
  );
}

// ── Gerbe de particules ──────────────────────────────────────────────────────

const PARTICLE_COLORS = ['#E8621A', '#F08A4B', '#8B4FD6', '#5C4ECC', '#FFFFFF'];
const PARTICLES = 18;

function Particle({ i }: { i: number }) {
  const t = useSharedValue(0);
  // Répartition régulière + petit décalage fixe : pas de hasard au rendu.
  const angle = (i / PARTICLES) * Math.PI * 2 + ((i * 37) % 10) / 20;
  const dist = 90 + ((i * 53) % 60);
  const size = 6 + ((i * 29) % 6);

  useEffect(() => {
    t.value = withDelay(80, withTiming(1, { duration: 950, easing: Easing.out(Easing.cubic) }));
    return () => cancelAnimation(t);
  }, [t]);

  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.1 ? t.value * 10 : 1 - (t.value - 0.1) / 0.9,
    transform: [
      { translateX: Math.cos(angle) * dist * t.value },
      // Légère retombée en fin de course.
      { translateY: Math.sin(angle) * dist * t.value + 40 * t.value * t.value },
      { scale: 1 - t.value * 0.5 },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.particle, { width: size, height: size, borderRadius: size, backgroundColor: PARTICLE_COLORS[i % PARTICLE_COLORS.length] }, style]}
    />
  );
}

/** Gerbe ponctuelle au centre de son parent (remontée à chaque tirage par `key`). */
export function ParticleBurst() {
  return (
    <View style={styles.burst} pointerEvents="none">
      {Array.from({ length: PARTICLES }, (_, i) => <Particle key={i} i={i} />)}
    </View>
  );
}

// ── Révélation ───────────────────────────────────────────────────────────────

/**
 * La carte du lieu se retourne (rotation 3D) et grandit d'un ressort, avec
 * une vibration de succès. À remonter (`key`) à chaque nouveau tirage.
 */
export function FlipReveal({ children }: { children: ReactNode }) {
  const r = useSharedValue(90);
  const s = useSharedValue(0.86);

  useEffect(() => {
    r.value = withSpring(0, motion.spring.gentle);
    s.value = withSequence(withSpring(1.03, motion.spring.bouncy), withSpring(1, motion.spring.gentle));
    haptics.success();
  }, [r, s]);

  const style = useAnimatedStyle(() => ({
    transform: [{ perspective: 900 }, { rotateY: `${r.value}deg` }, { scale: s.value }],
  }));

  return <Animated.View style={[styles.flip, style]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  diceBox: { width: DICE + 60, height: DICE + 60, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: DICE, height: DICE, borderRadius: 40, overflow: 'hidden' },
  dice: {
    width: DICE, height: DICE, borderRadius: 40, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.4)',
    ...elevation.glowBrand,
  },
  diceEmoji: { fontSize: 62 },
  burst: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  particle: { position: 'absolute' },
  flip: { width: '100%' },
});
