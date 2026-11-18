/**
 * Briques visuelles du Calendrier et du Bloc-notes — DA du 18/11/2026.
 *
 * Même univers que l'Accueil : fond spatial (SpaceBackground), verre sombre,
 * titres en blanc cristal. Une seule couleur d'accent, le dégradé de marque,
 * réservée à l'essentiel : le jour choisi, le bouton d'ajout, la progression.
 * Les choix (catégorie, durée, onglet…) sont sertis de cristal, sans couleur.
 * Aucun voile en dégradé linéaire vers le fond (ils dessinaient une « barre
 * grise ») : les seuls halos sont RADIAUX (SVG) et s'éteignent en cercle.
 *
 * Purement visuel : ces briques ne font aucun appel réseau.
 */
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { ZoomIn } from 'react-native-reanimated';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { CrystalFill, GradientText, PressableScale } from '../ui';
import { GLASS } from '../profile/ProfileChrome';
import { colors, gradients, radius, spacing, typography } from '../../theme/tokens';
import { haptics } from '../../lib/useHaptics';

export { GLASS };

// ── Titres ──────────────────────────────────────────────────────────────────

/** Grand titre en blanc cristal, avec une ligne d'appoint discrète dessous. */
export function CrystalTitle({ title, subtitle, style, center = false }: {
  title: string;
  subtitle?: string;
  style?: StyleProp<TextStyle>;
  center?: boolean;
}) {
  return (
    <View style={[center && styles.center]}>
      <GradientText style={[styles.heroTitle, style]} colors={gradients.crystal} numberOfLines={1}>{title}</GradientText>
      {subtitle ? <Text style={[styles.heroSub, center && styles.textCenter]} numberOfLines={1}>{subtitle}</Text> : null}
    </View>
  );
}

// ── Pastilles ───────────────────────────────────────────────────────────────

/** Pastille de choix : verre au repos, sertie de cristal quand elle est choisie. */
export function CrystalChip({ label, active, onPress, style }: {
  label: string;
  active: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      style={[styles.chip, GLASS, active && styles.chipOn, style]}
      onPress={() => { if (!active) haptics.select(); onPress(); }}
      scaleTo={0.94}
    >
      {active ? <CrystalFill edge={1} /> : null}
      <Text style={[styles.chipText, active && styles.chipTextOn]} numberOfLines={1}>{label}</Text>
    </PressableScale>
  );
}

/** Petite pastille vitrée (raccourci, « Aujourd'hui »…). */
export function GlassChipButton({ label, onPress, style }: {
  label: string; onPress: () => void; style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale style={[styles.glassChip, GLASS, style]} onPress={() => { haptics.select(); onPress(); }} scaleTo={0.94} hitSlop={6}>
      <Text style={styles.glassChipText} numberOfLines={1}>{label}</Text>
    </PressableScale>
  );
}

// ── Boutons de marque ───────────────────────────────────────────────────────

/** Bouton pastille au dégradé de marque (OK, créer…). */
export function BrandPill({ label, onPress, disabled = false, style }: {
  label: string; onPress: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      style={[styles.brandPill, disabled && styles.disabled, style]}
      onPress={() => { haptics.light(); onPress(); }}
      disabled={disabled}
      scaleTo={0.94}
      hitSlop={8}
    >
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={gradients.glassSheen} style={StyleSheet.absoluteFill} />
      <Text style={styles.brandPillText} numberOfLines={1}>{label}</Text>
    </PressableScale>
  );
}

/** Bouton flottant « + » au dégradé de marque, en bas de l'écran. */
export function BrandFab({ onPress, bottom, accessibilityLabel }: {
  onPress: () => void; bottom: number; accessibilityLabel: string;
}) {
  return (
    <Animated.View entering={ZoomIn.delay(250).duration(420)} style={[styles.fabWrap, { bottom }]}>
      <PressableScale
        style={styles.fab}
        onPress={() => { haptics.light(); onPress(); }}
        scaleTo={0.9}
      >
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={gradients.glassSheen} style={StyleSheet.absoluteFill} />
        <Text style={styles.fabPlus} accessibilityLabel={accessibilityLabel} accessibilityRole="button">＋</Text>
      </PressableScale>
    </Animated.View>
  );
}

// ── Case à cocher ronde ─────────────────────────────────────────────────────

/** Case ronde : anneau fin à faire, disque blanc coché une fois fait. */
export function CheckDot({ done, size = 22 }: { done: boolean; size?: number }) {
  return (
    <View style={[styles.check, { width: size, height: size, borderRadius: size / 2 }, done && styles.checkDone]}>
      {done ? <Text style={[styles.checkMark, { fontSize: size * 0.6 }]}>✓</Text> : null}
    </View>
  );
}

// ── Barre de progression ────────────────────────────────────────────────────

