import { useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue,
  withDelay, withRepeat, withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { gradients } from '../../theme/tokens';
import type { DayMoment, WeatherKind } from '../../lib/services/weather';

const { width: W, height: H } = Dimensions.get('window');

/**
 * Fond de ciel vivant : dégradé d'ambiance + particules animées propres à la
 * condition météo.
 *
 * Le rendu est volontairement 100 % Reanimated / gradients — aucune image, donc
 * aucun téléchargement et un coût mémoire quasi nul, ce qui compte quand
 * l'écran doit rester fluide sur des millions d'appareils.
 *
 * Si « Réduire les animations » est actif, le dégradé reste mais rien ne bouge.
 */

/** Choisit le dégradé de fond selon la condition et le moment de la journée. */
function skyColors(kind: WeatherKind, moment: DayMoment): readonly string[] {
  if (moment === 'night') return gradients.weatherNight;
  if (moment === 'sunrise') return gradients.weatherSunrise;
  if (moment === 'sunset') return gradients.weatherSunset;

  switch (kind) {
    case 'clear':
    case 'partly_cloudy': return gradients.weatherClear;
    case 'thunderstorm': return gradients.weatherStorm;
    case 'snow': return gradients.weatherSnow;
    case 'fog':
    case 'cloudy': return gradients.weatherFog;
    case 'rain':
    case 'heavy_rain':
    case 'drizzle': return gradients.weatherRain;
  }
}

/**
 * Démarre une boucle d'animation au montage.
 *
 * Passe impérativement par un effet : écrire dans un `SharedValue` pendant le
 * rendu est interdit par Reanimated (le rendu doit rester pur, et une écriture
 * à ce moment déclenche un avertissement puis un comportement instable).
 */
function useLoop(
  value: SharedValue<number>,
  build: () => number,
  deps: unknown[] = [],
) {
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    value.value = build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, ...deps]);
}

/** Positions pseudo-aléatoires mais stables entre deux rendus. */
function seededParticles(count: number, seed: number) {
  return Array.from({ length: count }, (_, i) => {
    const r = Math.sin(seed + i * 12.9898) * 43758.5453;
    const rx = r - Math.floor(r);
    const r2 = Math.sin(seed + i * 78.233) * 43758.5453;
    const ry = r2 - Math.floor(r2);
    return { x: rx * W, y: ry * H, delay: Math.floor(ry * 2600), scale: 0.5 + rx * 0.9 };
  });
}

// ── Particules ───────────────────────────────────────────────────────────────

function Drop({ x, delay, heavy }: { x: number; delay: number; heavy: boolean }) {
  const progress = useSharedValue(0);

  useLoop(progress, () => withDelay(
    delay,
    withRepeat(withTiming(1, { duration: heavy ? 700 : 1150, easing: Easing.linear }), -1),
  ), [heavy]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -40 + progress.value * (H + 60) }],
    opacity: progress.value < 0.1 ? progress.value * 10 : 1 - progress.value * 0.5,
  }));

  return <Animated.View style={[styles.drop, { left: x, height: heavy ? 26 : 18 }, style]} />;
}

function Flake({ x, delay, scale }: { x: number; delay: number; scale: number }) {
  const progress = useSharedValue(0);

  useLoop(progress, () => withDelay(
    delay,
    withRepeat(withTiming(1, { duration: 9000, easing: Easing.linear }), -1),
  ));

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -20 + progress.value * (H + 40) },
      // Dérive latérale : un flocon ne tombe jamais droit.
      { translateX: Math.sin(progress.value * Math.PI * 3) * 26 },
      { scale },
    ],
    opacity: 0.85 - progress.value * 0.35,
  }));

  return <Animated.View style={[styles.flake, { left: x }, style]} />;
}

function Star({ x, y, delay, scale }: { x: number; y: number; delay: number; scale: number }) {
  const twinkle = useSharedValue(0.4);

  useLoop(twinkle, () => withDelay(
    delay,
    withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.3, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    ),
  ));

  const style = useAnimatedStyle(() => ({ opacity: twinkle.value, transform: [{ scale }] }));
  return <Animated.View style={[styles.star, { left: x, top: y * 0.65 }, style]} />;
}

