/**
 * Briques visuelles communes au Profil, aux Réglages, à l'édition du profil
 * et au choix de la langue (17/11/2026).
 *
 * Une seule couleur d'accent : le dégradé de marque (orange → violet), avec
 * retenue. Fond sombre uni, groupes en verre sobre, séparateurs fins. Aucun
 * voile en dégradé linéaire vers le fond (ils dessinaient une « barre grise »).
 * Le rouge reste réservé aux actions destructrices (fonctionnel).
 */
import { Children, Fragment, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, I18nManager, StyleSheet, Switch, Text, View,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, spacing, typography } from '../../theme/tokens';
import { PressableScale, AnimatedNumber } from '../ui';
import { haptics } from '../../lib/useHaptics';

/** Chevron qui suit le sens de lecture (RTL : vers la gauche). */
export const CHEVRON = I18nManager.isRTL ? '‹' : '›';

/** Verre sombre sobre, partagé par tous les groupes. */
export const GLASS: ViewStyle = {
  backgroundColor: 'rgba(31,31,42,0.62)',
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: 'rgba(255,255,255,0.10)',
};

// ── Titres de section ───────────────────────────────────────────────────────

/** Titre de section en petites capitales espacées. */
export function SectionLabel({ label, style }: { label: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.sectionLabel, style]}>{label}</Text>;
}

// ── Groupe vitré à séparateurs fins ─────────────────────────────────────────

/**
 * Regroupe des lignes dans une seule carte vitrée arrondie, avec un filet fin
 * entre deux lignes (pas sous la dernière).
 */
export function GlassGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.group, GLASS, style]}>
      {items.map((child, i) => (
        <Fragment key={i}>
          {i > 0 ? <View style={styles.separator} /> : null}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

// ── Lignes ──────────────────────────────────────────────────────────────────

/** Icône (emoji) dans un rond en verre ; teinté de rouge pour une action destructrice. */
export function IconBubble({ icon, danger = false }: { icon: string; danger?: boolean }) {
  return (
    <View style={[styles.iconBubble, danger && styles.iconBubbleDanger]}>
      <Text style={styles.iconText}>{icon}</Text>
    </View>
  );
}

export function MenuRow({
  icon, label, value, danger = false, loading = false, onPress, trailing,
}: {
  icon: string;
  label: string;
  value?: string;
  danger?: boolean;
  loading?: boolean;
  onPress: () => void;
  /** Élément à droite à la place du chevron (ex. pastille). */
  trailing?: ReactNode;
}) {
  return (
    <PressableScale
      style={styles.row}
      scaleTo={0.98}
      onPress={() => { haptics.select(); onPress(); }}
      disabled={loading}
    >
      <IconBubble icon={icon} danger={danger} />
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]} numberOfLines={2}>{label}</Text>
      {loading ? (
        <ActivityIndicator size="small" color={danger ? colors.danger : colors.textMuted} />
      ) : trailing ? (
        trailing
      ) : (
        <View style={styles.rowEnd}>
          {value ? <Text style={styles.rowValue} numberOfLines={1}>{value}</Text> : null}
          <Text style={[styles.chevron, danger && styles.rowLabelDanger]}>{CHEVRON}</Text>
        </View>
      )}
    </PressableScale>
  );
}

export function ToggleRow({
  icon, label, sublabel, value, onValueChange,
}: {
  icon: string;
  label: string;
  sublabel?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <IconBubble icon={icon} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sublabel ? <Text style={styles.rowSub}>{sublabel}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => { haptics.select(); onValueChange(v); }}
        trackColor={{ false: 'rgba(255,255,255,0.14)', true: `${colors.brand}AA` }}
        thumbColor={value ? '#fff' : colors.textSecondary}
        ios_backgroundColor="rgba(255,255,255,0.14)"
      />
    </View>
  );
}

// ── En-tête d'écran ─────────────────────────────────────────────────────────

