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
 *
 * Mise en scène (17/11/2026) : fond spatial de l'Accueil, badge du palier
 * regardé en grand dans un halo, cartes de forfait vitrées (liseré au
 * dégradé de marque sur la choisie), bouton d'achat dégradé. Une seule
 * couleur d'accent : `TIER_ACCENT` n'est plus utilisé à l'affichage.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { PurchasesOfferings, PurchasesPackage } from 'react-native-purchases';
import { PLAN_PRICE_EUR, PLANS, SOLD_PLANS, isOnTrial, trialDaysLeft, type Plan } from '@yumia/shared';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { buyPackage, fetchOfferings, packageForTier, restorePurchases } from '../lib/purchases';
import { PlanBadgeIcon } from '../components/Avatar';
import { PRIVACY_URL, TERMS_URL } from '../lib/legal';
import { useI18n } from '../lib/useI18n';
import { trackConversion } from '../lib/conversion';
import type { TranslationKey } from '../lib/translations';
import {
  DISPLAY_CAPS_BY_PLAN,
  LIMITS_BY_PLAN,
  nextPaidPlan,
  type DisplayCap,
  type LimitedFeature,
} from '../lib/constants/plan-limits';
import { GradientText, PressableScale, Reveal } from '../components/ui';
import { GlassGroup, SectionLabel, BrandFrame } from '../components/profile/ProfileChrome';
import { GlassCircle } from '../components/chat/ChatChrome';
import { SPACE_BLACK } from '../components/space/SpaceBackground';
import {
  BACK_ARROW, BuyButton, ChangeRow, Glass, PlusBackdrop, TierCard, TierHalo,
} from '../components/plus/PlusVisuals';

type PaidTier = Exclude<Plan, 'free'>;