/** Fine barre de progression au dégradé de marque (0 → 1). */
export function BrandProgress({ value, style }: { value: number; style?: StyleProp<ViewStyle> }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={[styles.progressTrack, style]}>
      {pct > 0 ? (
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.progressFill, { width: `${pct * 100}%` }]}
        />
      ) : null}
    </View>
  );
}

// ── État vide ───────────────────────────────────────────────────────────────

/** Médaillon vitré, texte, et une ou deux actions. */
export function PlannerEmpty({ emoji, text, children }: { emoji: string; text: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Animated.View entering={ZoomIn.duration(520)} style={[styles.emptyMedal, GLASS]}>
        <Text style={styles.emptyEmoji}>{emoji}</Text>
      </Animated.View>
      <Text style={styles.emptyText}>{text}</Text>
      {children ? <View style={styles.emptyActions}>{children}</View> : null}
    </View>
  );
}

// ── Feuille du bas ──────────────────────────────────────────────────────────

/**
 * Feuille modale sombre : poignée, éclat cristal radial très léger en haut
 * (un ovale qui s'éteint, pas une bande), contenu libre.
 */
export function GlassSheet({ visible, onClose, children }: {
  visible: boolean; onClose: () => void; children: ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.backdrop}>
        <View style={styles.sheet}>
          <View pointerEvents="none" style={styles.sheetGlow}>
            <Svg width="100%" height="100%" viewBox="0 0 400 160" preserveAspectRatio="none">
              <Defs>
                <RadialGradient id="plannerSheetGlow" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor="#DCE4F0" stopOpacity="0.10" />
                  <Stop offset="1" stopColor="#DCE4F0" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Ellipse cx="200" cy="0" rx="200" ry="160" fill="url(#plannerSheetGlow)" />
            </Svg>
          </View>
          <View style={styles.handle} />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** En-tête de feuille : action de gauche (texte), centre libre, OK de marque. */
export function SheetHeader({ leftLabel, onLeft, center, okLabel = 'OK', onOk, okDisabled }: {
  leftLabel: string;
  onLeft: () => void;
  center: ReactNode;
  okLabel?: string;
  onOk: () => void;
  okDisabled?: boolean;
}) {
  return (
    <View style={styles.sheetHeader}>
      <PressableScale onPress={onLeft} hitSlop={10} style={styles.sheetSide}>
        <Text style={styles.sheetLeft} numberOfLines={1}>{leftLabel}</Text>
      </PressableScale>
      <View style={styles.sheetCenter}>{center}</View>
      <View style={[styles.sheetSide, styles.sheetSideEnd]}>
        <BrandPill label={okLabel} onPress={onOk} disabled={okDisabled} />
      </View>
    </View>
  );
}

/** Libellé de champ en petites capitales espacées. */
export function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
  textCenter: { textAlign: 'center' },
  heroTitle: { fontSize: 34, fontWeight: '900', letterSpacing: -0.8, color: '#fff' },
  heroSub: { ...typography.caption, color: colors.textMuted, fontWeight: '700', letterSpacing: 0.4, marginTop: 2 },

  chip: {
    height: 38, paddingHorizontal: 15, borderRadius: radius.pill, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  chipOn: { borderColor: 'transparent' },
  chipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  chipTextOn: { color: '#FFFFFF', fontWeight: '800' },

  glassChip: {
    height: 34, paddingHorizontal: 14, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  glassChipText: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },

  brandPill: {
    height: 36, minWidth: 58, paddingHorizontal: 16, borderRadius: radius.pill, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  brandPillText: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 0.3 },
  disabled: { opacity: 0.35 },

  fabWrap: {
    position: 'absolute', end: 20,
    shadowColor: colors.brand, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
    elevation: 10, borderRadius: 30,
  },
  fab: { width: 60, height: 60, borderRadius: 30, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  fabPlus: { color: '#fff', fontSize: 28, fontWeight: '700', marginTop: -2 },

  check: {
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  checkDone: { backgroundColor: '#F4F7FB', borderColor: '#F4F7FB' },
  checkMark: { color: colors.bg, fontWeight: '900', marginTop: -1 },

  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.10)' },
  progressFill: { height: '100%', borderRadius: 2 },

  empty: { alignItems: 'center', paddingTop: spacing.xl, paddingHorizontal: spacing.lg, gap: spacing.md },
  emptyMedal: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  emptyEmoji: { fontSize: 38 },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  emptyActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0B0B12', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: spacing.md, paddingTop: spacing.sm, maxHeight: '92%', overflow: 'hidden',
  },
  sheetGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 160 },
  handle: {
    width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.28)',
    alignSelf: 'center', marginBottom: spacing.sm,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingBottom: spacing.sm, gap: spacing.sm },
  sheetSide: { width: 76 },
  sheetSideEnd: { alignItems: 'flex-end' },
  sheetCenter: { flex: 1, alignItems: 'center' },
  sheetLeft: { ...typography.body, color: colors.textMuted, fontWeight: '600' },

  fieldLabel: {
    color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
});
