import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useI18n } from '../lib/useI18n';

const PERK_KEYS = [
  { emoji: '❤️', labelKey: 'perk_unlimited_label', subKey: 'perk_unlimited_sub' },
  { emoji: '🧊', labelKey: 'perk_freeze_label', subKey: 'perk_freeze_sub' },
  { emoji: '⚡', labelKey: 'perk_ai_label', subKey: 'perk_ai_sub' },
  { emoji: '🗺️', labelKey: 'perk_map_label', subKey: 'perk_map_sub' },
] as const;

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
}

export function PaywallModal({ visible, onClose }: PaywallModalProps) {
  const { t } = useI18n();
  const router = useRouter();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {/* Pill */}
          <View style={styles.pill} />

          {/* Header */}
          <Text style={styles.emoji}>✨</Text>
          <Text style={styles.title}>{t('paywall_title')}</Text>
          <Text style={styles.subtitle}>{t('paywall_subtitle')}</Text>

          {/* Perks */}
          <View style={styles.perks}>
            {PERK_KEYS.map((p) => (
              <View key={p.labelKey} style={styles.perk}>
                <Text style={styles.perkEmoji}>{p.emoji}</Text>
                <View style={styles.perkText}>
                  <Text style={styles.perkLabel}>{t(p.labelKey)}</Text>
                  <Text style={styles.perkSub}>{t(p.subKey)}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* CTA */}
          <Pressable
            style={styles.cta}
            onPress={() => { onClose(); router.push('/plus'); }}
          >
            <Text style={styles.ctaText}>{t('paywall_cta')}</Text>
          </Pressable>

          <Pressable style={styles.dismiss} onPress={onClose}>
            <Text style={styles.dismissText}>{t('free_plan')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
  },
  pill: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    marginBottom: spacing.lg,
  },
  emoji: { fontSize: 40, marginBottom: spacing.sm },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  perks: { width: '100%', gap: spacing.md, marginBottom: spacing.lg },
  perk: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  perkEmoji: { fontSize: 24 },
  perkText: { flex: 1 },
  perkLabel: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  perkSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  cta: {
    width: '100%',
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  ctaText: { ...typography.heading, color: '#fff' },
  dismiss: { paddingVertical: spacing.sm },
  dismissText: { ...typography.caption, color: colors.textMuted },
});
