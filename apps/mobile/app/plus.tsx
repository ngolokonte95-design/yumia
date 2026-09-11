/**
 * YUMIA PLUS / GOLD / DIAMOND — écran d'abonnement.
 *
 * Bâti autour d'un TABLEAU COMPARATIF alimenté par la table des forfaits
 * (plan-limits.ts), et non plus d'une grille d'arguments : les paliers ne se
 * distinguent que par des chiffres, donc montrer les chiffres est à la fois
 * plus honnête et plus court qu'une liste de promesses. Les valeurs affichées
 * ne peuvent pas mentir — ce sont exactement celles que l'app applique.
 *
 * La page proposait auparavant les formules UNIQUEMENT aux comptes gratuits :
 * un abonné Plus qui voulait Gold tombait sur « tu es déjà abonné », sans
 * aucun moyen de monter. Elle propose désormais tous les paliers au-dessus du
 * palier courant, quel qu'il soit.
 */
import { useEffect, useMemo, useState } from 'react';
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
import { PLAN_PRICE_EUR, PLANS, type Plan } from '@yumia/shared';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { buyPackage, fetchOfferings, packageForTier, restorePurchases } from '../lib/purchases';
import { PlanBadgeIcon } from '../components/Avatar';
import { useI18n } from '../lib/useI18n';
import type { TranslationKey } from '../lib/translations';
import {
  DISPLAY_CAPS_BY_PLAN,
  LIMITS_BY_PLAN,
  nextPaidPlan,
  type DisplayCap,
  type LimitedFeature,
} from '../lib/constants/plan-limits';

type PaidTier = Exclude<Plan, 'free'>;

const PAID_TIERS: PaidTier[] = ['plus', 'gold', 'diamond'];

/** Noms commerciaux — identiques dans toutes les langues. */
const PLAN_NAME: Record<Plan, string> = {
  free: 'YUMIA Free', plus: 'YUMIA Plus', gold: 'YUMIA Gold', diamond: 'YUMIA Diamond',
};

/** En-tête de colonne : le nom sans son préfixe, pour tenir sur un écran. */
const PLAN_SHORT: Record<Plan, string> = {
  free: 'Free', plus: 'Plus', gold: 'Gold', diamond: 'Diamond',
};

/**
 * Les lignes du tableau.
 *
 * `feature` lit un quota, `cap` un plafond d'affichage, `paidOnly` une porte
 * ouverte ou fermée. Les libellés réutilisent les clés des écrans concernés :
 * l'utilisateur retrouve le mot qu'il voit dans l'app, sans traduction
 * parallèle à maintenir.
 */
type Row =
  | { labelKey: TranslationKey; feature: LimitedFeature; perDay?: boolean }
  | { labelKey: TranslationKey; cap: DisplayCap }
  | { labelKey: TranslationKey; paidOnly: true };

const ROWS: Row[] = [
  { labelKey: 'home_shortcut_chatbot', feature: 'chatbotPerDay', perDay: true },
  { labelKey: 'search_title', feature: 'desirePerDay', perDay: true },
  { labelKey: 'home_shortcut_itinerary', feature: 'itineraryPerModePerDay', perDay: true },
  { labelKey: 'home_shortcut_surprise', feature: 'surprisePerDay', perDay: true },
  { labelKey: 'plus_row_universe', feature: 'universeLoadsPerDay', perDay: true },
  { labelKey: 'plus_row_places_universe', cap: 'universePlaces' },
  { labelKey: 'tab_map', feature: 'mapLoadsPerDay', perDay: true },
  { labelKey: 'plus_row_places_map', cap: 'mapPlaces' },
  { labelKey: 'plus_row_explorer_row', cap: 'explorerSectionPlaces' },
  { labelKey: 'tab_foryou', feature: 'suggestionsPerDay', perDay: true },
  { labelKey: 'social_menu_tind', feature: 'peopleSuggestionsPerDay', perDay: true },
  { labelKey: 'mu_title', feature: 'eventsPerDay', perDay: true },
  { labelKey: 'group_title', feature: 'circleMaxMembers' },
  { labelKey: 'tab_passport', feature: 'passportMaxEntries' },
  { labelKey: 'plus_row_social_map', paidOnly: true },
];

