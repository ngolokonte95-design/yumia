/**
 * Écran d'abonnement Premium YUMIA.
 * Deux formules (2.99€/mois, 24.99€/an « 2 mois offerts »), liste d'avantages,
 * achat via RevenueCat puis activation serveur (/auth/premium/activate).
 */
import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth-context';
import { fetchOfferings, buyPackage } from '../../lib/purchases';
import { colors, radius, spacing, typography } from '../../theme/tokens';

const PREMIUM_PURPLE = '#7C3AED';

type PlanKey = 'monthly' | 'annual';

const BENEFITS = [
  'Suggestions illimitées',
  'IA Prédictive quotidienne',
  'Alertes tendances en temps réel',
  'IA Sociale — matchs avec des inconnus',
  'Cercle Privé jusqu\'à 20 personnes',
  'Planificateur illimité',
  'Passport illimité',
  'Mode Voyage — villes illimitées',
  'Mode « Je suis là maintenant »',
  'Organisateur d\'événements complet',
  'Accès VIP clubs en avant-première',
  'Expériences exclusives YUMIA',
  'Recommandations randonnées premium (itinéraires détaillés)',
];

export default function PremiumScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activatePremium } = useAuth();
  const [selected, setSelected] = useState<PlanKey>('annual');
  const [loading, setLoading] = useState(false);

  async function handleStart() {
    setLoading(true);
    try {
      // 1) Achat via RevenueCat (si configuré).
      const offerings = await fetchOfferings();
      const pkg =
        selected === 'annual'
          ? offerings?.current?.annual ?? null
          : offerings?.current?.monthly ?? null;

      if (pkg) {
        const result = await buyPackage(pkg);
        if (!result) {
          setLoading(false);
          return; // achat annulé / échoué
        }
      }
      // 2) Si RevenueCat n'est pas encore configuré (offerings null), on active
      //    quand même pour permettre les tests. En prod, `pkg` existe → achat réel.

      // 3) Activation côté serveur.
      await activatePremium(selected);
      Alert.alert('Bienvenue 👑', 'Ton abonnement Premium est actif !');
      router.back();
    } catch (err) {
      Alert.alert('Oups', (err as Error).message || 'Achat impossible pour le moment.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 140 }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>

        <View style={styles.crownCircle}><Text style={styles.crown}>👑</Text></View>
        <Text style={styles.title}>YUMIA Premium</Text>
        <Text style={styles.subtitle}>Débloque toute la puissance de YUMIA.</Text>

        {/* Sélecteur de formule */}
        <View style={styles.plans}>
          <PlanCard
            label="Mensuel"
            price="2.99€"
            period="/mois"
            active={selected === 'monthly'}
            onPress={() => setSelected('monthly')}
          />
          <PlanCard
            label="Annuel"
            price="24.99€"
            period="/an"
            badge="2 mois offerts"
            active={selected === 'annual'}
            onPress={() => setSelected('annual')}
          />
        </View>

        {/* Avantages */}
        <View style={styles.benefits}>
          {BENEFITS.map((b) => (
            <View key={b} style={styles.benefitRow}>
              <Text style={styles.check}>✓</Text>
              <Text style={styles.benefitText}>{b}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* CTA fixe en bas */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable style={[styles.cta, loading && styles.ctaDisabled]} onPress={handleStart} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaText}>
              Commencer — {selected === 'annual' ? '24.99€/an' : '2.99€/mois'}
            </Text>
          )}
        </Pressable>
        <Text style={styles.legal}>Sans engagement · Annulable à tout moment</Text>
      </View>
    </View>
  );
}

function PlanCard({
  label,
  price,
  period,
  badge,
  active,
  onPress,
}: {
  label: string;
  price: string;
  period: string;
  badge?: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.planCard, active && styles.planCardActive]} onPress={onPress}>
      {badge ? (
        <View style={styles.planBadge}>
          <Text style={styles.planBadgeText}>{badge}</Text>
        </View>
      ) : null}
      <Text style={styles.planLabel}>{label}</Text>
      <View style={styles.priceRow}>
        <Text style={styles.planPrice}>{price}</Text>
        <Text style={styles.planPeriod}>{period}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  closeBtn: { alignSelf: 'flex-end', padding: spacing.xs },
  closeText: { ...typography.heading, color: colors.textMuted },
  crownCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${PREMIUM_PURPLE}22`,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  crown: { fontSize: 38 },
  title: { ...typography.display, color: colors.textPrimary, textAlign: 'center', marginTop: spacing.md },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs },

  plans: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  planCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  planCardActive: { borderColor: PREMIUM_PURPLE, backgroundColor: `${PREMIUM_PURPLE}14` },
  planBadge: {
    position: 'absolute',
    top: -10,
    backgroundColor: PREMIUM_PURPLE,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  planBadgeText: { ...typography.label, color: '#fff', fontSize: 10 },
  planLabel: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  planPrice: { ...typography.title, color: colors.textPrimary },
  planPeriod: { ...typography.caption, color: colors.textMuted, marginBottom: 3 },

  benefits: { marginTop: spacing.xl, gap: spacing.sm },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  check: { color: PREMIUM_PURPLE, fontSize: 16, fontWeight: '800', width: 20 },
  benefitText: { ...typography.body, color: colors.textPrimary, flex: 1 },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  cta: {
    backgroundColor: PREMIUM_PURPLE,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { ...typography.body, color: '#fff', fontWeight: '700' },
  legal: { ...typography.label, color: colors.textMuted, textAlign: 'center' },
});
