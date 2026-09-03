/**
 * YUMIA PLUS/GOLD/DIAMOND — écran d'abonnement.
 * Trois paliers payants (Plus/Gold/Diamond), un seul prix mensuel chacun pour
 * l'instant (pas d'annuel — à ajouter plus tard si besoin). Achats via
 * RevenueCat (react-native-purchases).
 *
 * Prix et avantages listés ci-dessous sont PROVISOIRES — restrictions
 * définitives par palier pas encore arrêtées (cf. gamification.ts,
 * PLAN_LIMITS, seul endroit à ajuster ensuite).
 */
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { PurchasesOfferings } from 'react-native-purchases';
import { PLAN_PRICE_EUR, type Plan } from '@yumia/shared';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { buyPackage, fetchOfferings, packageForTier, restorePurchases } from '../lib/purchases';
import { PlanBadgeIcon } from '../components/Avatar';
import { useI18n } from '../lib/useI18n';
import type { TranslationKey } from '../lib/translations';

type PaidTier = 'plus' | 'gold' | 'diamond';

const FEATURES: { emoji: string; titleKey: TranslationKey; descKey: TranslationKey }[] = [
  { emoji: '🧊', titleKey: 'plus_feat_streak_title', descKey: 'plus_feat_streak_desc' },
  { emoji: '🔥', titleKey: 'plus_feat_trends_title', descKey: 'plus_feat_trends_desc' },
  { emoji: '❤️‍🔥', titleKey: 'plus_feat_compat_title', descKey: 'plus_feat_compat_desc' },
  { emoji: '🗺️', titleKey: 'plus_feat_map_title', descKey: 'plus_feat_map_desc' },
  { emoji: '📊', titleKey: 'plus_feat_stats_title', descKey: 'plus_feat_stats_desc' },
  { emoji: '🤖', titleKey: 'plus_feat_ai_title', descKey: 'plus_feat_ai_desc' },
  { emoji: '🎭', titleKey: 'plus_feat_modes_title', descKey: 'plus_feat_modes_desc' },
  { emoji: '📍', titleKey: 'plus_feat_lists_title', descKey: 'plus_feat_lists_desc' },
];

const TIER_META: Record<PaidTier, { label: string; taglineKey: TranslationKey; badge: PaidTier; popular?: boolean }> = {
  plus: { label: 'YUMIA Plus', taglineKey: 'plus_tier_plus_tagline', badge: 'plus' },
  gold: { label: 'YUMIA Gold', taglineKey: 'plus_tier_gold_tagline', badge: 'gold', popular: true },
  diamond: { label: 'YUMIA Diamond', taglineKey: 'plus_tier_diamond_tagline', badge: 'diamond' },
};

const TIERS: PaidTier[] = ['plus', 'gold', 'diamond'];