/** Bouton rond en verre (retour, réglages, cloche…). */
export function GlassCircleButton({
  label, onPress, badge, size = 42,
}: {
  label: string;
  onPress: () => void;
  badge?: number;
  size?: number;
}) {
  return (
    <PressableScale
      style={[styles.circleBtn, GLASS, { width: size, height: size, borderRadius: size / 2 }]}
      onPress={() => { haptics.select(); onPress(); }}
      scaleTo={0.9}
      hitSlop={6}
    >
      <Text style={styles.circleBtnText}>{label}</Text>
      {badge && badge > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

/** Barre d'en-tête : retour en verre, titre fort, emplacement à droite. */
export function ScreenHeader({
  title, onBack, right,
}: {
  title: string;
  onBack: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <GlassCircleButton label={I18nManager.isRTL ? '→' : '←'} onPress={onBack} />
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={styles.headerRight}>{right}</View>
    </View>
  );
}

// ── Avatar à anneau de marque ───────────────────────────────────────────────

/** Anneau au dégradé de marque autour d'un contenu rond (avatar). */
export function GradientRing({
  size, thickness = 3, children,
}: {
  size: number;
  thickness?: number;
  children: ReactNode;
}) {
  return (
    <LinearGradient
      colors={gradients.brand}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: size / 2, padding: thickness }}
    >
      <View style={[styles.ringInner, { borderRadius: (size - thickness * 2) / 2 }]}>
        {children}
      </View>
    </LinearGradient>
  );
}

/** Pastille ronde remplie du dégradé de marque (coche, crayon…). */
export function BrandDot({ label, size = 26 }: { label: string; size?: number }) {
  return (
    <LinearGradient
      colors={gradients.brand}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.brandDot, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Text style={[styles.brandDotText, { fontSize: size * 0.48 }]}>{label}</Text>
    </LinearGradient>
  );
}

/** Cadre fin au dégradé de marque autour d'une carte (effet « carte premium »). */
export function BrandFrame({ children, style, innerStyle }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <LinearGradient
      colors={gradients.brand}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.frame, style]}
    >
      <View style={[styles.frameInner, innerStyle]}>{children}</View>
    </LinearGradient>
  );
}

// ── Chiffre qui défile depuis zéro ──────────────────────────────────────────

/**
 * Nombre qui monte depuis 0 jusqu'à sa valeur réelle à l'apparition.
 * (AnimatedNumber part de sa valeur initiale : on lui donne 0 au premier
 * rendu, puis la vraie valeur.)
 */
export function CountUp({ value, suffix = '', style }: { value: number; suffix?: string; style?: StyleProp<TextStyle> }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setShown(value), 60);
    return () => clearTimeout(id);
  }, [value]);
  return <AnimatedNumber value={shown} suffix={suffix} style={style} />;
}

const styles = StyleSheet.create({
  sectionLabel: {
    color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.8,
    textTransform: 'uppercase', marginBottom: spacing.sm, marginTop: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  group: { borderRadius: radius.lg, overflow: 'hidden' },
  separator: {
    height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)',
    marginStart: spacing.md + 36 + spacing.md,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: 12, minHeight: 60,
  },
  iconBubble: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  iconBubbleDanger: { backgroundColor: `${colors.danger}1F`, borderColor: `${colors.danger}55` },
  iconText: { fontSize: 17 },
  rowLabel: { ...typography.body, color: colors.textPrimary, fontWeight: '600', flex: 1 },
  rowLabelDanger: { color: colors.danger },
  rowSub: { ...typography.caption, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
  rowEnd: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, maxWidth: '45%' },
  rowValue: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  chevron: { color: colors.textMuted, fontSize: 22, fontWeight: '300', marginTop: -2 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md,
  },
  headerTitle: { flex: 1, color: colors.textPrimary, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  headerRight: { minWidth: 42, alignItems: 'flex-end' },
  circleBtn: { alignItems: 'center', justifyContent: 'center' },
  circleBtnText: { color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
  badge: {
    position: 'absolute', top: -3, right: -3,
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.bg,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  ringInner: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  brandDot: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  brandDotText: { color: '#fff', fontWeight: '900' },
  frame: { borderRadius: radius.lg, padding: 1.2 },
  frameInner: { borderRadius: radius.lg - 1, backgroundColor: colors.surface, overflow: 'hidden' },
});
