/**
 * Briques visuelles de l'écran d'abonnement (17/11/2026) : fond spatial,
 * badge du palier en grand avec halo, carte de forfait, ligne d'écart,
 * bouton d'achat. Purement visuelles : aucune ne lit ni n'écrit d'état
 * d'achat — elles reçoivent des valeurs et un `onPress`.
 *
 * Une seule couleur d'accent, le dégradé de marque ; les badges Gold /
 * Diamond gardent leurs propres images.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, I18nManager, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing, ZoomIn, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence,
  withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import type { Plan } from '@yumia/shared';
import { colors, elevation, gradients, motion, radius, spacing } from '../../theme/tokens';
import { PlanBadgeIcon } from '../Avatar';
import { GradientText, PressableScale } from '../ui';
import { SpaceBackground } from '../space/SpaceBackground';

/** Flèche de retour dans le sens de lecture. */
export const BACK_ARROW = I18nManager.isRTL ? '→' : '←';

/** Vrai tant que l'écran est affiché (les boucles s'arrêtent sinon). */
function useScreenFocused(): boolean {
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  return focused;
}

/** Fond spatial de l'Accueil, animé seulement quand l'écran est affiché. */
export function PlusBackdrop() {
  const focused = useScreenFocused();
  return <SpaceBackground active={focused} />;
}

/**
 * Badge du palier regardé, en grand, dans un halo radial qui respire.
 * `key` sur le badge : changer de palier le fait rebondir.
 */
export function TierHalo({ plan }: { plan: Plan }) {
  const focused = useScreenFocused();
  const breath = useSharedValue(0);
  useEffect(() => {
    if (!focused) {
      cancelAnimation(breath);
      return;
    }
    breath.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(breath);
  }, [focused, breath]);
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.7 + breath.value * 0.3,
    transform: [{ scale: 0.94 + breath.value * 0.1 }],
  }));

  const G = 220;
  return (
    <View style={styles.haloBox}>
      <Animated.View style={[styles.halo, { width: G, height: G, marginLeft: -G / 2, marginTop: -G / 2 }, haloStyle]} pointerEvents="none">
        <Svg width={G} height={G}>
          <Defs>
            <RadialGradient id="plusHalo" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={colors.brandSoft} stopOpacity="0.55" />
              <Stop offset="0.35" stopColor={colors.brand} stopOpacity="0.28" />
              <Stop offset="0.7" stopColor={colors.accent} stopOpacity="0.1" />
              <Stop offset="1" stopColor={colors.accent} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={G / 2} cy={G / 2} r={G / 2} fill="url(#plusHalo)" />
        </Svg>
      </Animated.View>
      <Animated.View key={plan} entering={ZoomIn.springify().damping(12)}>
        <PlanBadgeIcon plan={plan} size={96} />
      </Animated.View>
    </View>
  );
}

/** Carte d'un forfait : liseré au dégradé de marque et léger rebond quand choisie. */
export function TierCard({
  plan, name, price, per, selected, onPress,
}: {
  plan: Plan;
  name: string;
  price: string;
  per: string;
  selected: boolean;
  onPress: () => void;
}) {
  const s = useSharedValue(1);
  useEffect(() => {
    if (selected) s.value = withSequence(withSpring(1.04, motion.spring.bouncy), withSpring(1, motion.spring.gentle));
  }, [selected, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));

  return (
    <Animated.View style={[styles.tierWrap, selected && elevation.glowBrand, style]}>
      <PressableScale onPress={onPress} scaleTo={0.97} style={styles.tierOuter}>
        {selected ? (
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.tierIdleBorder]} />
        )}
        <View style={styles.tierInner}>
          <View style={[styles.check, selected && styles.checkOn]}>
            {selected ? (
              <>
                <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <Text style={styles.checkMark}>✓</Text>
              </>
            ) : null}
          </View>
          <PlanBadgeIcon plan={plan} size={34} />
          <Text style={styles.tierName} numberOfLines={1}>{name}</Text>
          <View style={styles.priceBox}>
            <Text style={styles.tierPrice}>{price}</Text>
            <Text style={styles.tierPer}>{per}</Text>
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

/** Ligne « ce qui change » : libellé, puis avant → après, ou « débloqué ». */
export function ChangeRow({ label, from, to, unlocked, unlockedLabel }: {
  label: string;
  from: string;
  to: string;
  unlocked: boolean;
  unlockedLabel: string;
}) {
  return (
    <View style={styles.changeRow}>
      <Text style={styles.changeLabel} numberOfLines={2}>{label}</Text>
      {unlocked ? (
        <GradientText style={styles.changeUnlocked}>{`✓ ${unlockedLabel}`}</GradientText>
      ) : (
        <View style={styles.changeValues}>
          <Text style={styles.changeFrom}>{from}</Text>
          <Text style={styles.changeArrow}>{I18nManager.isRTL ? '←' : '→'}</Text>
          <GradientText style={styles.changeTo}>{to}</GradientText>
        </View>
      )}
    </View>
  );
}

/** Bouton d'achat : dégradé de marque, reflet, halo. */
export function BuyButton({ label, loading, disabled, onPress }: {
  label: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <View style={[styles.ctaShadow, (disabled || loading) && styles.ctaDim]}>
      <PressableScale onPress={onPress} disabled={disabled} haptic scaleTo={0.97} style={styles.cta}>
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={gradients.glassSheen} style={StyleSheet.absoluteFill} />
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText} numberOfLines={1}>{label}</Text>}
      </PressableScale>
    </View>
  );
}

/** Carte vitrée simple. */
export function Glass({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.glass, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  haloBox: { width: 160, height: 140, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  halo: { position: 'absolute', left: '50%', top: '50%' },

  tierWrap: { borderRadius: radius.lg, marginBottom: spacing.sm },
  tierOuter: { borderRadius: radius.lg, overflow: 'hidden', padding: 1.5 },
  tierIdleBorder: { backgroundColor: 'rgba(255,255,255,0.12)' },
  tierInner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    borderRadius: radius.lg - 1.5, backgroundColor: 'rgba(14,14,22,0.94)',
  },
  check: {
    width: 22, height: 22, borderRadius: 11, overflow: 'hidden',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  checkOn: { borderColor: 'transparent' },
  checkMark: { color: '#fff', fontSize: 12, fontWeight: '900' },
  tierName: { color: colors.textPrimary, fontSize: 17, fontWeight: '800', flex: 1, letterSpacing: -0.2 },
  priceBox: { flexDirection: 'row', alignItems: 'baseline' },
  tierPrice: { color: colors.textPrimary, fontSize: 21, fontWeight: '900', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  tierPer: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginStart: 2 },

  changeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: spacing.md },
  changeLabel: { fontSize: 14, color: colors.textSecondary, fontWeight: '600', flex: 1, paddingEnd: spacing.sm },
  changeValues: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  changeFrom: { fontSize: 13, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  changeArrow: { fontSize: 12, color: colors.textMuted },
  changeTo: { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  changeUnlocked: { fontSize: 13, fontWeight: '800' },

  ctaShadow: { borderRadius: radius.pill, ...elevation.glowBrand },
  ctaDim: { opacity: 0.6 },
  cta: {
    borderRadius: radius.pill, overflow: 'hidden', paddingVertical: 17, paddingHorizontal: spacing.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.2 },

  glass: {
    borderRadius: radius.lg, overflow: 'hidden',
    backgroundColor: 'rgba(20,20,30,0.82)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
});