export default function PlusScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, reloadUser } = useAuth();
  const { t } = useI18n();
  const [selectedTier, setSelectedTier] = useState<PaidTier>('gold');
  const [loading, setLoading] = useState(false);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);

  const currentPlan = (user?.plan ?? 'free') as Plan;
  const isPaid = currentPlan !== 'free';

  useEffect(() => {
    fetchOfferings().then(setOfferings);
  }, []);

  async function handleRestore() {
    setLoading(true);
    try {
      const hasPaid = await restorePurchases();
      if (hasPaid) {
        await reloadUser();
        Alert.alert(t('plus_restore_success_title'), t('plus_restore_success_body'), [
          { text: t('plus_great'), onPress: () => router.back() },
        ]);
      } else {
        Alert.alert(t('plus_restore_none_title'), t('plus_restore_none_body'));
      }
    } catch {
      Alert.alert(t('plus_error'), t('plus_restore_error'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubscribe() {
    const pkg = packageForTier(offerings, selectedTier);
    if (!pkg) {
      Alert.alert(
        t('plus_coming_soon_title'),
        t('plus_coming_soon_body').replace('{tier}', TIER_META[selectedTier].label),
        [{ text: t('plus_great') }],
      );
      return;
    }
    setLoading(true);
    try {
      await buyPackage(pkg);
      await reloadUser();
      Alert.alert(t('plus_welcome_title').replace('{tier}', TIER_META[selectedTier].label), t('plus_welcome_body'), [
        { text: t('plus_lets_go'), onPress: () => router.back() },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('plus_purchase_cancelled');
      if (!msg.includes('cancelled') && !msg.includes('cancel')) {
        Alert.alert(t('plus_error'), msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[styles.hero, { paddingTop: insets.top + spacing.lg }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.badge}>{t('plus_badge')}</Text>
        <Text style={styles.heroTitle}>{t('plus_hero_title')}</Text>
        <Text style={styles.heroSub}>
          {t('plus_hero_sub')}
        </Text>
      </View>

      {/* Fonctionnalités communes aux 3 paliers */}
      <View style={styles.featuresGrid}>
        {FEATURES.map((f) => (
          <View key={f.titleKey} style={styles.featureCard}>
            <Text style={styles.featureEmoji}>{f.emoji}</Text>
            <Text style={styles.featureTitle}>{t(f.titleKey)}</Text>
            <Text style={styles.featureDesc}>{t(f.descKey)}</Text>
          </View>
        ))}
      </View>

      {/* Sélection du palier */}
      {!isPaid ? (
        <View style={styles.pricingSection}>
          <Text style={styles.pricingTitle}>{t('plus_choose_plan')}</Text>

          <View style={styles.plans}>
            {TIERS.map((tier) => {
              const meta = TIER_META[tier];
              const isSelected = selectedTier === tier;
              const pkg = packageForTier(offerings, tier);
              const priceStr = pkg?.product.priceString ?? `${PLAN_PRICE_EUR[tier].toFixed(2).replace('.', ',')} €`;
              return (
                <Pressable
                  key={tier}
                  style={[styles.planCard, isSelected && styles.planCardSelected]}
                  onPress={() => setSelectedTier(tier)}
                >
                  {meta.popular ? (
                    <View style={styles.saveBadge}>
                      <Text style={styles.saveBadgeText}>{t('plus_most_popular')}</Text>
                    </View>
                  ) : null}
                  <View style={[styles.planRadio, isSelected && styles.planRadioSelected]}>
                    {isSelected ? <View style={styles.planRadioDot} /> : null}
                  </View>
                  <PlanBadgeIcon plan={meta.badge} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.planLabel, isSelected && styles.planLabelSelected]}>
                      {meta.label}
                    </Text>
                    <Text style={styles.planTagline} numberOfLines={2}>{t(meta.taglineKey)}</Text>
                  </View>
                  <Text style={[styles.planPrice, isSelected && styles.planPriceSelected]}>
                    {priceStr}{'\n'}<Text style={styles.planPer}>{t('plus_per_month')}</Text>
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={[styles.ctaBtn, loading && styles.ctaDisabled]}
            onPress={handleSubscribe}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>{t('plus_cta_start').replace('{tier}', TIER_META[selectedTier].label)}</Text>
            )}
          </Pressable>

          <Text style={styles.legal}>
            {t('plus_legal')}
          </Text>

          <Pressable onPress={handleRestore} disabled={loading} style={styles.restoreBtn}>
            <Text style={styles.restoreText}>{t('plus_restore_purchases')}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.alreadyPlusBox}>
          <PlanBadgeIcon plan={currentPlan as PaidTier} size={48} />
          <Text style={styles.alreadyPlusTitle}>
            {t('plus_already_title').replace('{tier}', TIER_META[currentPlan as PaidTier]?.label ?? t('plus_already_subscriber'))}
          </Text>
          <Text style={styles.alreadyPlusSub}>{t('plus_already_sub')}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  hero: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  backBtn: { position: 'absolute', left: spacing.md, top: undefined, alignSelf: 'flex-start' },
  backText: { ...typography.heading, color: colors.brandSoft, fontSize: 22, padding: spacing.sm },
  badge: {
    ...typography.label,
    color: '#FFD700',
    backgroundColor: 'rgba(255,215,0,0.12)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    overflow: 'hidden',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    letterSpacing: 2,
  },
  heroTitle: {
    ...typography.display,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  heroSub: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.md,
    gap: spacing.sm,
  },
  featureCard: {
    width: '47%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  featureEmoji: { fontSize: 22 },
  featureTitle: { ...typography.heading, color: colors.textPrimary, fontSize: 13 },
  featureDesc: { ...typography.caption, color: colors.textMuted, lineHeight: 16 },

  pricingSection: { padding: spacing.lg, gap: spacing.md },
  pricingTitle: { ...typography.heading, color: colors.textPrimary },

  plans: { gap: spacing.sm },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    position: 'relative',
  },
  planCardSelected: {
    borderColor: colors.brand,
    backgroundColor: `${colors.brand}0D`,
  },
  saveBadge: {
    position: 'absolute',
    top: -10,
    right: spacing.md,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  saveBadgeText: { ...typography.label, color: '#fff', fontSize: 10 },
  planRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planRadioSelected: { borderColor: colors.brand },
  planRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
  planLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  planLabelSelected: { color: colors.brand },
  planTagline: { ...typography.label, color: colors.textMuted, marginTop: 2 },
  planPrice: { ...typography.heading, color: colors.textPrimary, textAlign: 'right', fontSize: 15 },
  planPriceSelected: { color: colors.brandSoft },
  planPer: { ...typography.caption, color: colors.textMuted },

  ctaBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { ...typography.heading, color: '#fff', fontSize: 16 },
  legal: {
    ...typography.label,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: spacing.sm,
  },

  restoreBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  restoreText: {
    ...typography.caption,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },

  alreadyPlusBox: {
    margin: spacing.lg,
    backgroundColor: `${colors.success}12`,
    borderWidth: 1,
    borderColor: `${colors.success}40`,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  alreadyPlusTitle: { ...typography.title, color: colors.textPrimary },
  alreadyPlusSub: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
