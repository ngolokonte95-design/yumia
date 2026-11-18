/**
 * Briques visuelles de la priorité B (sortie de groupe, session de vote,
 * boîtes de nuit, carte du monde, location de voiture) — 18/11/2026.
 *
 * Consigne de l'utilisateur : « spectaculaire mais éviter trop de couleur, il
 * faut que ça reste simple ». Donc ici TOUT est neutre (verre sombre, blanc,
 * gris) : le dégradé de marque n'apparaît que là où l'écran l'importe
 * lui-même (bouton principal de SocialChrome, trait de l'onglet actif).
 * Aucun voile en dégradé linéaire vers le fond.
 */
import type { ReactNode } from 'react';
import { I18nManager, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, spacing } from '../../theme/tokens';
import { PressableScale } from '../ui';
import { haptics } from '../../lib/useHaptics';

/** Flèche de retour et chevron qui suivent le sens de lecture. */
export const PB_BACK = I18nManager.isRTL ? '→' : '←';
export const PB_CHEVRON = I18nManager.isRTL ? '‹' : '›';

/** Verre sombre sobre (cartes, champs). */
export const PB_GLASS: ViewStyle = {
  backgroundColor: 'rgba(31,31,42,0.62)',
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: 'rgba(255,255,255,0.11)',
};

/** Sépare un emoji de tête du reste d'un libellé (« 👥 Sortie » → 👥 + Sortie). */
export function splitEmoji(s: string): { emoji: string | null; text: string } {
  const m = s.match(/^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*(.*)$/u);
  return m && m[2] ? { emoji: m[1], text: m[2] } : { emoji: null, text: s };
}

/** Bouton rond en verre (retour, action d'en-tête). */
export function PbCircle({ label, onPress, size = 42, style }: {
  label: string; onPress: () => void; size?: number; style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.88}
      hitSlop={8}
      style={[styles.circle, PB_GLASS, { width: size, height: size, borderRadius: size / 2 }, style]}
    >
      <Text style={styles.circleText}>{label}</Text>
    </PressableScale>
  );
}

/**
 * En-tête : retour en verre, emoji du titre dans un médaillon de verre, titre
 * blanc fort, sous-titre discret. Aucune couleur.
 */
export function PbHeader({ title, subtitle, onBack, right, style }: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { emoji, text } = splitEmoji(title);
  return (
    <View style={[styles.header, style]}>
      <PbCircle label={PB_BACK} onPress={onBack} />
      {emoji ? (
        <View style={[styles.headerMedal, PB_GLASS]}>
          <Text style={styles.headerMedalEmoji}>{emoji}</Text>
        </View>
      ) : null}
      <View style={styles.headerText}>
        <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{text}</Text>
        {subtitle ? <Text style={styles.headerSub} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/**
 * Onglets en segment : l'actif en blanc gras avec un petit trait au dégradé de
 * marque — le seul accent de couleur des onglets.
 */
export function PbTabs<K extends string>({ tabs, value, onChange }: {
  tabs: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <View style={[styles.tabs, PB_GLASS]}>
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <PressableScale
            key={tab.key}
            style={[styles.tab, active && styles.tabActive]}
            scaleTo={0.97}
            onPress={() => { if (!active) haptics.select(); onChange(tab.key); }}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>{tab.label}</Text>
            {active ? (
              <LinearGradient
                colors={gradients.brand}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.tabMark}
              />
            ) : null}
          </PressableScale>
        );
      })}
    </View>
  );
}

/**
 * Pastille de choix, sans couleur : au repos en verre, choisie en BLANC plein
 * (texte sombre). `locked` : estompée (palier supérieur).
 */
