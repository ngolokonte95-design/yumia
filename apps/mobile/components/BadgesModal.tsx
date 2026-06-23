/**
 * BadgesModal — galerie complète des badges YUMIA.
 * Badges gagnés en pleine lumière ; badges verrouillés grisés avec condition.
 */
import { Modal, View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { BADGES, BADGE_META } from '@yumia/shared';
import { colors, radius, spacing, typography } from '../theme/tokens';

interface Props {
  visible: boolean;
  onClose: () => void;
  earned: string[];
}

export function BadgesModal({ visible, onClose, earned }: Props) {
  const earnedSet = new Set(earned);
  const earnedBadges = BADGES.filter((b) => earnedSet.has(b));
  const lockedBadges = BADGES.filter((b) => !earnedSet.has(b));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>🏅 Tes badges</Text>
        <Text style={styles.subtitle}>
          {earned.length} / {BADGES.length} débloqués
        </Text>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.grid}>
          {earnedBadges.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>Obtenus</Text>
              <View style={styles.badgeGrid}>
                {earnedBadges.map((b) => {
                  const meta = BADGE_META[b];
                  return (
                    <View key={b} style={[styles.badge, styles.badgeEarned]}>
                      <Text style={styles.badgeEmoji}>{meta.emoji}</Text>
                      <Text style={styles.badgeName}>{meta.nameFr}</Text>
                      <Text style={styles.badgeCond}>{meta.conditionFr}</Text>
                    </View>
                  );
                })}
              </View>
            </>
          ) : null}

          {lockedBadges.length > 0 ? (
            <>
              <Text style={[styles.sectionLabel, { marginTop: spacing.md }]}>À débloquer</Text>
              <View style={styles.badgeGrid}>
                {lockedBadges.map((b) => {
                  const meta = BADGE_META[b];
                  return (
                    <View key={b} style={[styles.badge, styles.badgeLocked]}>
                      <Text style={[styles.badgeEmoji, styles.lockedEmoji]}>{meta.emoji}</Text>
                      <Text style={[styles.badgeName, styles.lockedText]}>{meta.nameFr}</Text>
                      <Text style={[styles.badgeCond, styles.lockedCond]}>{meta.conditionFr}</Text>
                    </View>
                  );
                })}
              </View>
            </>
          ) : null}
        </ScrollView>

        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>Fermer</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    maxHeight: '85%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'center' },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: spacing.md,
  },

  grid: { paddingBottom: spacing.xl },
  sectionLabel: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  badge: {
    width: '30%',
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
  },
  badgeEarned: {
    backgroundColor: `${colors.warning}14`,
    borderColor: colors.warning,
  },
  badgeLocked: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  badgeEmoji: { fontSize: 28 },
  lockedEmoji: { opacity: 0.35 },
  badgeName: { ...typography.label, color: colors.textPrimary, textAlign: 'center' },
  lockedText: { color: colors.textMuted },
  badgeCond: {
    ...typography.label,
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 9,
    lineHeight: 13,
  },
  lockedCond: { color: colors.textMuted },

  closeBtn: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  closeBtnText: { ...typography.body, color: colors.textSecondary },
});
