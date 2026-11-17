/**
 * Badges du Passeport : grille qui se révèle en cascade. Débloqués =
 * médaillon lumineux (dégradé de marque + halo) ; verrouillés = gris avec
 * cadenas. Toucher un badge affiche sa condition d'obtention sous la grille.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition, ZoomIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, elevation, gradients, motion, radius, spacing, typography } from '../../theme/tokens';
import { PressableScale } from '../ui';
import { haptics } from '../../lib/useHaptics';

export interface BadgeItem {
  key: string;
  emoji: string;
  name: string;
  condition: string;
  earned: boolean;
}

export function BadgeGrid({
  badges,
  earnedLabel,
  lockedLabel,
  tapHint,
}: {
  badges: BadgeItem[];
  earnedLabel: string;
  lockedLabel: string;
  tapHint: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const current = badges.find((b) => b.key === selected) ?? null;

  const onPick = (b: BadgeItem) => {
    if (b.earned) haptics.success();
    else haptics.select();
    setSelected((prev) => (prev === b.key ? null : b.key));
  };

  return (
    <Animated.View layout={LinearTransition.duration(motion.duration.normal)}>
      <View style={styles.grid}>
        {badges.map((b, i) => (
          <Animated.View
            key={b.key}
            entering={ZoomIn.duration(motion.duration.normal).delay(i * motion.stagger)}
            style={styles.cell}
          >
            <PressableScale
              style={[
                styles.medal,
                b.earned ? [styles.medalEarned, elevation.glowBrand] : styles.medalLocked,
                selected === b.key && styles.medalSelected,
              ]}
              onPress={() => onPick(b)}
              scaleTo={0.92}
            >
              {b.earned ? (
                <>
                  <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                  <LinearGradient colors={gradients.glassSheen} style={StyleSheet.absoluteFill} />
                </>
              ) : null}
              <Text style={[styles.emoji, !b.earned && styles.emojiLocked]}>{b.emoji}</Text>
              <Text style={[styles.name, b.earned ? styles.nameEarned : styles.nameLocked]} numberOfLines={2}>
                {b.name}
              </Text>
              {!b.earned ? <Text style={styles.lock}>🔒</Text> : null}
            </PressableScale>
          </Animated.View>
        ))}
      </View>

      {current ? (
        <Animated.View key={current.key} entering={FadeIn.duration(motion.duration.fast)} style={styles.detail}>
          <Text style={styles.detailEmoji}>{current.emoji}</Text>
          <View style={styles.detailText}>
            <Text style={styles.detailName}>{current.name}</Text>
            <Text style={styles.detailCond}>{current.condition}</Text>
            <Text style={[styles.detailStatus, current.earned ? styles.statusEarned : styles.statusLocked]}>
              {current.earned ? `✓ ${earnedLabel}` : lockedLabel}
            </Text>
          </View>
        </Animated.View>
      ) : (
        <Text style={styles.hint}>{tapHint}</Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // Pourcentages : 3 colonnes quelle que soit la largeur.
  cell: { width: '31.5%' },
  medal: {
    aspectRatio: 0.95, borderRadius: radius.lg, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6,
  },
  medalEarned: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  medalLocked: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  medalSelected: { borderWidth: 2, borderColor: colors.brandSoft },
  emoji: { fontSize: 34 },
  emojiLocked: { opacity: 0.28 },
  name: { ...typography.label, textAlign: 'center', fontSize: 11 },
  nameEarned: { color: '#fff', fontWeight: '800' },
  nameLocked: { color: colors.textMuted },
  lock: { position: 'absolute', top: 6, right: 8, fontSize: 11, opacity: 0.7 },
  detail: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md,
    backgroundColor: colors.surfaceElevated, borderRadius: radius.lg, padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  detailEmoji: { fontSize: 36 },
  detailText: { flex: 1, gap: 2 },
  detailName: { ...typography.heading, color: colors.textPrimary },
  detailCond: { ...typography.body, color: colors.textSecondary },
  detailStatus: { ...typography.caption, fontWeight: '800', marginTop: 2 },
  statusEarned: { color: colors.success },
  statusLocked: { color: colors.textMuted },
  hint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.md, textAlign: 'center' },
});
