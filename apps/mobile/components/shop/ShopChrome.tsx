/**
 * Habillage commun de la Boutique (17/11/2026) : en-tête, boutons ronds en
 * verre, bouton d'action au dégradé de marque, titres de section, états vides,
 * prix qui « rebondit » quand il change.
 *
 * Direction voulue par l'utilisateur : UNE seule couleur d'accent (le dégradé
 * de marque orange → violet, avec retenue), verre sobre, typographie forte,
 * aucun voile dégradé vers le fond sombre.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, View,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { colors, elevation, gradients, motion, radius, spacing } from '../../theme/tokens';
import { PressableScale } from '../ui';

// ── Bouton rond en verre (retour, panier, favoris…) ─────────────────────────

export function GlassIconButton({
  icon, onPress, badge, active, accessibilityLabel, style,
}: {
  icon: string;
  onPress: () => void;
  badge?: number;
  /** Bouton « allumé » (recherche ouverte…) : liseré de marque. */
  active?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale style={[styles.iconBtn, active && styles.iconBtnActive, style]} onPress={onPress} scaleTo={0.88}>
      <View accessible accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={styles.iconBtnInner}>
        <Text style={styles.iconBtnTxt}>{icon}</Text>
      </View>
      {badge && badge > 0 ? (
        <View style={styles.badge}>
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Text style={styles.badgeTxt}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

// ── En-tête d'écran ──────────────────────────────────────────────────────────

export function ShopHeader({
  title, subtitle, onBack, backLabel, right,
}: {
  title?: string;
  subtitle?: string;
  onBack: () => void;
  backLabel?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <GlassIconButton icon="←" onPress={onBack} accessibilityLabel={backLabel} />
      <View style={styles.headerText}>
        {title ? <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text> : null}
        {subtitle ? <Text style={styles.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.headerRight}>{right}</View> : <View style={styles.headerSpacer} />}
    </View>
  );
}

// ── Titre de section ─────────────────────────────────────────────────────────

export function SectionHeader({
  title, actionLabel, onAction, style,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.section, style]}>
      <View style={styles.sectionTitleWrap}>
        <View style={styles.sectionTick}>
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
        </View>
        <Text style={styles.sectionTitle} numberOfLines={1}>{title}</Text>
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} style={styles.sectionAction}>
          <Text style={styles.sectionActionTxt}>{actionLabel}</Text>
          <Text style={styles.sectionActionArrow}>›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Bouton d'action principal (dégradé de marque) ────────────────────────────

export function GradientButton({
  label, onPress, disabled, loading, icon, style, size = 'lg',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
  size?: 'md' | 'lg';
}) {
  const off = disabled || loading;
  return (
    // Ombre (halo) sur le conteneur, découpe arrondie sur l'intérieur : sur
    // iOS, `overflow: hidden` sur la même vue effacerait le halo.
    <PressableScale
      style={[styles.ctaShell, !off && elevation.glowBrand, off && styles.ctaOff, style]}
      onPress={onPress}
      disabled={off}
      scaleTo={0.96}
      haptic
    >
      <View style={[styles.cta, size === 'md' && styles.ctaMd]}>
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={gradients.glassSheen} style={StyleSheet.absoluteFill} />
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={[styles.ctaTxt, size === 'md' && styles.ctaTxtMd]} numberOfLines={1}>
            {icon ? `${icon}  ` : ''}{label}
          </Text>
        )}
      </View>
    </PressableScale>
  );
}

/** Bouton secondaire : contour fin, sans couleur. */
export function GhostButton({ label, onPress, style }: { label: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <PressableScale style={[styles.ghost, style]} onPress={onPress} scaleTo={0.96}>
      <Text style={styles.ghostTxt} numberOfLines={1}>{label}</Text>
    </PressableScale>
  );
}

// ── État vide / erreur ───────────────────────────────────────────────────────

export function ShopEmpty({
  emoji, title, text, children,
}: {
  emoji: string;
  title: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyMedalShell, elevation.glowBrand]}>
        <View style={styles.emptyMedal}>
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={gradients.glassSheen} style={StyleSheet.absoluteFill} />
          <Text style={styles.emptyEmoji}>{emoji}</Text>
        </View>
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {text ? <Text style={styles.emptyText}>{text}</Text> : null}
      {children}
    </View>
  );
}

// ── Prix qui rebondit quand il change ────────────────────────────────────────

export function PricePop({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const scale = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    scale.value = withSequence(
      withTiming(1.12, { duration: motion.duration.instant }),
      withSpring(1, motion.spring.bouncy),
    );
  }, [text, scale]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.Text style={[style, animated]}>{text}</Animated.Text>;
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(31,31,42,0.72)', borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  iconBtnActive: { borderColor: colors.brand, borderWidth: 1.5 },
  iconBtnInner: { alignItems: 'center', justifyContent: 'center' },
  iconBtnTxt: { fontSize: 18, color: '#fff', fontWeight: '700' },
  badge: {
    position: 'absolute', top: -3, right: -3, minWidth: 19, height: 19, borderRadius: 10,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
    borderWidth: 1.5, borderColor: colors.bg,
  },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '900' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  headerSub: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerSpacer: { width: 42 },

  section: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, marginBottom: spacing.md,
  },
  sectionTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  sectionTick: { width: 4, height: 22, borderRadius: 2, overflow: 'hidden' },
  sectionTitle: { color: colors.textPrimary, fontSize: 21, fontWeight: '900', letterSpacing: -0.4, flexShrink: 1 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionActionTxt: { color: colors.brandSoft, fontSize: 13, fontWeight: '700' },
  sectionActionArrow: { color: colors.brandSoft, fontSize: 18, fontWeight: '700', marginTop: -2 },

  ctaShell: { borderRadius: radius.pill },
  cta: {
    minHeight: 54, borderRadius: radius.pill, overflow: 'hidden', alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: spacing.lg,
  },
  ctaMd: { minHeight: 44, paddingHorizontal: spacing.md },
  ctaOff: { opacity: 0.45 },
  ctaTxt: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 0.2 },
  ctaTxtMd: { fontSize: 14 },
  ghost: {
    minHeight: 50, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', paddingHorizontal: spacing.lg,
  },
  ghostTxt: { color: colors.textSecondary, fontWeight: '700', fontSize: 14 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl },
  emptyMedalShell: { borderRadius: 30, marginBottom: spacing.sm },
  emptyMedal: {
    width: 88, height: 88, borderRadius: 30, overflow: 'hidden', alignItems: 'center',
    justifyContent: 'center',
  },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '900', textAlign: 'center', letterSpacing: -0.3 },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
});