const PAID_TIERS: PaidTier[] = [...SOLD_PLANS];

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
  { key: 'placeLoads', labelKey: 'plus_row_place_loads', feature: 'placeLoadsPerDay', perDay: true },
  { key: 'uniPlaces', labelKey: 'plus_row_places_universe', cap: 'universePlaces' },
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
  // Essai Gold offert en cours : rappelé en tête, l'offre reste celle d'un compte gratuit.
  const trialLeft = isOnTrial(currentPlan, user?.trialEndsAt) ? trialDaysLeft(user?.trialEndsAt) : 0;

  useEffect(() => { trackConversion('paywall_view', 'plus'); }, []);
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

  /**
   * Offres introuvables (boutique injoignable, réseau, RevenueCat non
   * configuré) : un message neutre et un nouvel essai. Jamais « bientôt
   * disponible » — l'abonnement existe, c'est son chargement qui a échoué.
   */
  function showOffersUnavailable(tier: PaidTier) {
    Alert.alert(t('plus_offers_unavailable_title'), t('plus_offers_unavailable_body'), [
      { text: t('settings_cancel'), style: 'cancel' },
      { text: t('plus_offers_retry'), onPress: () => void retryOfferings(tier) },
    ]);
  }

  async function retryOfferings(tier: PaidTier) {
    setLoading(true);
    const fresh = await fetchOfferings();
    setOfferings(fresh);
    setLoading(false);
    const pkg = packageForTier(fresh, tier);
    if (pkg) await purchase(tier, pkg);
    else showOffersUnavailable(tier);
  }

  async function handleSubscribe() {
    if (!selectedTier) return;
    const pkg = packageForTier(offerings, selectedTier);
    if (!pkg) {
      showOffersUnavailable(selectedTier);
      return;
    }
    await purchase(selectedTier, pkg);
  }

  async function purchase(tier: PaidTier, pkg: PurchasesPackage) {
    setLoading(true);
    try {
      await buyPackage(pkg);
      await reloadUser();
      Alert.alert(
        t('plus_welcome_title').replace('{tier}', PLAN_NAME[tier]),
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
    <View style={styles.screen}>
      {/* Fond spatial de l'Accueil (fixe), animé tant que l'écran est affiché. */}
      <PlusBackdrop />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
          <GlassCircle onPress={() => router.back()}>
            <Text style={styles.backText}>{BACK_ARROW}</Text>
          </GlassCircle>
        </View>

        {/* En-tête : le badge du palier regardé, en grand, dans son halo. */}
        <Reveal index={0} style={styles.hero}>
          <TierHalo plan={selectedTier ?? currentPlan} />
          <GradientText style={styles.title}>{t('plus_hero_title').replace('\n', ' ')}</GradientText>
          <Text style={styles.sub}>{t('plus_hero_sub')}</Text>
          <View style={styles.currentPill}>
            <PlanBadgeIcon plan={currentPlan} size={18} />
            <Text style={styles.currentName}>{PLAN_NAME[currentPlan]}</Text>
            <Text style={styles.currentTag}>· {t('plus_current_plan')}</Text>
          </View>
        </Reveal>

        {trialLeft > 0 ? (
          <Reveal index={1} style={styles.block}>
            <BrandFrame innerStyle={styles.trialInner}>
              <PlanBadgeIcon plan="gold" size={22} />
              <Text style={styles.trialText}>
                {(trialLeft <= 1 ? t('plus_trial_banner_last') : t('plus_trial_banner')).replace('{n}', String(trialLeft))}
              </Text>
            </BrandFrame>
          </Reveal>
        ) : null}

        {upgrades.length === 0 ? (
          <Text style={styles.topTier}>{t('plus_top_tier')}</Text>
        ) : (
          <>
            {/* Choix du palier : cartes vitrées, la choisie au liseré de marque. */}
            <Reveal index={2} style={styles.block}>
              {upgrades.map((tier) => (
                <TierCard
                  key={tier}
                  plan={tier}
                  name={PLAN_NAME[tier]}
                  price={priceOf(tier)}
                  per={t('plus_per_month')}
                  selected={tier === selectedTier}
                  onPress={() => setSelectedTier(tier)}
                />
              ))}
            </Reveal>

            {/* L'écart, déjà calculé : seules les lignes qui changent. */}
            {selectedTier ? (
              <Reveal index={3} style={styles.block}>
                <SectionLabel label={t('plus_changes_title').replace('{tier}', PLAN_NAME[selectedTier])} />
                {changes.length === 0 ? (
                  <Text style={styles.topTier}>{t('plus_nothing_more')}</Text>
                ) : (
                  <GlassGroup>
                    {changes.map(({ row, from, to, unlocked }) => (
                      <ChangeRow
                        key={row.key}
                        label={label(row)}
                        from={format(from)}
                        to={format(to)}
                        unlocked={unlocked}
                        unlockedLabel={t('plus_unlocked')}
                      />
                    ))}
                  </GlassGroup>
                )}
              </Reveal>
            ) : null}

            <Reveal index={4} style={styles.block}>
              <BuyButton
                label={t('plus_cta_start').replace('{tier}', selectedTier ? PLAN_NAME[selectedTier] : '')}
                loading={loading}
                disabled={loading || !selectedTier}
                onPress={handleSubscribe}
              />

              {/* Information obligatoire avant achat (App Store 3.1.2) :
                  renouvellement automatique, débit, résiliation, puis les
                  liens vers les conditions d'utilisation (EULA) et la
                  confidentialité. */}
              {selectedTier ? (
                <Text style={styles.legal}>
                  {t(Platform.OS === 'android' ? 'plus_autorenew_android' : 'plus_autorenew_ios')
                    .replace('{tier}', PLAN_NAME[selectedTier])
                    .replace('{price}', priceOf(selectedTier))}
                </Text>
              ) : null}
              <View style={styles.legalLinks}>
                <Pressable onPress={() => void Linking.openURL(TERMS_URL)} hitSlop={8}>
                  <Text style={styles.legalLink}>{t('plus_terms_eula')}</Text>
                </Pressable>
                <Text style={styles.legalSep}>·</Text>
                <Pressable onPress={() => void Linking.openURL(PRIVACY_URL)} hitSlop={8}>
                  <Text style={styles.legalLink}>{t('settings_privacy_policy')}</Text>
                </Pressable>
              </View>
            </Reveal>

            {/* La grille complète, repliée par défaut. */}
            <PressableScale onPress={() => setCompareOpen((v) => !v)} style={styles.compareToggle} scaleTo={0.97}>
              <Text style={styles.compareToggleText}>
                {compareOpen ? t('plus_compare_hide') : t('plus_compare_show')}
              </Text>
            </PressableScale>

            {compareOpen ? (
              <Reveal from="fade" style={styles.block}>
                <Glass>
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
                </Glass>
              </Reveal>
            ) : null}

            <View style={styles.restoreWrap}>
              <PressableScale onPress={handleRestore} disabled={loading} style={styles.restoreBtn} scaleTo={0.96}>
                <Text style={styles.restoreText}>{t('plus_restore_purchases')}</Text>
              </PressableScale>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: SPACE_BLACK },
  scroll: { flex: 1 },

  topBar: { paddingHorizontal: spacing.lg, flexDirection: 'row' },
  backText: { fontSize: 20, color: '#fff', fontWeight: '800' },

  hero: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  title: { fontSize: 30, fontWeight: '900', letterSpacing: -0.7, textAlign: 'center', lineHeight: 36 },
  sub: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, lineHeight: 21 },
  currentPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md,
    paddingVertical: 6, paddingHorizontal: 14, borderRadius: radius.pill,
    backgroundColor: 'rgba(20,20,30,0.82)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)',
  },
  currentName: { color: colors.textPrimary, fontSize: 13, fontWeight: '800' },
  currentTag: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },

  block: { marginHorizontal: spacing.lg, marginBottom: spacing.lg },

  trialInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  trialText: { ...typography.body, color: colors.textPrimary, flex: 1, lineHeight: 21 },

  legal: {
    ...typography.caption, color: colors.textSecondary, textAlign: 'center',
    marginTop: spacing.md, lineHeight: 18,
  },
  legalLinks: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center',
    gap: spacing.sm, marginTop: spacing.sm,
  },
  legalLink: { ...typography.caption, color: colors.brandSoft, fontWeight: '700', textDecorationLine: 'underline' },
  legalSep: { ...typography.caption, color: colors.textMuted },

  compareToggle: { alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  compareToggleText: { color: colors.brandSoft, fontSize: 13, fontWeight: '800' },

  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: spacing.sm },
  trAlt: { backgroundColor: 'rgba(255,255,255,0.03)' },
  thead: { backgroundColor: 'rgba(255,255,255,0.06)' },
  th: { fontSize: 11, fontWeight: '800', color: colors.textSecondary, textAlign: 'center', letterSpacing: 0.4 },
  td: { fontSize: 12, color: colors.textPrimary, textAlign: 'center', fontVariant: ['tabular-nums'] },
  // Le libellé prend la place restante, les quatre colonnes une part fixe en
  // pourcentage : la grille tient sur n'importe quelle largeur d'écran.
  cellLabel: { flex: 1, textAlign: 'left', color: colors.textSecondary, paddingRight: 4 },
  cell: { width: '13%' },
  cellCurrent: { color: colors.brandSoft, fontWeight: '900' },

  restoreWrap: { alignItems: 'center', marginTop: spacing.xs },
  restoreBtn: {
    paddingVertical: 10, paddingHorizontal: spacing.lg, borderRadius: radius.pill,
    backgroundColor: 'rgba(20,20,30,0.82)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
  },
  restoreText: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },

  topTier: {
    ...typography.body, color: colors.textSecondary, textAlign: 'center',
    marginHorizontal: spacing.lg, marginTop: spacing.md,
  },
});