export default function PlusScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, reloadUser } = useAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);

  const currentPlan = (user?.plan ?? 'free') as Plan;
  const upgrades = useMemo(() => {
    const next = nextPaidPlan(currentPlan);
    return next ? PAID_TIERS.slice(PAID_TIERS.indexOf(next)) : [];
  }, [currentPlan]);

  // Présélection du premier palier proposé : le plus proche, donc le moins
  // cher — celui qu'on choisit le plus souvent.
  const [selectedTier, setSelectedTier] = useState<PaidTier | null>(upgrades[0] ?? null);
  useEffect(() => { setSelectedTier(upgrades[0] ?? null); }, [upgrades]);

  useEffect(() => {
    fetchOfferings().then(setOfferings);
  }, []);

  /** Prix réel de la boutique quand il est connu, tarif de référence sinon. */
  function priceOf(tier: PaidTier): string {
    const pkg = packageForTier(offerings, tier);
    return pkg?.product.priceString ?? `${PLAN_PRICE_EUR[tier].toFixed(2).replace('.', ',')} €`;
  }

  /** Valeur d'une ligne pour un palier — « ∞ » quand c'est illimité. */
  function cellValue(row: Row, plan: Plan): string {
    if ('paidOnly' in row) return plan === 'free' ? '—' : '✓';
    const value = 'cap' in row
      ? DISPLAY_CAPS_BY_PLAN[plan][row.cap]
      : LIMITS_BY_PLAN[plan][row.feature];
    return value === Infinity ? '∞' : String(value);
  }

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
    if (!selectedTier) return;
    const pkg = packageForTier(offerings, selectedTier);
    if (!pkg) {
      Alert.alert(
        t('plus_coming_soon_title'),
        t('plus_coming_soon_body').replace('{tier}', PLAN_NAME[selectedTier]),
        [{ text: t('plus_great') }],
      );
      return;
    }
    setLoading(true);
    try {
      await buyPackage(pkg);
      await reloadUser();
      Alert.alert(
        t('plus_welcome_title').replace('{tier}', PLAN_NAME[selectedTier]),
        t('plus_welcome_body'),
        [{ text: t('plus_lets_go'), onPress: () => router.back() }],
      );
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
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>{t('plus_hero_title').replace('\n', ' ')}</Text>
        <Text style={styles.sub}>{t('plus_hero_sub')}</Text>
      </View>

      {/* Palier en cours */}
      <View style={styles.currentRow}>
        <PlanBadgeIcon plan={currentPlan} size={26} />
        <Text style={styles.currentName}>{PLAN_NAME[currentPlan]}</Text>
        <Text style={styles.currentTag}>{t('plus_current_plan')}</Text>
      </View>

      {/* Tableau comparatif — les chiffres réellement appliqués par l'app. */}
      <Text style={styles.sectionTitle}>{t('plus_table_title')}</Text>
      <View style={styles.table}>
        <View style={[styles.tr, styles.thead]}>
          <Text style={[styles.th, styles.cellLabel]} />
          {PLANS.map((p) => (
            <Text
              key={p}
              style={[styles.th, styles.cell, p === currentPlan && styles.cellCurrent]}
              numberOfLines={1}
            >
              {PLAN_SHORT[p]}
            </Text>
          ))}
        </View>

        {ROWS.map((row, i) => (
          <View key={row.labelKey} style={[styles.tr, i % 2 === 1 && styles.trAlt]}>
            <Text style={[styles.td, styles.cellLabel]} numberOfLines={2}>
              {/* Les libellés empruntés à d'autres écrans portent parfois un
                  emoji en tête ; il alourdit une grille de chiffres. */}
              {t(row.labelKey).replace(/^[^\p{L}0-9]+/u, '')}
              {'perDay' in row && row.perDay ? (
                <Text style={styles.tdUnit}>{t('plus_per_day')}</Text>
              ) : null}
            </Text>
            {PLANS.map((p) => (
              <Text
                key={p}
                style={[styles.td, styles.cell, p === currentPlan && styles.cellCurrent]}
              >
                {cellValue(row, p)}
              </Text>
            ))}
          </View>
        ))}
      </View>

      {upgrades.length === 0 ? (
        <Text style={styles.topTier}>{t('plus_top_tier')}</Text>
      ) : (
        <>
          <Text style={styles.sectionTitle}>{t('plus_choose_plan')}</Text>
          {upgrades.map((tier) => {
            const selected = tier === selectedTier;
            return (
              <Pressable
                key={tier}
                style={[styles.tierRow, selected && styles.tierRowSelected]}
                onPress={() => setSelectedTier(tier)}
              >
                <View style={[styles.radio, selected && styles.radioOn]}>
                  {selected ? <View style={styles.radioDot} /> : null}
                </View>
                <PlanBadgeIcon plan={tier} size={26} />
                <Text style={styles.tierName}>{PLAN_NAME[tier]}</Text>
                <Text style={styles.tierPrice}>
                  {priceOf(tier)}
                  <Text style={styles.tierPer}>{t('plus_per_month')}</Text>
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            style={[styles.cta, loading && styles.ctaDisabled]}
            onPress={handleSubscribe}
            disabled={loading || !selectedTier}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>
                {t('plus_cta_start').replace('{tier}', selectedTier ? PLAN_NAME[selectedTier] : '')}
              </Text>
            )}
          </Pressable>

          <Text style={styles.legal}>{t('plus_legal')}</Text>

          <Pressable onPress={handleRestore} disabled={loading} style={styles.restoreBtn}>
            <Text style={styles.restoreText}>{t('plus_restore_purchases')}</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  backBtn: { alignSelf: 'flex-start', paddingVertical: spacing.sm },
  backText: { fontSize: 22, color: colors.brandSoft, fontWeight: '700' },
  title: { ...typography.title, color: colors.textPrimary, marginTop: spacing.xs },
  sub: { ...typography.body, color: colors.textSecondary, marginTop: 4 },

  currentRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.lg, marginBottom: spacing.lg,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
  },
  currentName: { ...typography.label, color: colors.textPrimary, flex: 1 },
  currentTag: { ...typography.caption, color: colors.textMuted },

  sectionTitle: {
    ...typography.label, color: colors.textSecondary,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm, marginTop: spacing.md,
  },

  table: {
    marginHorizontal: spacing.lg,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
    overflow: 'hidden',
  },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: spacing.sm },
  trAlt: { backgroundColor: colors.surface },
  thead: { backgroundColor: colors.surfaceElevated },
  th: { ...typography.label, fontSize: 11, color: colors.textSecondary, textAlign: 'center' },
  td: { ...typography.body, fontSize: 12, color: colors.textPrimary, textAlign: 'center' },
  tdUnit: { ...typography.caption, fontSize: 10, color: colors.textMuted },
  // Le libellé prend la place restante, les quatre colonnes une part fixe en
  // pourcentage : la grille tient ainsi sur n'importe quelle largeur d'écran.
  cellLabel: { flex: 1, textAlign: 'left', color: colors.textSecondary, paddingRight: 4 },
  cell: { width: '13%' },
  cellCurrent: { color: colors.brand, fontWeight: '700' },

  tierRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
  },
  tierRowSelected: { borderColor: colors.brand, backgroundColor: `${colors.brand}12` },
  radio: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOn: { borderColor: colors.brand },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  tierName: { ...typography.label, color: colors.textPrimary, flex: 1 },
  tierPrice: { ...typography.label, color: colors.textPrimary },
  tierPer: { ...typography.caption, color: colors.textMuted },

  cta: {
    marginHorizontal: spacing.lg, marginTop: spacing.sm,
    backgroundColor: colors.brand, borderRadius: radius.pill,
    paddingVertical: 15, alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { ...typography.label, color: '#fff', fontSize: 15 },

  legal: {
    ...typography.caption, color: colors.textMuted, textAlign: 'center',
    marginHorizontal: spacing.lg, marginTop: spacing.sm,
  },
  restoreBtn: { alignItems: 'center', paddingVertical: spacing.md },
  restoreText: { ...typography.caption, color: colors.brandSoft },

  topTier: {
    ...typography.body, color: colors.textSecondary, textAlign: 'center',
    marginHorizontal: spacing.lg, marginTop: spacing.lg,
  },
});
