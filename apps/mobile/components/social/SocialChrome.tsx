/**
 * Briques communes des écrans Social (Tind, Meetups, Souvenirs) — DA du
 * 17/11/2026 : une seule couleur d'accent (dégradé de marque), verre sobre,
 * typographie forte, aucun voile dégradé sur le fond.
 */
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, elevation, gradients, radius, spacing } from '../../theme/tokens';
import { GradientText, PressableScale, Reveal } from '../ui';

/** Bouton rond en verre (retour, actions d'en-tête). */
export function GlassIconButton({
  icon, onPress, size = 42, label, style,
}: {
  icon: ReactNode;
  onPress?: () => void;
  size?: number;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.88}
      hitSlop={8}
      style={[styles.glassBtn, { width: size, height: size, borderRadius: size / 2 }, style]}
    >
      {typeof icon === 'string' ? (
        <Text style={styles.glassBtnText} accessibilityLabel={label}>{icon}</Text>
      ) : icon}
    </PressableScale>
  );
}

/** En-tête : retour en verre, titre au dégradé de marque, emplacement à droite. */
export function SocialHeader({
  title, subtitle, onBack, right, backIcon = '←',
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  right?: ReactNode;
  backIcon?: string;
}) {
  return (
    <View style={styles.header}>
      <GlassIconButton icon={backIcon} onPress={onBack} />
      <View style={styles.headerText}>
        <GradientText style={styles.headerTitle}>{title}</GradientText>
        {subtitle ? <Text style={styles.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <View style={styles.headerRight}>{right}</View>
    </View>
  );
}

/** Bouton principal au dégradé de marque, avec reflet et halo. */
export function BrandButton({
  label, onPress, loading, disabled, style, compact,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      haptic
      scaleTo={0.96}
      style={[styles.brandBtn, compact && styles.brandBtnCompact, (disabled || loading) && { opacity: 0.6 }, style]}
    >
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={gradients.glassSheen} style={StyleSheet.absoluteFill} />
      {loading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <Text style={[styles.brandBtnText, compact && { fontSize: 13 }]} numberOfLines={1}>{label}</Text>
      )}
    </PressableScale>
  );
}

/** Bouton secondaire : contour de marque, fond vitré. */
export function OutlineButton({
  label, onPress, style,
}: { label: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.96} style={[styles.outlineBtn, style]}>
      <Text style={styles.outlineBtnText} numberOfLines={1}>{label}</Text>
    </PressableScale>
  );
}

/** Pastille de filtre : remplie du dégradé quand elle est choisie. */
export function BrandChip({
  label, active, onPress,
}: { label: string; active: boolean; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.94} style={[styles.chip, active && styles.chipActive]}>
      {active ? (
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      ) : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </PressableScale>
  );
}

/** État vide : médaillon dégradé, titre, texte, action facultative. */
export function SocialEmpty({
  emoji, title, text, action,
}: { emoji: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <Reveal style={styles.empty}>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyMedal}>
        <Text style={styles.emptyEmoji}>{emoji}</Text>
      </LinearGradient>
      <Text style={styles.emptyTitle}>{title}</Text>
      {text ? <Text style={styles.emptyText}>{text}</Text> : null}
      {action}
    </Reveal>
  );
}

/** Titre de section en petites capitales espacées + filet fin. */
export function SectionTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} numberOfLines={1}>{title}</Text>
      <View style={styles.sectionRule} />
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  glassBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(31,31,42,0.72)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
  },
  glassBtnText: { color: '#fff', fontSize: 19, fontWeight: '800' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md,
  },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 28, fontWeight: '900', letterSpacing: -0.6 },
  headerSub: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  brandBtn: {
    height: 52, borderRadius: radius.pill, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg,
    ...elevation.glowBrand,
  },
  brandBtnCompact: { height: 38, paddingHorizontal: spacing.md },
  brandBtnText: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.2 },

  outlineBtn: {
    height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.lg, borderWidth: 1.5, borderColor: colors.brand,
    backgroundColor: 'rgba(232,98,26,0.08)',
  },
  outlineBtnText: { color: colors.brandSoft, fontSize: 15, fontWeight: '800' },

  chip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill, overflow: 'hidden',
    backgroundColor: 'rgba(31,31,42,0.72)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)',
  },
  chipActive: { borderColor: 'transparent' },
  chipText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '900' },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 56, paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyMedal: {
    width: 84, height: 84, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm, ...elevation.glowBrand,
  },
  emptyEmoji: { fontSize: 38 },
  emptyTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '900', textAlign: 'center', letterSpacing: -0.3 },
  emptyText: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: spacing.md },

  section: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary, fontSize: 12, fontWeight: '800', letterSpacing: 2.2,
    textTransform: 'uppercase', flexShrink: 1,
  },
  sectionRule: { flex: 1, minWidth: 12, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.22)' },
});
