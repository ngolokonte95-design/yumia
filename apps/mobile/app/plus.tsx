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

type PaidTier = 'plus' | 'gold' | 'diamond';

const FEATURES = [
  { emoji: '🧊', title: 'Freeze de streak', desc: 'Conserve ton streak même si tu rates un jour.' },
  { emoji: '🔥', title: 'Tendances en avant-première', desc: 'Accède aux lieux tendance 24h avant tout le monde.' },
  { emoji: '❤️‍🔥', title: 'Compatibilité illimitée', desc: 'Scores de compatibilité pour tous les lieux, pas seulement le Top 3.' },
  { emoji: '🗺️', title: 'Carte premium', desc: 'Carte heatmap de tes univers préférés autour de toi.' },
  { emoji: '📊', title: 'Stats avancées', desc: 'Analyse détaillée de ton Passeport : dépenses, univers, XP.' },
  { emoji: '🤖', title: 'IA sans limite', desc: 'Mini-chat IA illimité sur chaque lieu — pas de quota journalier.' },
  { emoji: '🎭', title: 'Modes exclusifs', desc: 'Accès au mode Solo romantique et surprise de luxe.' },
  { emoji: '📍', title: 'Listes illimitées', desc: 'Crée autant de listes de lieux sauvegardés que tu veux.' },
];

const TIER_META: Record<PaidTier, { label: string; tagline: string; badge: PaidTier; popular?: boolean }> = {
  plus: { label: 'YUMIA Plus', tagline: 'Débloque toutes les fonctionnalités, limites modérées.', badge: 'plus' },
  gold: { label: 'YUMIA Gold', tagline: 'Limites bien plus hautes, pour les explorateurs assidus.', badge: 'gold', popular: true },
  diamond: { label: 'YUMIA Diamond', tagline: 'Aucune limite, l\'expérience YUMIA sans compromis.', badge: 'diamond' },
};

const TIERS: PaidTier[] = ['plus', 'gold', 'diamond'];

export default function PlusScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, reloadUser } = useAuth();
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
        Alert.alert('Abonnement restauré !', 'Ton abonnement YUMIA est maintenant actif sur ce compte.', [
          { text: 'Super !', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Aucun achat trouvé', 'Aucun abonnement YUMIA actif n\'a été trouvé pour ce compte.');
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de restaurer les achats. Réessaie plus tard.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubscribe() {
    const pkg = packageForTier(offerings, selectedTier);
    if (!pkg) {
      Alert.alert(
        '🚀 Bientôt disponible !',
        `YUMIA ${TIER_META[selectedTier].label} arrive très bientôt. Tu seras notifié dès le lancement.`,
        [{ text: 'Super !' }],
      );
      return;
    }
    setLoading(true);
    try {
      await buyPackage(pkg);
      await reloadUser();
      Alert.alert(`Bienvenue dans ${TIER_META[selectedTier].label} !`, 'Ton abonnement est maintenant actif.', [
        { text: "C'est parti !", onPress: () => router.back() },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Achat annulé.';
      if (!msg.includes('cancelled') && !msg.includes('cancel')) {
        Alert.alert('Erreur', msg);
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
        <Text style={styles.badge}>✨ YUMIA+</Text>
        <Text style={styles.heroTitle}>Passe à l'expérience{'\n'}complète</Text>
        <Text style={styles.heroSub}>
          Débloque tout le potentiel de YUMIA pour explorer sans limites.
        </Text>
      </View>

      {/* Fonctionnalités communes aux 3 paliers */}
      <View style={styles.featuresGrid}>
        {FEATURES.map((f) => (
          <View key={f.title} style={styles.featureCard}>
            <Text style={styles.featureEmoji}>{f.emoji}</Text>
            <Text style={styles.featureTitle}>{f.title}</Text>
            <Text style={styles.featureDesc}>{f.desc}</Text>
          </View>
        ))}
      </View>

      {/* Sélection du palier */}
      {!isPaid ? (
        <View style={styles.pricingSection}>
          <Text style={styles.pricingTitle}>Choisis ta formule</Text>

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
                      <Text style={styles.saveBadgeText}>PLUS POPULAIRE</Text>
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
                    <Text style={styles.planTagline} numberOfLines={2}>{meta.tagline}</Text>
                  </View>
                  <Text style={[styles.planPrice, isSelected && styles.planPriceSelected]}>
                    {priceStr}{'\n'}<Text style={styles.planPer}>/mois</Text>
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
              <Text style={styles.ctaText}>✨ Commencer {TIER_META[selectedTier].label}</Text>
            )}
          </Pressable>

          <Text style={styles.legal}>
            Résiliation possible à tout moment depuis les paramètres de ton compte.
            Prix affichés TTC. Facturation via l'App Store / Google Play.
          </Text>

          <Pressable onPress={handleRestore} disabled={loading} style={styles.restoreBtn}>
            <Text style={styles.restoreText}>Restaurer les achats</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.alreadyPlusBox}>
          <PlanBadgeIcon plan={currentPlan as PaidTier} size={48} />
          <Text style={styles.alreadyPlusTitle}>
            Tu es déjà {TIER_META[currentPlan as PaidTier]?.label ?? 'abonné'} !
          </Text>
          <Text style={styles.alreadyPlusSub}>Toutes les fonctionnalités premium de ton palier sont actives.</Text>
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
