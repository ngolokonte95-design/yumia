import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useI18n } from '../lib/useI18n';
import { PLAN_PRICE_EUR, type Plan } from '@yumia/shared';
import { PlanBadgeIcon } from './Avatar';

const PREMIUM_PURPLE = '#7C3AED';

/** Noms commerciaux — identiques dans toutes les langues. */
const TIER_NAME: Record<Exclude<Plan, 'free'>, string> = {
  plus: 'YUMIA Plus', gold: 'YUMIA Gold', diamond: 'YUMIA Diamond',
};

interface Props {
  visible: boolean;
  /** Message contextuel (issu de LIMIT_MESSAGES). */
  message: string;
  onClose: () => void;
  /**
   * Appelé quand l'utilisateur DÉCLINE (« peut-être plus tard », ou tap hors
   * de la fenêtre) — jamais quand il part vers l'écran d'abonnement.
   *
   * Séparé d'`onClose` parce que l'écran d'un rayon épuisé n'a plus rien à
   * montrer derrière : il en profite pour ramener à l'accueil. Le faire
   * depuis `onClose` aurait aussi navigué au moment de partir vers les
   * forfaits, deux navigations dans le même instant.
   */
  onDismiss?: () => void;
  /**
   * Palier proposé. Son étoile accompagne le prix : un tarif sans emblème
   * n'apprend pas ce qu'on achète, et l'app affiche déjà ces étoiles sur les
   * profils — c'est le même langage d'un bout à l'autre.
   */
  plan?: Plan;
}

/**
 * Modal d'upsell affiché quand une limite du forfait Gratuit est atteinte.
 * Bouton principal → écran Premium, bouton secondaire → fermeture.
 */
export function PremiumUpsellModal({ visible, message, onClose, onDismiss, plan = 'plus' }: Props) {
  const router = useRouter();
  const { t } = useI18n();

  function goPremium() {
    onClose();
    // Cast : la route typée /(premium) est régénérée au prochain démarrage Expo.
    router.push('/plus' as never);
  }

  function dismiss() {
    onClose();
    onDismiss?.();
  }

  /** Les trois paliers payants, du moins cher au plus cher. */
  const tiers: Exclude<Plan, 'free'>[] = ['plus', 'gold', 'diamond'];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <Pressable style={styles.overlay} onPress={dismiss}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.crownCircle}>
            <PlanBadgeIcon plan={plan} size={36} />
          </View>
          <Text style={styles.title}>{t('pu_title')}</Text>
          <Text style={styles.message}>{message}</Text>

          {/* Les trois paliers, pas seulement le moins cher : le message
              annonce un prix « à partir de », et quelqu'un qui accepte de
              payer a le droit de voir tout de suite ce que valent les
              autres. Chaque ligne porte son étoile à côté de son prix — la
              même que celle affichée sur les profils. */}
          <View style={styles.tiers}>
            {tiers.map((tier) => (
              <Pressable key={tier} style={[styles.tierRow, tier === plan && styles.tierRowHighlight]} onPress={goPremium}>
                <PlanBadgeIcon plan={tier} size={26} />
                <Text style={styles.tierName}>{TIER_NAME[tier]}</Text>
                <Text style={styles.tierPrice}>
                  {PLAN_PRICE_EUR[tier].toFixed(2).replace('.', ',')} €
                  <Text style={styles.tierPer}>{t('plus_per_month')}</Text>
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.secondaryBtn} onPress={dismiss}>
            <Text style={styles.secondaryText}>{t('pu_later')}</Text>
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
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'center' },
  message: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  tiers: { alignSelf: 'stretch', gap: spacing.xs },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Le palier qui lève précisément la limite atteinte, mis en avant sans
  // exclure les autres.
  tierRowHighlight: { borderColor: PREMIUM_PURPLE, backgroundColor: `${PREMIUM_PURPLE}14` },
  tierName: { ...typography.label, color: colors.textPrimary, flex: 1 },
  tierPrice: { ...typography.label, color: colors.textPrimary },
  tierPer: { ...typography.caption, color: colors.textSecondary },

  secondaryBtn: { paddingVertical: spacing.sm, alignItems: 'center' },
  secondaryText: { ...typography.caption, color: colors.textMuted },
});
