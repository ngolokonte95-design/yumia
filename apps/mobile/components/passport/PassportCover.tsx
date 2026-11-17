/**
 * Couverture du Passeport : dégradé de marque, guillochis animé (anneaux qui
 * tournent lentement, reflet qui balaie la couverture), niveau en grand, XP
 * qui défile et barre de progression qui se remplit.
 *
 * Les boucles ne tournent que si `active` (onglet affiché) — batterie.
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat,
  withSequence, withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, motion, radius, spacing, typography } from '../../theme/tokens';
import { AnimatedNumber, PressableScale } from '../ui';
import { YumiaLogo } from '../YumiaLogo';

export interface CoverLevel {
  emoji: string;
  name: string;
}

export function PassportCover({
  active,
  title,
  holder,
  level,
  journeyStart,
  totalXp,
  ratio,
  progressHint,
  leaderboardLabel,
  onLeaderboard,
}: {
  active: boolean;
  title: string;
  holder?: string | null;
  level: CoverLevel | null;
  journeyStart: string;
  totalXp: number;
  /** Progression vers le niveau suivant (0-1), null au niveau max. */
  ratio: number | null;
  progressHint: string | null;
  leaderboardLabel: string;
  onLeaderboard: () => void;
}) {
  const { width } = useWindowDimensions();

  // ── Boucles d'ambiance ────────────────────────────────────────────────────
  const spin = useSharedValue(0);
  const sheen = useSharedValue(0);
  const float = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      cancelAnimation(spin);
      cancelAnimation(sheen);
      cancelAnimation(float);
      return;
    }
    spin.value = withRepeat(withTiming(spin.value + 360, { duration: 60_000, easing: Easing.linear }), -1);
    sheen.value = 0;
    sheen.value = withRepeat(
      withSequence(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }), withDelay(3200, withTiming(0, { duration: 0 }))),
      -1,
    );
    const ease = Easing.inOut(Easing.sin);
    float.value = withRepeat(withSequence(withTiming(-6, { duration: 1800, easing: ease }), withTiming(0, { duration: 1800, easing: ease })), -1);
    return () => {
      cancelAnimation(spin);
      cancelAnimation(sheen);
      cancelAnimation(float);
    };
  }, [active, spin, sheen, float]);

  const ringsStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const sheenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -width + sheen.value * width * 2.2 }, { rotate: '18deg' }],
  }));
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: float.value }] }));

  // ── Barre de progression ──────────────────────────────────────────────────
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withDelay(motion.duration.normal, withTiming(ratio ?? 1, { duration: 1100, easing: Easing.out(Easing.cubic) }));
  }, [ratio, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, fill.value)) * 100}%` }));

  return (
    <View style={styles.cover}>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />

      {/* Guillochis : anneaux concentriques qui tournent très lentement. */}
      <Animated.View style={[styles.rings, ringsStyle]} pointerEvents="none">
        {[260, 210, 160, 110].map((d, i) => (
          <View
            key={d}
            style={[styles.ring, { width: d, height: d, borderRadius: d / 2, borderStyle: i % 2 ? 'dashed' : 'solid' }]}
          />
        ))}
      </Animated.View>

      {/* Reflet qui balaie la couverture. */}
      <Animated.View style={[styles.sheen, sheenStyle]} pointerEvents="none">
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.18)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <LinearGradient colors={gradients.glassSheen} style={StyleSheet.absoluteFill} pointerEvents="none" />

      <View style={styles.top}>
        <View style={styles.topText}>
          <YumiaLogo height={34} />
          <Text style={styles.kicker} numberOfLines={1}>{title.toUpperCase()}</Text>
        </View>
        <PressableScale style={styles.leaderboard} onPress={onLeaderboard} haptic>
          <Text style={styles.leaderboardText} numberOfLines={1}>🏆 {leaderboardLabel}</Text>
        </PressableScale>
      </View>

      <View style={styles.middle}>
        <Animated.View style={[styles.levelBadge, floatStyle]}>
          <Text style={styles.levelEmoji}>{level?.emoji ?? '🧭'}</Text>
        </Animated.View>
        <View style={styles.levelText}>
          {holder ? <Text style={styles.holder} numberOfLines={1}>{holder}</Text> : null}
          <Text style={styles.levelName} numberOfLines={2}>{level?.name ?? journeyStart}</Text>
          <View style={styles.xpRow}>
            <AnimatedNumber value={totalXp} style={styles.xpValue} />
            <Text style={styles.xpUnit}>XP</Text>
          </View>
        </View>
      </View>

      <View>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, fillStyle]}>
            <LinearGradient colors={['#FFFFFF', 'rgba(255,255,255,0.75)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>
        {progressHint ? <Text style={styles.hint} numberOfLines={2}>{progressHint}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    minHeight: 260,
    borderRadius: radius.xl,
    overflow: 'hidden',
    padding: spacing.lg,
    justifyContent: 'space-between',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    shadowColor: colors.brand,
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  rings: {
    position: 'absolute', right: -70, top: -60, width: 260, height: 260,
    alignItems: 'center', justifyContent: 'center',
  },
  ring: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.14)' },
  sheen: { position: 'absolute', top: -80, bottom: -80, width: 90 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  topText: { flex: 1, gap: 4, alignItems: 'flex-start' },
  kicker: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '800', letterSpacing: 2.5 },
  leaderboard: {
    backgroundColor: 'rgba(0,0,0,0.25)', borderColor: 'rgba(255,255,255,0.3)', borderWidth: 1,
    borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12, maxWidth: '50%',
  },
  leaderboardText: { ...typography.caption, color: '#fff', fontWeight: '800' },
  middle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  levelBadge: {
    width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.45)', borderWidth: 2,
  },
  levelEmoji: { fontSize: 40 },
  levelText: { flex: 1, minWidth: 0 },
  holder: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700' },
  levelName: {
    color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -0.6,
    textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 2 },
  },
  xpRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  xpValue: { color: '#fff', fontSize: 22, fontWeight: '900' },
  xpUnit: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '800' },
  track: {
    height: 12, borderRadius: radius.pill, overflow: 'hidden', flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.28)', borderColor: 'rgba(255,255,255,0.25)', borderWidth: StyleSheet.hairlineWidth,
  },
  fill: { height: '100%', borderRadius: radius.pill, overflow: 'hidden' },
  hint: { ...typography.caption, color: 'rgba(255,255,255,0.88)', marginTop: 6, fontWeight: '600' },
});
