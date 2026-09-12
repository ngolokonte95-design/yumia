/**
 * YUMIA PLUS / GOLD / DIAMOND — écran d'abonnement.
 *
 * Le cœur de l'écran n'est pas une grille de chiffres mais UN ÉCART : ce que
 * le palier sélectionné change par rapport à celui qu'on a déjà. Quinze
 * lignes sur quatre colonnes obligeaient chacun à faire la comparaison
 * lui-même ; ici elle est déjà faite, et seules les lignes qui bougent
 * s'affichent. La grille complète reste accessible d'un geste, pour qui veut
 * tout voir.
 *
 * Les valeurs viennent de plan-limits.ts, jamais recopiées : les chiffres
 * annoncés sont exactement ceux que l'app applique.
 *
 * La page proposait autrefois les formules UNIQUEMENT aux comptes gratuits :
 * un abonné Plus qui voulait Gold tombait sur « tu es déjà abonné ». Elle
 * propose désormais tous les paliers au-dessus du palier courant.
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

/** En-tête de colonne de la grille : le nom sans son préfixe. */
const PLAN_SHORT: Record<Plan, string> = {
  free: 'Free', plus: 'Plus', gold: 'Gold', diamond: 'Diamond',
};

/**
 * Teinte propre à chaque palier, reprise de ses étoiles.
 *
 * Elle sert d'accent sur la ligne sélectionnée et sur les chiffres gagnés :
 * l'écran change de couleur selon la formule regardée, ce qui donne à chacune
 * une identité sans ajouter un mot.
 */
const TIER_ACCENT: Record<PaidTier, string> = {
  plus: '#9BA3AF',    // argent
  gold: '#D4A72C',    // or
  diamond: '#5FB8E8', // diamant
};

/**
 * Une ligne comparable.
 *
 * `feature` lit un quota, `cap` un plafond d'affichage, `paidOnly` une porte
 * ouverte ou fermée. Les libellés empruntent les clés des écrans concernés :
 * on retrouve le mot vu dans l'app, sans traduction parallèle à maintenir.
 */
type Row =
  | { labelKey: TranslationKey; feature: LimitedFeature; perDay?: boolean; key: string }
  | { labelKey: TranslationKey; cap: DisplayCap; key: string }
  | { labelKey: TranslationKey; paidOnly: true; key: string };

const ROWS: Row[] = [
  { key: 'chatbot', labelKey: 'home_shortcut_chatbot', feature: 'chatbotPerDay', perDay: true },
  { key: 'search', labelKey: 'search_title', feature: 'desirePerDay', perDay: true },
  { key: 'itinerary', labelKey: 'home_shortcut_itinerary', feature: 'itineraryPerModePerDay', perDay: true },
  { key: 'surprise', labelKey: 'home_shortcut_surprise', feature: 'surprisePerDay', perDay: true },
  { key: 'uniLoads', labelKey: 'plus_row_universe', feature: 'universeLoadsPerDay', perDay: true },
  { key: 'uniPlaces', labelKey: 'plus_row_places_universe', cap: 'universePlaces' },
  { key: 'mapLoads', labelKey: 'plus_row_map_loads', feature: 'mapLoadsPerDay', perDay: true },
  { key: 'mapPlaces', labelKey: 'plus_row_places_map', cap: 'mapPlaces' },
  { key: 'explorer', labelKey: 'plus_row_explorer_row', cap: 'explorerSectionPlaces' },
  { key: 'foryou', labelKey: 'tab_foryou', feature: 'suggestionsPerDay', perDay: true },
  { key: 'tind', labelKey: 'social_menu_tind', feature: 'peopleSuggestionsPerDay', perDay: true },
  { key: 'events', labelKey: 'mu_title', feature: 'eventsPerDay', perDay: true },
  { key: 'circle', labelKey: 'group_title', feature: 'circleMaxMembers' },
  { key: 'passport', labelKey: 'tab_passport', feature: 'passportMaxEntries' },
  { key: 'socialMap', labelKey: 'plus_row_social_map', paidOnly: true },
];

