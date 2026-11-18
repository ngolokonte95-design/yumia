/**
 * Briques des petits écrans sociaux (collections, archives, amis proches,
 * demandes d'abonnement, abonnés/abonnements, bloqués, invitation).
 *
 * Consigne de l'utilisateur (18/11/2026) : « spectaculaire mais éviter trop de
 * couleur, il faut que ça reste simple ». Tout est donc en verre sombre et en
 * blanc ; le dégradé de marque n'apparaît que sur LE bouton principal d'un
 * écran, quand il y en a un (voir `BrandButton` de SocialChrome). Aucune
 * animation en boucle, aucun voile dégradé.
 */
import type { ReactNode } from 'react';
import {
  ActivityIndicator, I18nManager, StyleSheet, Text, View, type StyleProp, type ViewStyle,
} from 'react-native';
import { colors, radius, spacing } from '../../theme/tokens';
import { PressableScale, Reveal } from '../ui';
import { Avatar, PlanBadgeIcon } from '../Avatar';
import type { Plan } from '../../lib/feed-api';
import { haptics } from '../../lib/useHaptics';

/** Flèche de retour qui suit le sens de lecture. */
export const BACK = I18nManager.isRTL ? '→' : '←';

/** Verre sombre sobre. */
export const QUIET_GLASS: ViewStyle = {
  backgroundColor: 'rgba(31,31,42,0.66)',
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: 'rgba(255,255,255,0.11)',
};

/** Indicateur de chargement neutre (pas de couleur). */
export const SPINNER_COLOR = 'rgba(255,255,255,0.75)';

/** Bouton rond en verre (retour, action d'en-tête). */
export function RoundGlassButton({
  label, onPress, accessibilityLabel, size = 42,
}: { label: string; onPress: () => void; accessibilityLabel?: string; size?: number }) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.88}
      hitSlop={8}
      style={[styles.round, QUIET_GLASS, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Text style={styles.roundText} accessibilityLabel={accessibilityLabel}>{label}</Text>
    </PressableScale>
  );
}

/** En-tête sobre : retour en verre, titre blanc fort, emplacement à droite. */
export function QuietHeader({
  title, subtitle, onBack, right,
}: { title: string; subtitle?: string; onBack: () => void; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <RoundGlassButton label={BACK} onPress={onBack} />
      <View style={styles.headerText}>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {/* Largeur réservée même vide : le titre ne bouge pas d'un écran à l'autre. */}
      <View style={styles.headerRight}>{right}</View>
    </View>
  );
}

type Tone = 'solid' | 'glass' | 'danger';

/**
 * Bouton d'action en pastille. `solid` = blanc (action positive), `glass` =
 * verre (état acquis / action neutre), `danger` = verre à texte rouge
 * (retirer, refuser, bloquer : rouge fonctionnel, discret).
 */
