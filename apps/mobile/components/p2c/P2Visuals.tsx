/**
 * Briques visuelles partagées par Guides, Quêtes, Classement et Surprise
 * (DA du 17/11/2026 : une seule couleur d'accent — le dégradé de marque —,
 * verre sombre sobre, typographie forte, aucun voile dégradé sur le fond).
 *
 * Purement visuelles : aucune ne lit ni n'écrit de donnée, aucune n'appelle
 * le réseau. Les animations en boucle s'arrêtent au démontage.
 */
import { useEffect, useId, type ReactNode } from 'react';
import {
  I18nManager, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing, cancelAnimation, useAnimatedProps, useAnimatedStyle, useSharedValue,
  withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { colors, elevation, gradients, radius, spacing } from '../../theme/tokens';
import { GradientText, PressableScale, Reveal } from '../ui';
import { GlassIconButton } from '../social/SocialChrome';

/** Flèche de retour qui suit le sens de lecture. */
export const BACK_ARROW = I18nManager.isRTL ? '→' : '←';

/** Verre sombre sobre (cartes, champs, lignes). */
export const GLASS_SURFACE: ViewStyle = {
  backgroundColor: 'rgba(31,31,42,0.62)',
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: 'rgba(255,255,255,0.12)',
};

/**
 * Sépare un emoji de tête (« 🧭 Visites guidées ») du texte : un emoji passé
 * dans un texte en dégradé perdrait ses couleurs (le dégradé est peint à
 * travers la forme des lettres).
 */
export function splitLeadingEmoji(s: string): { emoji: string | null; text: string } {
  const m = s.match(/^(\S+)\s+([\s\S]+)$/);
  // Le premier mot est un emoji s'il ne contient aucune lettre ni chiffre
  // (latin, accentués, arabe, cyrillique, chinois, devanagari).
  if (m && !/[0-9A-Za-zÀ-ÿ؀-ۿЀ-ӿ一-鿿ऀ-ॿ]/.test(m[1])) {
    return { emoji: m[1], text: m[2] };
  }
  return { emoji: null, text: s };
}

// ── En-tête ──────────────────────────────────────────────────────────────────

/** Retour en verre, médaillon d'emoji au dégradé, titre fort au dégradé. */
export function P2Header({
  title, subtitle, onBack, backLabel, right, emoji: forcedEmoji,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  backLabel?: string;
  right?: ReactNode;
  /** Emoji du médaillon ; sinon pris en tête du titre s'il y en a un. */
  emoji?: string;
}) {
  const split = splitLeadingEmoji(title);
  const emoji = forcedEmoji ?? split.emoji;
  return (
    <View style={styles.header}>
      <GlassIconButton icon={BACK_ARROW} onPress={onBack} label={backLabel} />
      {emoji ? (
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerMedal}>
          <Text style={styles.headerMedalEmoji}>{emoji}</Text>
        </LinearGradient>
      ) : null}
      <View style={styles.headerText}>
        <GradientText style={styles.headerTitle}>{split.text}</GradientText>
        {subtitle ? <Text style={styles.headerSub} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.headerRight}>{right}</View> : null}
    </View>
  );
}

// ── Anneau de progression ────────────────────────────────────────────────────

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Anneau au dégradé de marque qui se remplit jusqu'à `progress` (0 → 1) à
 * l'apparition, puis suit les changements. Animation ponctuelle, pas de boucle.
 */
export function ProgressRing({
  size, stroke = 6, progress, children, delay = 0,
}: {
  size: number;
  stroke?: number;
  progress: number;
  children?: ReactNode;
  delay?: number;
}) {
  // useId renvoie « :r1: » : les deux-points cassent une référence url(#…).
  const gid = `ring${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const p = useSharedValue(0);
  const target = Math.max(0, Math.min(1, progress));

  useEffect(() => {
    const id = setTimeout(() => {
      p.value = withTiming(target, { duration: 900, easing: Easing.out(Easing.cubic) });
    }, delay);
    return () => clearTimeout(id);
  }, [target, delay, p]);

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: circ * (1 - p.value) }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={[StyleSheet.absoluteFill, { transform: [{ rotate: '-90deg' }] }]}>
        <Defs>
          <SvgLinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={gradients.brand[0]} />
            <Stop offset="0.5" stopColor={gradients.brand[1]} />
            <Stop offset="1" stopColor={gradients.brand[2]} />
          </SvgLinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.10)" strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circ} ${circ}`}
          animatedProps={animatedProps}
        />
      </Svg>
      {children}
    </View>
  );
}