export function PbChip({ label, emoji, active, locked = false, round = false, onPress }: {
  label: string;
  emoji?: string;
  active: boolean;
  locked?: boolean;
  /** Pastille ronde de 46 px (nombres). */
  round?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.93}
      style={[
        styles.chip, PB_GLASS,
        round && styles.chipRound,
        active && styles.chipActive,
        locked && styles.chipLocked,
      ]}
    >
      {emoji ? <Text style={styles.chipEmoji}>{emoji}</Text> : null}
      <Text style={[styles.chipText, active && styles.chipTextActive, locked && styles.chipTextLocked]} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** Titre de section en petites capitales espacées (gris). */
export function PbLabel({ label, style }: { label: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.labelRow, style]}>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      <View style={styles.labelRule} />
    </View>
  );
}

/** Bouton secondaire neutre : pastille blanche (texte sombre) ou verre. */
export function PbButton({ label, onPress, disabled, variant = 'white', compact = false, style, children }: {
  label?: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'white' | 'glass';
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Contenu libre à la place du libellé (indicateur de chargement…). */
  children?: ReactNode;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.95}
      style={[
        styles.btn,
        compact && styles.btnCompact,
        variant === 'white' ? styles.btnWhite : PB_GLASS,
        disabled && { opacity: 0.45 },
        style,
      ]}
    >
      {children ?? (
        <Text style={[styles.btnText, variant === 'white' ? styles.btnTextDark : styles.btnTextLight]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </PressableScale>
  );
}

/** Petite pastille de verre (statut, compteur, métadonnée). */
export function PbPill({ label, dot, style }: { label: string; dot?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.pill, PB_GLASS, style]}>
      {dot ? <View style={[styles.pillDot, { backgroundColor: dot }]} /> : null}
      <Text style={styles.pillText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** État vide sobre : emoji dans un médaillon de verre, titre, texte. */
export function PbEmpty({ emoji, title, text, action }: {
  emoji: string; title: string; text?: string; action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyMedal, PB_GLASS]}>
        <Text style={styles.emptyEmoji}>{emoji}</Text>
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {text ? <Text style={styles.emptyText}>{text}</Text> : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  circleText: { color: colors.textPrimary, fontSize: 18, fontWeight: '700' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
  },
  headerMedal: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerMedalEmoji: { fontSize: 20 },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { color: colors.textPrimary, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  headerSub: { color: colors.textSecondary, fontSize: 13, fontWeight: '500', marginTop: 2, lineHeight: 17 },

  tabs: {
    flexDirection: 'row', marginHorizontal: spacing.md, borderRadius: radius.pill, padding: 4,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 42, borderRadius: radius.pill, paddingHorizontal: spacing.sm },
  tabActive: { backgroundColor: 'rgba(255,255,255,0.08)' },
  tabText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#fff', fontWeight: '900' },
  tabMark: { position: 'absolute', bottom: 5, width: 22, height: 3, borderRadius: 2 },

  chip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 42, paddingHorizontal: spacing.md, borderRadius: radius.pill,
  },
  chipRound: { width: 46, height: 46, paddingHorizontal: 0, borderRadius: 23 },
  chipActive: { backgroundColor: '#fff', borderColor: '#fff' },
  chipLocked: { opacity: 0.45 },
  chipEmoji: { fontSize: 15 },
  chipText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.bg, fontWeight: '900' },
  chipTextLocked: { fontSize: 11 },

  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  label: {
    color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.8,
    textTransform: 'uppercase', flexShrink: 1,
  },
  labelRule: { flex: 1, minWidth: 12, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.14)' },

  btn: {
    height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  btnCompact: { height: 40, paddingHorizontal: spacing.md },
  btnWhite: { backgroundColor: '#fff' },
  btnText: { fontSize: 15, fontWeight: '900', letterSpacing: 0.2 },
  btnTextDark: { color: colors.bg },
  btnTextLight: { color: colors.textPrimary, fontWeight: '800' },

  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill,
  },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 56, paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyMedal: { width: 84, height: 84, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  emptyEmoji: { fontSize: 38 },
  emptyTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '900', textAlign: 'center', letterSpacing: -0.3 },
  emptyText: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 280 },
});
