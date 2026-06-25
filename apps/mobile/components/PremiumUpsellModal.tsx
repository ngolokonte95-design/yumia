import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, typography } from '../theme/tokens';

const PREMIUM_PURPLE = '#7C3AED';

interface Props {
  visible: boolean;
  /** Message contextuel (issu de LIMIT_MESSAGES). */
  message: string;
  onClose: () => void;
}

/**
 * Modal d'upsell affiché quand une limite du forfait Gratuit est atteinte.
 * Bouton principal → écran Premium, bouton secondaire → fermeture.
 */
export function PremiumUpsellModal({ visible, message, onClose }: Props) {
  const router = useRouter();

  function goPremium() {
    onClose();
    // Cast : la route typée /(premium) est régénérée au prochain démarrage Expo.
    router.push('/(premium)' as never);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.crownCircle}>
            <Text style={styles.crown}>👑</Text>
          </View>
          <Text style={styles.title}>Passe en Premium</Text>
          <Text style={styles.message}>{message}</Text>

          <Pressable style={styles.primaryBtn} onPress={goPremium}>
            <Text style={styles.primaryText}>Passer en Premium — 2.99€/mois</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={onClose}>
            <Text style={styles.secondaryText}>Peut-être plus tard</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: PREMIUM_PURPLE,
  },
  crownCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${PREMIUM_PURPLE}22`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crown: { fontSize: 32 },
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'center' },
  message: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  primaryBtn: {
    backgroundColor: PREMIUM_PURPLE,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
  primaryText: { ...typography.body, color: '#fff', fontWeight: '700' },
  secondaryBtn: { paddingVertical: spacing.sm, alignItems: 'center' },
  secondaryText: { ...typography.caption, color: colors.textMuted },
});