// ── Jauge horizontale ────────────────────────────────────────────────────────

/** Jauge au dégradé qui se remplit depuis le début de ligne (RTL compris). */
export function GradientBar({ progress, height = 8, delay = 0 }: { progress: number; height?: number; delay?: number }) {
  const w = useSharedValue(0);
  const target = Math.max(0, Math.min(1, progress));
  useEffect(() => {
    const id = setTimeout(() => {
      w.value = withTiming(target, { duration: 800, easing: Easing.out(Easing.cubic) });
    }, delay);
    return () => clearTimeout(id);
  }, [target, delay, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={[styles.barTrack, { height, borderRadius: height / 2 }]}>
      <Animated.View style={[styles.barFill, { borderRadius: height / 2 }, fill]}>
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

// ── Pastilles ────────────────────────────────────────────────────────────────

/** Pastille au dégradé de marque (récompense XP, compatibilité…). */
export function BrandPill({ label, style, textStyle }: {
  label: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.brandPill, style]}>
      <Text style={[styles.brandPillText, textStyle]} numberOfLines={1}>{label}</Text>
    </LinearGradient>
  );
}

/** Pastille de verre (métadonnée sur photo ou sur carte). */
export function GlassPill({ label, style }: { label: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.glassPill, style]}>
      <Text style={styles.glassPillText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/**
 * Filtre cumulable : contour plutôt que remplissage, pour se distinguer d'un
 * coup d'œil des filtres à choix unique (pastilles pleines au dégradé).
 */
export function ToggleChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.94} style={[styles.toggleChip, active && styles.toggleChipActive]}>
      <Text style={[styles.toggleChipText, active && styles.toggleChipTextActive]}>{label}</Text>
    </PressableScale>
  );
}

// ── Attente et états vides ───────────────────────────────────────────────────

/** Carte fantôme qui pulse pendant un chargement (boucle arrêtée au démontage). */
export function SkeletonCard({ height, style }: { height: number; style?: StyleProp<ViewStyle> }) {
  const o = useSharedValue(0.45);
  useEffect(() => {
    o.value = withRepeat(
      withSequence(
        withTiming(0.85, { duration: 700, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.45, { duration: 700, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    return () => cancelAnimation(o);
  }, [o]);
  const s = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.skeleton, { height }, s, style]} />;
}

/** État vide : médaillon dégradé, texte, action facultative. */
export function P2Empty({ emoji, text, action }: { emoji: string; text: string; action?: ReactNode }) {
  return (
    <Reveal style={styles.empty}>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyMedal}>
        <Text style={styles.emptyEmoji}>{emoji}</Text>
      </LinearGradient>
      <Text style={styles.emptyText}>{text}</Text>
      {action}
    </Reveal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md,
  },
  headerMedal: {
    width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.35)',
    ...elevation.glowBrand,
  },
  headerMedalEmoji: { fontSize: 21 },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  headerSub: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  barTrack: { width: '100%', backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', alignItems: 'flex-start' },
  barFill: { height: '100%', overflow: 'hidden' },

  brandPill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  brandPillText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  glassPill: {
    borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: 'rgba(14,14,18,0.62)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.22)',
  },
  glassPillText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  toggleChip: {
    borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  toggleChipActive: { borderColor: colors.brand, backgroundColor: 'rgba(232,98,26,0.14)' },
  toggleChipText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  toggleChipTextActive: { color: colors.brandSoft },

  skeleton: { borderRadius: radius.lg, ...GLASS_SURFACE },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: spacing.xl, gap: spacing.md },
  emptyMedal: {
    width: 80, height: 80, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    ...elevation.glowBrand,
  },
  emptyEmoji: { fontSize: 36 },
  emptyText: { color: colors.textSecondary, fontSize: 15, lineHeight: 21, textAlign: 'center', fontWeight: '600' },
});
