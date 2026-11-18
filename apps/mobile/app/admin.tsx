/**
 * Tableau de bord admin — pilotage de YUMIA d'un coup d'œil.
 *
 * Refonte visuelle du 18/11/2026 (sobre : verre sombre, chiffres forts qui
 * montent, barres neutres ; le dégradé de marque n'encadre que le chiffre
 * principal). La logique — chargements, bascule de forfait, complétion des
 * pays — est celle d'origine, à l'identique.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, RefreshControl, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { PLANS, type Plan } from '@yumia/shared';
import { affiliateProviderLabel } from '../lib/affiliate-labels';
import { colors, radius, spacing } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';
import { useI18n } from '../lib/useI18n';
import { FEATURE_LABEL_KEYS, type LimitedFeature } from '../lib/constants/plan-limits';
import { PressableScale, Reveal } from '../components/ui';
import { BrandFrame, GlassGroup } from '../components/profile/ProfileChrome';
import { QuietChip, QuietHeader, RoundGlassButton } from '../components/pb2/Pb2Chrome';
import {
  ADMIN_SPINNER, AdminButton, AdminCard, AdminLoading, AdminSection, AlertCount, BarRow, DayBars,
  ErrorBanner, InitialAvatar, NavRow, StatGrid, StatTile, StatusBadge,
} from '../components/admin/AdminChrome';

const API = API_BASE_URL;

interface Overview {
  users: { total: number; newToday: number; newThisWeek: number; newThisMonth: number; premium: number; active7d: number };
  content: { places: number; visits: number; posts: number; meetups: number };
}

interface CountryRow { countryCode: string; count: number; pct: number }
interface GrowthRow { date: string; count: number }
interface UniverseRow { universe: string; count: number }
interface RecentUser { id: string; email: string; displayName: string; countryCode?: string; plan: string; isPremium: boolean; createdAt: string }
interface AffiliateStats {
  totalClicks: number; totalConversions: number; conversionRate: number; revenueCents: number;
  clicksByProvider: { provider: string; count: number }[];
  conversionsByProvider: { provider: string; count: number }[];
  clicksByUniverse: { universe: string; count: number }[];
}
interface TrendRow { date: string; count: number }
/** GET /admin/conversion : essai Gold, limites atteintes, forfaits, abonnements (7 jours). */
interface ConversionStats {
  days: number;
  trial: { active: number; started: number; ended: number; converted: number };
  subscriptions: { total: number; duringTrial: number };
  paywall: { views: number; users: number };
  limits: { users: number; byFeature: Array<{ feature: string; hits: number; users: number }> };
}

/** Noms affichés des paliers — identiques dans toutes les langues. */
const PLAN_LABEL: Record<Plan, string> = {
  free: 'Gratuit', plus: 'Plus', gold: 'Gold', diamond: 'Diamond',
};

const FLAG: Record<string, string> = {
  FR: '🇫🇷', US: '🇺🇸', GB: '🇬🇧', DE: '🇩🇪', ES: '🇪🇸', IT: '🇮🇹',
  CA: '🇨🇦', AU: '🇦🇺', JP: '🇯🇵', BR: '🇧🇷', MX: '🇲🇽', MA: '🇲🇦',
  DZ: '🇩🇿', TN: '🇹🇳', SN: '🇸🇳', CM: '🇨🇲', CI: '🇨🇮', NG: '🇳🇬',
  ZA: '🇿🇦', BE: '🇧🇪', CH: '🇨🇭', PT: '🇵🇹', NL: '🇳🇱', PL: '🇵🇱',
  RU: '🇷🇺', CN: '🇨🇳', IN: '🇮🇳', XX: '🌍',
};

const INTL_LOCALE: Record<string, string> = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', pt: 'pt-PT', ar: 'ar-SA' };