export function PillButton({
  label, onPress, tone = 'glass', loading = false, style,
}: {
  label: string;
  onPress: () => void;
  tone?: Tone;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  if (loading) {
    return (
      <View style={[styles.pill, styles.pillLoading, style]}>
        <ActivityIndicator size="small" color={SPINNER_COLOR} />
      </View>
    );
  }
  return (
    <PressableScale
      onPress={() => { haptics.select(); onPress(); }}
      scaleTo={0.94}
      hitSlop={6}
      style={[
        styles.pill,
        tone === 'solid' ? styles.pillSolid : QUIET_GLASS,
        tone === 'danger' && styles.pillDanger,
        style,
      ]}
    >
      <Text
        style={[styles.pillText, tone === 'solid' && styles.pillTextSolid, tone === 'danger' && styles.pillTextDanger]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

/**
 * Ligne « personne » en verre : avatar, nom + badge d'abonnement (18 px, taille
 * fixée par l'utilisateur), ligne secondaire, action à droite. Seules les
 * premières lignes apparaissent en cascade (pas d'animation dans le reste de
 * la liste).
 */
export function PersonRow({
  index, uri, name, plan, sub, onPress, action, avatarSize = 48,
}: {
  index: number;
  uri?: string | null;
  name: string;
  plan?: Plan | null;
  sub?: string | null;
  /** Ouvre le profil (avatar et texte). Absent : ligne non cliquable. */
  onPress?: () => void;
  action?: ReactNode;
  avatarSize?: number;
}) {
  const identity = (
    <>
      <Avatar
        uri={uri}
        size={avatarSize}
        placeholderColor={colors.surfaceElevated}
        fallback={<Text style={styles.avatarLetter}>{name[0]?.toUpperCase()}</Text>}
      />
      <View style={styles.personText}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <PlanBadgeIcon plan={plan} size={18} />
        </View>
        {sub ? <Text style={styles.sub} numberOfLines={1}>{sub}</Text> : null}
      </View>
    </>
  );
  const row = (
    <View style={[styles.person, QUIET_GLASS]}>
      {onPress ? (
        <PressableScale style={styles.personMain} onPress={onPress} scaleTo={0.98}>{identity}</PressableScale>
      ) : (
        <View style={styles.personMain}>{identity}</View>
      )}
      {action}
    </View>
  );
  return index < 8 ? <Reveal index={index} from="fade">{row}</Reveal> : row;
}

/** État vide sobre : pictogramme dans un médaillon de verre, titre, texte, action. */
export function QuietEmpty({
  emoji, title, text, action,
}: { emoji: string; title?: string; text?: string; action?: ReactNode }) {
  return (
    <Reveal style={styles.empty}>
      <View style={[styles.emptyMedal, QUIET_GLASS]}>
        <Text style={styles.emptyEmoji}>{emoji}</Text>
      </View>
      {title ? <Text style={styles.emptyTitle}>{title}</Text> : null}
      {text ? <Text style={styles.emptyText}>{text}</Text> : null}
      {action}
    </Reveal>
  );
}

/** Pastille de filtre : blanche quand elle est choisie, en verre sinon. */
export function QuietChip({
  label, active, onPress, onLongPress,
}: { label: string; active: boolean; onPress: () => void; onLongPress?: () => void }) {
  return (
    <PressableScale
      onPress={() => { if (!active) haptics.select(); onPress(); }}
      onLongPress={onLongPress}
      scaleTo={0.94}
      style={[styles.chip, active ? styles.chipActive : QUIET_GLASS]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{label}</Text>
    </PressableScale>
  );
}

/** Onglets en rail de verre : l'onglet actif est une pastille claire, texte blanc gras. */
export function SegmentTabs<K extends string>({
  tabs, active, onChange,
}: { tabs: { key: K; label: string }[]; active: K; onChange: (k: K) => void }) {
  return (
    <View style={[styles.rail, QUIET_GLASS]}>
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <PressableScale
            key={tab.key}
            style={[styles.segment, on && styles.segmentOn]}
            onPress={() => { if (!on) haptics.select(); onChange(tab.key); }}
            scaleTo={0.96}
          >
            <Text style={[styles.segmentText, on && styles.segmentTextOn]} numberOfLines={1}>{tab.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** Compteur discret en petites capitales (« 12 personnes »). */
export function QuietCount({ label }: { label: string }) {
  return <Text style={styles.count}>{label}</Text>;
}

const styles = StyleSheet.create({
  round: { alignItems: 'center', justifyContent: 'center' },
  roundText: { color: '#fff', fontSize: 19, fontWeight: '700' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md,
  },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { color: colors.textPrimary, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  headerSub: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: 1 },
  headerRight: { minWidth: 42, alignItems: 'flex-end' },

  pill: {
    minHeight: 36, minWidth: 84, paddingHorizontal: 16, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  pillLoading: { backgroundColor: 'transparent' },
  pillSolid: { backgroundColor: '#fff' },
  pillDanger: { borderColor: 'rgba(229,72,77,0.38)' },
  pillText: { color: colors.textPrimary, fontSize: 13, fontWeight: '800' },
  pillTextSolid: { color: colors.bg },
  pillTextDanger: { color: colors.danger },

  person: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.md, marginBottom: spacing.sm,
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: radius.lg,
  },
  personMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  personText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { color: colors.textPrimary, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  avatarLetter: { color: colors.textPrimary, fontWeight: '800', fontSize: 18 },

  empty: { alignItems: 'center', paddingTop: 72, paddingHorizontal: 40, gap: spacing.sm },
  emptyMedal: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  emptyEmoji: { fontSize: 36 },
  emptyTitle: { color: colors.textPrimary, fontSize: 19, fontWeight: '900', letterSpacing: -0.3, textAlign: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },

  chip: {
    height: 36, paddingHorizontal: 14, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  chipActive: { backgroundColor: '#fff' },
  chipText: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: colors.bg, fontWeight: '800' },

  rail: { flexDirection: 'row', marginHorizontal: spacing.md, marginBottom: spacing.md, padding: 4, borderRadius: radius.pill },
  segment: { flex: 1, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: 'rgba(255,255,255,0.14)' },
  segmentText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  segmentTextOn: { color: '#fff', fontWeight: '900' },

  count: {
    color: colors.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 1.6,
    textTransform: 'uppercase', paddingHorizontal: spacing.md + 4, paddingBottom: spacing.sm,
  },
});