/** Valeur brute d'une ligne pour un palier. `null` = porte fermée. */
function valueOf(row: Row, plan: Plan): number | null {
  if ('paidOnly' in row) return plan === 'free' ? null : Infinity;
  return 'cap' in row ? DISPLAY_CAPS_BY_PLAN[plan][row.cap] : LIMITS_BY_PLAN[plan][row.feature];
}

export default function PlusScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, reloadUser } = useAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);

  const currentPlan = (user?.plan ?? 'free') as Plan;
  const upgrades = useMemo(() => {
    const next = nextPaidPlan(currentPlan);
    return next ? PAID_TIERS.slice(PAID_TIERS.indexOf(next)) : [];
  }, [currentPlan]);

  // Présélection du palier le plus proche : le moins cher des proposés, donc
  // celui qu'on choisit le plus souvent.
  const [selectedTier, setSelectedTier] = useState<PaidTier | null>(upgrades[0] ?? null);
  useEffect(() => { setSelectedTier(upgrades[0] ?? null); }, [upgrades]);

  useEffect(() => {
    fetchOfferings().then(setOfferings);
  }, []);

  const accent = selectedTier ? TIER_ACCENT[selectedTier] : colors.brand;

  /**
   * Ce que le palier sélectionné change, et rien d'autre.
   *
   * Les gains DÉBLOCAGES (une limite qui saute, une porte qui s'ouvre) passent
   * devant les gains chiffrés : ce sont eux qui décident un abonnement.
   */
  const changes = useMemo(() => {
    if (!selectedTier) return [];
    return ROWS.flatMap((row) => {
      const from = valueOf(row, currentPlan);
      const to = valueOf(row, selectedTier);
      if (from === to) return [];
      const unlocked = to === Infinity || from === null;
      return [{ row, from, to, unlocked }];
    }).sort((a, b) => Number(b.unlocked) - Number(a.unlocked));
  }, [selectedTier, currentPlan]);

  /** Prix réel de la boutique quand il est connu, tarif de référence sinon. */
  function priceOf(tier: PaidTier): string {
    const pkg = packageForTier(offerings, tier);
    return pkg?.product.priceString ?? `${PLAN_PRICE_EUR[tier].toFixed(2).replace('.', ',')} €`;
  }

  /** Affichage d'une valeur : « ∞ » pour l'illimité, « — » pour une porte close. */
  function format(value: number | null): string {
    if (value === null) return '—';
    return value === Infinity ? '∞' : String(value);
  }

  /** Libellé d'une ligne, débarrassé de l'emoji que portent certaines clés. */
  function label(row: Row): string {
    return t(row.labelKey).replace(/^[^\p{L}0-9]+/u, '');
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

      <View style={styles.currentRow}>
        <PlanBadgeIcon plan={currentPlan} size={24} />
        <Text style={styles.currentName}>{PLAN_NAME[currentPlan]}</Text>
        <Text style={styles.currentTag}>{t('plus_current_plan')}</Text>
      </View>

      {upgrades.length === 0 ? (
        <Text style={styles.topTier}>{t('plus_top_tier')}</Text>
      ) : (
        <>
          {/* Choix du palier — des lignes, pas des cartes : trois formules se
              comparent d'un regard vertical. */}
          {upgrades.map((tier) => {
            const selected = tier === selectedTier;
            return (
              <Pressable
                key={tier}
                style={[
                  styles.tierRow,
                  selected && { borderColor: TIER_ACCENT[tier], backgroundColor: `${TIER_ACCENT[tier]}14` },
                ]}
                onPress={() => setSelectedTier(tier)}
              >
                <View style={[styles.radio, selected && { borderColor: TIER_ACCENT[tier] }]}>
                  {selected ? <View style={[styles.radioDot, { backgroundColor: TIER_ACCENT[tier] }]} /> : null}
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

          {/* L'écart, déjà calculé : la comparaison n'est plus à la charge du
              lecteur, et seules les lignes qui changent apparaissent. */}
          {selectedTier ? (
            <>
              <Text style={styles.sectionTitle}>
                {t('plus_changes_title').replace('{tier}', PLAN_NAME[selectedTier])}
              </Text>

              {changes.length === 0 ? (
                <Text style={styles.topTier}>{t('plus_nothing_more')}</Text>
              ) : (
                <View style={styles.changes}>
                  {changes.map(({ row, from, to, unlocked }) => (
                    <View key={row.key} style={styles.changeRow}>
                      <Text style={styles.changeLabel} numberOfLines={2}>{label(row)}</Text>
                      {unlocked ? (
                        <Text style={[styles.changeUnlocked, { color: accent }]}>
                          ✓ {t('plus_unlocked')}
                        </Text>
                      ) : (
                        <View style={styles.changeValues}>
                          <Text style={styles.changeFrom}>{format(from)}</Text>
                          <Text style={styles.changeArrow}>→</Text>
                          <Text style={[styles.changeTo, { color: accent }]}>{format(to)}</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : null}

          <Pressable
            style={[styles.cta, { backgroundColor: accent }, loading && styles.ctaDisabled]}
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

          {/* La grille complète reste là pour qui veut tout voir — repliée par
              défaut, car elle demande un effort que l'écart ci-dessus évite. */}
          <Pressable onPress={() => setCompareOpen((v) => !v)} style={styles.compareToggle}>
            <Text style={[styles.compareToggleText, { color: accent }]}>
              {compareOpen ? t('plus_compare_hide') : t('plus_compare_show')}
            </Text>
          </Pressable>

          {compareOpen ? (
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
                <View key={row.key} style={[styles.tr, i % 2 === 1 && styles.trAlt]}>
                  <Text style={[styles.td, styles.cellLabel]} numberOfLines={2}>{label(row)}</Text>
                  {PLANS.map((p) => (
                    <Text
                      key={p}
                      style={[styles.td, styles.cell, p === currentPlan && styles.cellCurrent]}
                    >
                      {format(valueOf(row, p))}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          ) : null}

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
    marginHorizontal: spacing.lg, marginBottom: spacing.sm, marginTop: spacing.lg,
  },

  tierRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
  },
  radio: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  tierName: { ...typography.label, color: colors.textPrimary, flex: 1 },
  tierPrice: { ...typography.label, color: colors.textPrimary },
  tierPer: { ...typography.caption, color: colors.textMuted },

  changes: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  changeRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  changeLabel: { ...typography.body, fontSize: 13, color: colors.textSecondary, flex: 1, paddingRight: spacing.sm },
  changeValues: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  changeFrom: { ...typography.body, fontSize: 13, color: colors.textMuted },
  changeArrow: { ...typography.body, fontSize: 12, color: colors.textMuted },
  // Le chiffre gagné est le seul élément en gras de la ligne : l'œil le trouve
  // sans lire le reste.
  changeTo: { ...typography.heading, fontSize: 16 },
  changeUnlocked: { ...typography.label, fontSize: 13 },

  cta: {
    marginHorizontal: spacing.lg, marginTop: spacing.lg,
    borderRadius: radius.pill, paddingVertical: 15, alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { ...typography.label, color: '#fff', fontSize: 15 },

  legal: {
    ...typography.caption, color: colors.textMuted, textAlign: 'center',
    marginHorizontal: spacing.lg, marginTop: spacing.sm,
  },

  compareToggle: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
  compareToggleText: { ...typography.label, fontSize: 13 },

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
  // Le libellé prend la place restante, les quatre colonnes une part fixe en
  // pourcentage : la grille tient sur n'importe quelle largeur d'écran.
  cellLabel: { flex: 1, textAlign: 'left', color: colors.textSecondary, paddingRight: 4 },
  cell: { width: '13%' },
  cellCurrent: { color: colors.brand, fontWeight: '700' },

  restoreBtn: { alignItems: 'center', paddingVertical: spacing.md },
  restoreText: { ...typography.caption, color: colors.brandSoft },

  topTier: {
    ...typography.body, color: colors.textSecondary, textAlign: 'center',
    marginHorizontal: spacing.lg, marginTop: spacing.md,
  },
});