/** Halo solaire qui respire doucement derrière le contenu. */
function SunGlow() {
  const pulse = useSharedValue(0);

  useLoop(pulse, () => withRepeat(
    withSequence(
      withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.quad) }),
      withTiming(0, { duration: 4200, easing: Easing.inOut(Easing.quad) }),
    ),
    -1,
  ));

  const style = useAnimatedStyle(() => ({
    opacity: 0.28 + pulse.value * 0.22,
    transform: [{ scale: 1 + pulse.value * 0.12 }],
  }));

  return <Animated.View style={[styles.sunGlow, style]} pointerEvents="none" />;
}

/** Bandes de brume qui glissent lentement à l'horizontale. */
function FogBand({ top, delay, duration }: { top: number; delay: number; duration: number }) {
  const drift = useSharedValue(0);

  useLoop(drift, () => withDelay(
    delay,
    withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1),
  ));

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: -W + drift.value * (W * 2) }],
  }));

  return <Animated.View style={[styles.fogBand, { top }, style]} pointerEvents="none" />;
}

/** Éclair : flash bref et espacé, jamais stroboscopique. */
function Lightning() {
  const flash = useSharedValue(0);

  useLoop(flash, () => withRepeat(
    withSequence(
      withTiming(0, { duration: 3800 }),
      withTiming(0.5, { duration: 70 }),
      withTiming(0, { duration: 90 }),
      withTiming(0.3, { duration: 60 }),
      withTiming(0, { duration: 700 }),
    ),
    -1,
  ));

  const style = useAnimatedStyle(() => ({ opacity: flash.value }));
  return <Animated.View style={[StyleSheet.absoluteFill, styles.lightning, style]} pointerEvents="none" />;
}

// ── Composant principal ──────────────────────────────────────────────────────

export function WeatherSky({
  kind, moment, style, children,
}: {
  kind: WeatherKind;
  moment: DayMoment;
  style?: ViewStyle;
  children?: React.ReactNode;
}) {
  const colors = skyColors(kind, moment);
  const isNight = moment === 'night';
  const rainy = kind === 'rain' || kind === 'heavy_rain'
    || kind === 'drizzle' || kind === 'thunderstorm';

  // Mémoïsé : sans ça, chaque re-render redistribuerait les particules et
  // l'ensemble « sauterait » à l'écran.
  const drops = useMemo(() => seededParticles(kind === 'heavy_rain' ? 34 : 22, 11), [kind]);
  const flakes = useMemo(() => seededParticles(26, 7), []);
  const stars = useMemo(() => seededParticles(42, 3), []);

  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      <LinearGradient
        colors={colors as [string, string, ...string[]]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {isNight && stars.map((p, i) => <Star key={`s${i}`} {...p} />)}
      {!isNight && (kind === 'clear' || kind === 'partly_cloudy') && <SunGlow />}

      {rainy && drops.map((p, i) => (
        <Drop key={`d${i}`} x={p.x} delay={p.delay} heavy={kind === 'heavy_rain'} />
      ))}
      {kind === 'snow' && flakes.map((p, i) => <Flake key={`f${i}`} {...p} />)}

      {(kind === 'fog' || kind === 'cloudy') && (
        <>
          <FogBand top={H * 0.22} delay={0} duration={26000} />
          <FogBand top={H * 0.44} delay={4000} duration={34000} />
          <FogBand top={H * 0.68} delay={9000} duration={30000} />
        </>
      )}

      {kind === 'thunderstorm' && <Lightning />}

      {/* Voile sombre en bas : garantit la lisibilité du texte quel que soit
          le ciel affiché derrière. */}
      <LinearGradient
        colors={gradients.scrim}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  drop: {
    position: 'absolute', top: 0, width: 2, borderRadius: 1,
    backgroundColor: 'rgba(200,225,255,0.55)',
  },
  flake: {
    position: 'absolute', top: 0, width: 7, height: 7, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  star: {
    position: 'absolute', width: 2.5, height: 2.5, borderRadius: 2,
    backgroundColor: '#fff',
  },
  sunGlow: {
    position: 'absolute', top: -H * 0.16, right: -W * 0.28,
    width: W * 1.1, height: W * 1.1, borderRadius: W,
    backgroundColor: 'rgba(255,204,120,0.5)',
  },
  fogBand: {
    position: 'absolute', left: 0, width: W * 2, height: 78,
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderRadius: 60,
  },
  lightning: { backgroundColor: 'rgba(226,232,255,0.9)' },
});