function flagOf(code: string) { return FLAG[code] ?? '🌍'; }
function fmtDate(iso: string, locale = 'fr') {
  return new Date(iso).toLocaleDateString(INTL_LOCALE[locale] ?? 'fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function AdminScreen() {
  const { accessToken, user, reloadUser } = useAuth();
  const [switchingPlan, setSwitchingPlan] = useState<Plan | null>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [byCountry, setByCountry] = useState<CountryRow[]>([]);
  const [growth, setGrowth] = useState<GrowthRow[]>([]);
  const [byUniverse, setByUniverse] = useState<UniverseRow[]>([]);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [affiliateStats, setAffiliateStats] = useState<AffiliateStats | null>(null);
  const [affiliateTrend, setAffiliateTrend] = useState<TrendRow[]>([]);
  const [conversion, setConversion] = useState<ConversionStats | null>(null);
  const [pendingReports, setPendingReports] = useState<number | null>(null);
  /** Commandes qui demandent une action : en cours (à payer chez AliExpress) + à transmettre. */
  const [ordersToHandle, setOrdersToHandle] = useState<{ inProgress: number; toTransmit: number } | null>(null);

  async function backfillCountries() {
    if (!accessToken) return;
    try {
      const res = await fetch(`${API}/admin/backfill/countries`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json() as { updated?: number };
      Alert.alert(t('adm_backfill_done_title'), t('adm_backfill_done_body').replace('{n}', String(data.updated ?? 0)));
      void load();
    } catch {
      Alert.alert(t('adm_error'), t('adm_backfill_failed'));
    }
  }

  /**
   * Bascule le forfait du compte admin.
   *
   * Les quotas de l'app suivent le forfait réel, admin compris — c'est ce qui
   * permet de voir exactement ce que voit un compte Gratuit sans se
   * déconnecter ni créer un second compte.
   */
  async function switchPlan(plan: Plan) {
    if (!accessToken || switchingPlan) return;
    setSwitchingPlan(plan);
    try {
      const res = await fetch(`${API}/admin/me/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) throw new Error(String(res.status));
      // Le forfait est lu depuis le profil en mémoire : sans ce rechargement,
      // l'app continuerait d'appliquer l'ancien jusqu'à la prochaine session.
      await reloadUser();
    } catch {
      Alert.alert(t('adm_error'), t('adm_plan_switch_failed'));
    } finally {
      setSwitchingPlan(null);
    }
  }

  const openUsers = (segment: string) => router.push(`/admin-users?segment=${segment}` as never);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const h = { Authorization: `Bearer ${accessToken}` };
    setLoading(true);
    setError(null);
    try {
      const [ovRes, ctrRes, gwRes, univRes, recentRes, affStatsRes, affTrendRes] = await Promise.allSettled([
        fetch(`${API}/admin/stats`, { headers: h }),
        fetch(`${API}/admin/users/by-country`, { headers: h }),
        fetch(`${API}/admin/users/growth?days=30`, { headers: h }),
        fetch(`${API}/admin/places/by-universe`, { headers: h }),
        fetch(`${API}/admin/users/recent?limit=15`, { headers: h }),
        fetch(`${API}/admin/affiliates/stats`, { headers: h }),
        fetch(`${API}/admin/affiliates/trend?days=30`, { headers: h }),
      ]);

      // Compteur de signalements : indépendant du reste, un échec ici ne doit
      // pas priver l'écran de ses statistiques.
      void fetch(`${API}/admin/conversion?days=7`, { headers: h })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: ConversionStats | null) => setConversion(d))
        .catch(() => setConversion(null));
      void fetch(`${API}/admin/reports/pending-count`, { headers: h })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { count: number } | null) => setPendingReports(d?.count ?? null))
        .catch(() => setPendingReports(null));
      void fetch(`${API}/shop/admin/orders?tab=in_progress`, { headers: h })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { counts: { in_progress: number; to_transmit: number } } | null) =>
          setOrdersToHandle(d ? { inProgress: d.counts.in_progress, toTransmit: d.counts.to_transmit } : null))
        .catch(() => setOrdersToHandle(null));
      if (ovRes.status === 'fulfilled') {
        if (ovRes.value.ok) setOverview(await ovRes.value.json());
        else setError(`Stats: ${ovRes.value.status}`);
      }
      if (ctrRes.status === 'fulfilled' && ctrRes.value.ok) setByCountry(await ctrRes.value.json());
      if (gwRes.status === 'fulfilled' && gwRes.value.ok) setGrowth(await gwRes.value.json());
      if (univRes.status === 'fulfilled' && univRes.value.ok) setByUniverse(await univRes.value.json());
      if (recentRes.status === 'fulfilled' && recentRes.value.ok) setRecentUsers(await recentRes.value.json());
      if (affStatsRes.status === 'fulfilled' && affStatsRes.value.ok) setAffiliateStats(await affStatsRes.value.json());
      if (affTrendRes.status === 'fulfilled' && affTrendRes.value.ok) setAffiliateTrend(await affTrendRes.value.json());
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const maxGrowth = growth.length > 0 ? Math.max(...growth.map((g) => g.count), 1) : 1;
  const maxCountry = byCountry.length > 0 ? Math.max(...byCountry.map((c) => c.count), 1) : 1;

  // Premier chargement seulement : au rafraîchissement, le tableau de bord
  // reste à l'écran (l'indicateur du geste suffit).
  if (loading && !overview) {
    return <AdminLoading paddingTop={insets.top} />;
  }

  const toHandle = ordersToHandle ? ordersToHandle.inProgress + ordersToHandle.toTransmit : 0;

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => void load()}
          tintColor={ADMIN_SPINNER}
          colors={[colors.brand]}
          progressViewOffset={insets.top}
        />
      }
    >
      <QuietHeader
        title={t('adm_title')}
        onBack={() => router.back()}
        right={<RoundGlassButton label="↻" onPress={() => void load()} />}
      />

      {/* ── Erreur de chargement ── */}
      {error ? <ErrorBanner message={error} /> : null}

      {/* ── À traiter ──
          En tête, avec leurs compteurs : un signalement ou une commande qui
          attend est la seule chose de cet écran qui se dégrade avec le temps
          (règle 1.2 de l'App Store : agir sous 24 heures ; une commande non
          payée chez AliExpress est annulée). */}
      <Reveal index={0}>
        <GlassGroup style={styles.group}>
          <NavRow
            icon="🛡️"
            title="Modération"
            hint={pendingReports === null
              ? 'Signalements à traiter'
              : pendingReports === 0
                ? 'Aucun signalement en attente'
                : `${pendingReports} signalement(s) en attente`}
            trailing={pendingReports ? <AlertCount count={pendingReports} /> : undefined}
            onPress={() => router.push('/admin-moderation')}
          />
          <NavRow
            icon="📦"
            title="Commandes"
            hint={ordersToHandle === null
              ? 'Boutique : paiement AliExpress, suivi, retransmission'
              : ordersToHandle.inProgress + ordersToHandle.toTransmit === 0
                ? 'Aucune commande en attente'
                : [
                    ordersToHandle.inProgress ? `${ordersToHandle.inProgress} en cours (à payer ou en préparation)` : null,
                    ordersToHandle.toTransmit ? `${ordersToHandle.toTransmit} à transmettre` : null,
                  ].filter(Boolean).join(' · ')}
            trailing={toHandle > 0 ? <AlertCount count={toHandle} /> : undefined}
            onPress={() => router.push('/admin-orders' as never)}
          />
          <NavRow
            icon="👥"
            title="Utilisateurs"
            hint="Emails, fiches, suspensions et bannissements"
            trailing={overview?.users ? <Text style={styles.navCount}>{overview.users.total}</Text> : undefined}
            onPress={() => router.push('/admin-users' as never)}
          />
        </GlassGroup>
        <View style={styles.quickRow}>
          <QuietChip label="⏸ Suspendus" active={false} onPress={() => router.push('/admin-users?segment=suspended' as never)} />
          <QuietChip label="⛔ Bannis" active={false} onPress={() => router.push('/admin-users?segment=banned' as never)} />
        </View>
      </Reveal>

      {/* ── Forfait du compte admin ──
          Placé en tête : c'est un outil de test, pas une statistique, et on
          le cherche avant de parcourir les chiffres. */}
      <AdminSection title={t('adm_my_plan')} />
      <AdminCard>
        <Text style={styles.hint}>{t('adm_my_plan_hint')}</Text>
        <View style={styles.planRow}>
          {PLANS.map((p) => {
            const active = (user?.plan as Plan | undefined) === p;
            return (
              <PressableScale
                key={p}
                style={[styles.planChip, active && styles.planChipActive]}
                onPress={() => void switchPlan(p)}
                disabled={switchingPlan !== null}
                scaleTo={0.94}
              >
                {switchingPlan === p ? (
                  <ActivityIndicator size="small" color={active ? colors.bg : ADMIN_SPINNER} />
                ) : (
                  <Text style={[styles.planChipText, active && styles.planChipTextActive]}>
                    {PLAN_LABEL[p]}
                  </Text>
                )}
              </PressableScale>
            );
          })}
        </View>
      </AdminCard>

      {/* ── Vue d'ensemble ── */}
      {overview?.users && (
        <>
          <AdminSection title={t('adm_overview')} />
          <Reveal index={1}>
            {/* Le chiffre principal de l'écran : seul élément au dégradé de marque. */}
            <BrandFrame style={styles.heroFrame}>
              <StatTile
                hero
                label={t('adm_users')}
                value={overview.users.total}
                onPress={() => openUsers('all')}
                style={styles.heroTile}
              />
            </BrandFrame>
            <StatGrid>
              <StatTile
                label={t('adm_premium')}
                value={overview.users.premium}
                sub={`${Math.round((overview.users.premium / Math.max(overview.users.total, 1)) * 100)}%`}
                onPress={() => openUsers('premium')}
              />
              <StatTile label={t('adm_active_7d')} value={overview.users.active7d} onPress={() => openUsers('active7d')} />
            </StatGrid>
            <StatGrid>
              <StatTile third label={t('adm_new_today')} value={overview.users.newToday} onPress={() => openUsers('newToday')} />
              <StatTile third label={t('adm_new_7d')} value={overview.users.newThisWeek} onPress={() => openUsers('new7d')} />
              <StatTile third label={t('adm_new_30d')} value={overview.users.newThisMonth} onPress={() => openUsers('new30d')} />
            </StatGrid>
            <StatGrid>
              <StatTile label={t('adm_places')} value={overview.content.places} />
              <StatTile label={t('adm_visits')} value={overview.content.visits} />
            </StatGrid>
          </Reveal>
        </>
      )}

      {/* ── Conversion (7 jours) : de quoi régler les limites du Gratuit ── */}
      {conversion && (
        <>
          <AdminSection title={t('adm_conversion_title')} />
          <StatGrid>
            <StatTile label={t('adm_conv_trials_active')} value={conversion.trial.active} />
            <StatTile label={t('adm_conv_trials_started')} value={conversion.trial.started} />
            <StatTile
              label={t('adm_conv_trials_ended')}
              value={conversion.trial.ended}
              sub={`${conversion.trial.converted} ${t('adm_conv_trials_converted')}`}
            />
            <StatTile
              label={t('adm_conv_subscriptions')}
              value={conversion.subscriptions.total}
              sub={`${conversion.subscriptions.duringTrial} ${t('adm_conv_during_trial')}`}
            />
            <StatTile label={t('adm_conv_paywall')} value={conversion.paywall.users} sub={`${conversion.paywall.views} ${t('adm_conv_views')}`} />
            <StatTile label={t('adm_conv_limit_users')} value={conversion.limits.users} />
          </StatGrid>
          <AdminCard>
            {conversion.limits.byFeature.length === 0 ? (
              <Text style={styles.hint}>{t('adm_conv_no_limits')}</Text>
            ) : conversion.limits.byFeature.map((row) => {
              const max = Math.max(...conversion.limits.byFeature.map((r) => r.users), 1);
              const labelKey = FEATURE_LABEL_KEYS[row.feature as LimitedFeature];
              return (
                <BarRow
                  key={row.feature}
                  label={labelKey ? t(labelKey) : row.feature}
                  labelWidth={140}
                  ratio={row.users / max}
                  value={row.users}
                />
              );
            })}
          </AdminCard>
        </>
      )}

      {/* ── Utilisateurs par pays ── */}
      {byCountry.length > 0 && (
        <>
          <AdminSection title={t('adm_users_by_country')} />
          <AdminCard>
            {byCountry.slice(0, 20).map((row) => (
              <BarRow
                key={row.countryCode}
                lead={<Text style={styles.flag}>{flagOf(row.countryCode)}</Text>}
                label={row.countryCode}
                labelWidth={30}
                ratio={row.count / maxCountry}
                value={row.count}
                trailing={`${row.pct}%`}
                onPress={() => router.push(`/admin-users?country=${row.countryCode}` as never)}
              />
            ))}
          </AdminCard>
        </>
      )}

      {/* ── Croissance inscriptions (30j) ── */}
      {growth.length > 0 && (
        <>
          <AdminSection title={t('adm_registrations_30d')} />
          <AdminCard>
            <DayBars data={growth} />
          </AdminCard>
        </>
      )}

      {/* ── Lieux par univers ── */}
      {byUniverse.length > 0 && (
        <>
          <AdminSection title={t('adm_places_by_universe')} />
          <AdminCard>
            {byUniverse.map((row) => (
              <BarRow
                key={row.universe}
                label={row.universe}
                ratio={row.count / Math.max(...byUniverse.map((u) => u.count), 1)}
                value={row.count}
              />
            ))}
          </AdminCard>
        </>
      )}

      {/* ── Affiliation ── */}
      {affiliateStats && (
        <>
          <AdminSection title={t('adm_affiliation')} />
          <StatGrid>
            <StatTile third label={t('adm_clicks')} value={affiliateStats.totalClicks} />
            <StatTile third label={t('adm_conversions')} value={affiliateStats.totalConversions} sub={`${affiliateStats.conversionRate}%`} />
            <StatTile third label={t('adm_revenue')} value={`${(affiliateStats.revenueCents / 100).toFixed(2)} €`} />
          </StatGrid>

          {affiliateTrend.length > 0 && (
            <AdminCard>
              <DayBars data={affiliateTrend} />
            </AdminCard>
          )}

          <AdminCard>
            {affiliateStats.clicksByProvider.length > 0 ? (
              affiliateStats.clicksByProvider.map((row) => {
                const max = Math.max(...affiliateStats.clicksByProvider.map((r) => r.count), 1);
                const conv = affiliateStats.conversionsByProvider.find((c) => c.provider === row.provider)?.count ?? 0;
                return (
                  <BarRow
                    key={row.provider}
                    label={affiliateProviderLabel(row.provider)}
                    labelWidth={128}
                    ratio={row.count / max}
                    value={row.count}
                    trailing={`${conv} ${t('adm_conv_short')}`}
                  />
                );
              })
            ) : (
              <Text style={styles.hint}>{t('adm_no_clicks')}</Text>
            )}
          </AdminCard>
        </>
      )}

      {/* ── Inscriptions récentes ── */}
      {recentUsers.length > 0 && (
        <>
          <AdminSection title={t('adm_recent_signups')} />
          <GlassGroup style={styles.group}>
            {recentUsers.map((u) => (
              <PressableScale
                key={u.id}
                style={styles.userRow}
                onPress={() => router.push(`/admin-user?id=${u.id}` as never)}
                scaleTo={0.98}
              >
                <InitialAvatar name={u.displayName} size={38} />
                <View style={styles.userInfo}>
                  <View style={styles.userNameRow}>
                    <Text style={styles.userName} numberOfLines={1}>{u.displayName}</Text>
                    {u.isPremium && <StatusBadge label={t('adm_plus_badge')} tone="plan" />}
                    {u.countryCode && <Text style={styles.userFlag}>{flagOf(u.countryCode)}</Text>}
                  </View>
                  <Text style={styles.userEmail} numberOfLines={1}>{u.email}</Text>
                </View>
                <Text style={styles.userDate}>{fmtDate(u.createdAt, locale)}</Text>
              </PressableScale>
            ))}
          </GlassGroup>
        </>
      )}

      {/* ── Maintenance ── tout en bas : une action rare, pas un chiffre. */}
      <AdminButton label={t('adm_backfill_countries')} onPress={() => void backfillCountries()} style={styles.backfill} />

      <View style={{ height: insets.bottom + 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  group: { marginHorizontal: spacing.md },
  navCount: { color: colors.textSecondary, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  quickRow: { flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.md, marginTop: spacing.sm },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  planRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  planChip: {
    minWidth: 84, height: 38, paddingHorizontal: spacing.md, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  planChipActive: { backgroundColor: '#fff', borderColor: '#fff' },
  planChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  planChipTextActive: { color: colors.bg, fontWeight: '900' },
  heroFrame: { marginHorizontal: spacing.md, marginBottom: spacing.sm },
  // Le cadre dégradé fournit déjà fond et liseré.
  heroTile: { backgroundColor: 'transparent', borderWidth: 0 },
  flag: { fontSize: 17, width: 24 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 11 },
  userInfo: { flex: 1, minWidth: 0 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  userName: { color: colors.textPrimary, fontSize: 14.5, fontWeight: '800', flexShrink: 1 },
  userFlag: { fontSize: 14 },
  userEmail: { color: colors.textMuted, fontSize: 12.5, marginTop: 1 },
  userDate: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  backfill: { marginHorizontal: spacing.md, marginTop: spacing.xl },
});
