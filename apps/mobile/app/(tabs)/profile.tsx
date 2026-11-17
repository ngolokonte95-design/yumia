import { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Share } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { PLAN_PRICE_EUR, SOLD_PLANS, type Plan } from '@yumia/shared';
import { nextPaidPlan } from '../../lib/constants/plan-limits';
import { safeMeta, universeLabel } from '../../lib/universeMeta';
import { colors, gradients, radius, spacing, typography } from '../../theme/tokens';
import { useAuth } from '../../lib/auth-context';
import { API_BASE_URL } from '../../lib/config';
import { useI18n } from '../../lib/useI18n';
import { usePassportStats } from '../../lib/usePassportStats';
import { useUnreadNotificationsCount } from '../../lib/useNotifications';
import { Avatar, PlanBadgeIcon } from '../../components/Avatar';
import { LocalePicker } from '../../components/LocalePicker';
import { YumiaLogo } from '../../components/YumiaLogo';
import { StreakModal } from '../../components/StreakModal';
import { BadgesModal } from '../../components/BadgesModal';
import { CountriesModal } from '../../components/CountriesModal';
import { levelName } from '../../lib/labelHelpers';
import { PressableScale, Reveal } from '../../components/ui';
import { haptics } from '../../lib/useHaptics';
import {
  BrandDot, BrandFrame, CHEVRON, CountUp, GLASS, GlassCircleButton, GlassGroup, GradientRing,
  MenuRow, SectionLabel,
} from '../../components/profile/ProfileChrome';

/**
 * PROFIL — niveau XP animé, stats, visites récentes, préférences, paramètres.
 *
 * Mise en scène (17/11/2026) : fond sombre uni, une seule couleur d'accent
 * (dégradé de marque). Grand avatar à anneau dégradé, nom en grand avec le
 * badge d'abonnement à 22 px, barre d'XP dégradée qui se remplit, chiffres
 * qui défilent, menus en groupes vitrés. Logique inchangée.
 */
/** Noms commerciaux des paliers — identiques dans toutes les langues. */
const PLAN_NAME: Record<Plan, string> = {
  free: 'YUMIA Free', plus: 'YUMIA Plus', gold: 'YUMIA Gold', diamond: 'YUMIA Diamond',
};

const AVATAR = 104;

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout, accessToken, updateProfile } = useAuth();
  const router = useRouter();
  const { t, locale } = useI18n();
  const { stats, passport, loading } = usePassportStats(accessToken);
  const unreadCount = useUnreadNotificationsCount();
  const [showLocalePicker, setShowLocalePicker] = useState(false);
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [showBadgesModal, setShowBadgesModal] = useState(false);
  const [showCountriesModal, setShowCountriesModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${API_BASE_URL}/admin/is-admin`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.ok ? r.json() : { isAdmin: false })
      .then((data: { isAdmin: boolean }) => setIsAdmin(data.isAdmin))
      .catch(() => {});
  }, [accessToken]);

  const displayName = user?.displayName ?? t('profile_you_fallback');
  const initial = displayName.charAt(0).toUpperCase();
  const plan = (user?.plan ?? 'free') as Plan;
  // `plan === 'plus'` excluait Gold et Diamond : un abonné Gold voyait
  // « YUMIA Free » et se faisait proposer Plus, tout en perdant les écrans
  // réservés aux payants.
  const isPaid = plan !== 'free';
  const nextTier = nextPaidPlan(plan);
  /** Les paliers strictement au-dessus de l'actuel, du moins cher au plus cher. */
  const PAID_TIERS: Exclude<Plan, 'free'>[] = [...SOLD_PLANS];
  const upgrades = nextTier ? PAID_TIERS.slice(PAID_TIERS.indexOf(nextTier)) : [];
  const photoUrl = user?.photoUrl
    ? user.photoUrl.startsWith('http') ? user.photoUrl : `${API_BASE_URL}${user.photoUrl}`
    : null;

  // Barre XP : se remplit au dégradé de marque.
  const xp = useSharedValue(0);
  useEffect(() => {
    if (!stats) return;
    xp.value = withTiming(stats.level.ratio, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [stats, xp]);
  const xpFillStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, xp.value)) * 100}%` }));

  const favoriteUniverses = user?.preferences?.favoriteUniverses ?? [];
  const restrictions = user?.preferences?.restrictions ?? [];
  const hasPrefs = favoriteUniverses.length > 0 || restrictions.length > 0;

  const share = () => {
    const levelLabel = stats ? `${stats.level.current.emoji} ${levelName(t, stats.level.current.value, stats.level.current.titleFr)}` : '';
    const visitsLabel = passport ? `${passport.totalVisits} ${t('profile_share_visits')}` : '';
    void Share.share({
      message: t('profile_share_message')
        .replace('{name}', displayName)
        .replace('{level}', levelLabel)
        .replace('{visits}', visitsLabel ? ' · ' + visitsLabel : ''),
    });
  };

  const menu = [
    { key: 'saved', icon: '🔖', label: t('profile_setting_saved'), onPress: () => router.push('/favorites' as never) },
    // Seul accès durable aux commandes : l'écran n'était atteint qu'une
    // fois, juste après le paiement.
    { key: 'orders', icon: '📦', label: t('profile_setting_orders'), onPress: () => router.push('/shop/orders' as never) },
    { key: 'locale', icon: '🌍', label: t('profile_setting_locale'), onPress: () => setShowLocalePicker(true) },
    { key: 'notifs', icon: '🔔', label: t('profile_setting_notifs'), onPress: () => router.push('/notifications') },
    { key: 'privacy', icon: '🔒', label: t('profile_setting_privacy'), onPress: () => router.push('/settings') },
    ...(isAdmin ? [{ key: 'admin', icon: '🛡️', label: t('profile_setting_admin'), onPress: () => router.push('/admin') }] : []),
    { key: 'share', icon: '📤', label: t('profile_setting_share'), onPress: share },
  ];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: spacing.xxl }}
      showsVerticalScrollIndicator={false}
    >
      {/* Barre du haut : logo, notifications, réglages */}
      <View style={styles.topBar}>
        <YumiaLogo height={40} />
        <View style={styles.topActions}>
          <GlassCircleButton label="🔔" badge={unreadCount} onPress={() => router.push('/notifications')} />
          <GlassCircleButton label="⚙️" onPress={() => router.push('/settings')} />
        </View>
      </View>

      {/* En-tête profil */}
      <Reveal index={0} style={styles.hero}>
        <PressableScale onPress={() => { haptics.select(); router.push('/edit-profile'); }} scaleTo={0.95}>
          <GradientRing size={AVATAR} thickness={3}>
            <Avatar
              uri={photoUrl}
              size={AVATAR - 10}
              placeholderColor={colors.surfaceElevated}
              fallback={<Text style={styles.avatarText}>{initial}</Text>}
            />
          </GradientRing>
          <View style={styles.editDot}>
            <BrandDot label="✎" size={30} />
          </View>
        </PressableScale>

        {/* Badge en vue séparée (pas dans le flux du Text) : sinon il
            chevauche une lettre en arabe. Taille 22 px, voulue petite. */}
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={2}>{displayName}</Text>
          <PlanBadgeIcon plan={user?.plan} size={22} />
        </View>
        {stats ? (
          <Text style={styles.handle}>
            {stats.level.current.emoji} {levelName(t, stats.level.current.value, stats.level.current.titleFr)}
          </Text>
        ) : null}
        {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}
      </Reveal>

      {/* Progression XP */}
      {stats ? (
        <Reveal index={1} style={styles.section}>
          <View style={[styles.xpCard, GLASS]}>
            <View style={styles.xpHeader}>
              <Text style={styles.xpLabel}>
                {t('profile_xp')} · {t('profile_level_prefix')} {stats.level.current.value}
              </Text>
              <Text style={styles.xpValue}>
                {stats.level.xpIntoLevel} / {stats.level.xpForNext} XP
              </Text>
            </View>
            <View style={styles.xpTrack}>
              <Animated.View style={[styles.xpFill, xpFillStyle]}>
                <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
              </Animated.View>
            </View>
            {stats.level.next ? (
              <Text style={styles.xpNext}>
                {t('profile_next_level')} {stats.level.next.emoji} {levelName(t, stats.level.next.value, stats.level.next.titleFr)}
              </Text>
            ) : (
              <Text style={styles.xpNext}>{t('profile_max_level')}</Text>
            )}
          </View>
        </Reveal>
      ) : null}

      {/* Stats gamification */}
      <Reveal index={2} style={styles.section}>
        <View style={styles.statsRow}>
          <StatBox
            label={t('profile_visits')}
            value={passport ? passport.totalVisits : null}
            placeholder={loading ? '…' : '-'}
            emoji="📍"
          />
          <StatBox
            label={t('profile_streak')}
            value={stats ? stats.streak.current : null}
            suffix="j"
            placeholder={loading ? '…' : '-'}
            emoji="🔥"
            onPress={stats ? () => setShowStreakModal(true) : undefined}
          />
          <StatBox
            label={t('profile_countries_label')}
            value={passport ? passport.distinctCountries : null}
            placeholder={loading ? '…' : '-'}
            emoji="🌍"
            onPress={passport && passport.visits.length > 0 ? () => setShowCountriesModal(true) : undefined}
          />
          <StatBox
            label={t('profile_badges_label')}
            value={stats ? stats.badges.earned.length : null}
            suffix={stats ? `/${stats.badges.total}` : ''}
            placeholder={loading ? '…' : '-'}
            emoji="🏅"
            onPress={stats ? () => setShowBadgesModal(true) : undefined}
          />
        </View>
      </Reveal>

      {stats && passport ? (
        <StreakModal
          visible={showStreakModal}
          onClose={() => setShowStreakModal(false)}
          stats={stats}
          visits={passport.visits}
          isPlus={isPaid}
        />
      ) : null}

      {stats ? (
        <BadgesModal
          visible={showBadgesModal}
          onClose={() => setShowBadgesModal(false)}
          earned={stats.badges.earned}
        />
      ) : null}

      {passport ? (
        <CountriesModal
          visible={showCountriesModal}
          onClose={() => setShowCountriesModal(false)}
          visits={passport.visits}
        />
      ) : null}

      {/* Visites récentes — frise reliée par un fil dégradé */}
      {passport && passport.visits.length > 0 ? (
        <Reveal index={3} style={styles.section}>
          <SectionLabel label={t('profile_recent_visits')} />
          <View style={[styles.timelineCard, GLASS]}>
            {passport.visits.slice(0, 8).map((v, i, arr) => {
              const meta = safeMeta(v.place.universe);
              const date = new Date(v.visitedAt);
              const label = date.toLocaleDateString(
                { fr: 'fr-FR', en: 'en-US', es: 'es-ES', pt: 'pt-PT', ar: 'ar-SA' }[locale] ?? 'fr-FR',
                { day: 'numeric', month: 'short' },
              );
              const last = i === arr.length - 1;
              return (
                <View key={v.id} style={styles.timelineItem}>
                  <View style={styles.timelineRail}>
                    <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.timelineDot} />
                    {last ? null : <View style={styles.timelineLine} />}
                  </View>
                  <View style={[styles.timelineBody, last && { paddingBottom: 0 }]}>
                    <Text style={styles.timelineName} numberOfLines={1}>
                      {meta?.emoji ?? '📍'} {v.place.name}
                    </Text>
                    <Text style={styles.timelineMeta}>
                      {v.place.city ?? v.place.countryCode} · {label} · <Text style={styles.timelineXp}>+{v.xpAwarded} XP</Text>
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Reveal>
      ) : null}

      {/* Abonnement */}
      <Reveal index={4} style={styles.section}>
        <SectionLabel label={t('settings_section_subscription')} />
        <BrandFrame innerStyle={styles.planInner}>
          <View style={styles.planBadgeBox}>
            <PlanBadgeIcon plan={plan} size={32} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.planTitle}>{PLAN_NAME[plan]}</Text>
            <Text style={styles.planSub}>
              {isPaid ? t('profile_plan_plus_sub') : t('profile_plan_free_sub')}
            </Text>
          </View>
        </BrandFrame>

        {/* TOUS les paliers au-dessus, pas seulement le suivant : quelqu'un
            qui envisage de payer compare, et n'a pas a monter marche par
            marche pour decouvrir ce qui existe. Ceux qu'on possede deja ou
            qui sont en dessous ne sont pas listes — ils ne leveraient rien.
            En Diamond, la liste est vide et la section s'arrete a la carte. */}
        {upgrades.length > 0 ? (
          <GlassGroup style={{ marginTop: spacing.sm }}>
            {upgrades.map((tier) => (
              <PressableScale key={tier} style={styles.tierRow} scaleTo={0.98} onPress={() => { haptics.select(); router.push('/plus'); }}>
                <PlanBadgeIcon plan={tier} size={26} />
                <Text style={styles.tierName}>{PLAN_NAME[tier]}</Text>
                <Text style={styles.tierPrice}>
                  {PLAN_PRICE_EUR[tier].toFixed(2).replace('.', ',')} €
                  <Text style={styles.tierPer}>{t('plus_per_month')}</Text>
                </Text>
                <Text style={styles.tierChevron}>{CHEVRON}</Text>
              </PressableScale>
            ))}
          </GlassGroup>
        ) : null}
      </Reveal>

      {/* Préférences & restrictions */}
      <Reveal index={5} style={styles.section}>
        <SectionLabel label={t('profile_universes')} />
        {hasPrefs ? (
          <View style={styles.chips}>
            {favoriteUniverses.map((u) => {
              const meta = safeMeta(u);
              return (
                <View key={u} style={[styles.chip, GLASS]}>
                  <Text style={styles.chipText}>{meta?.emoji} {universeLabel(t, u)}</Text>
                </View>
              );
            })}
            {restrictions.map((r) => (
              <View key={r} style={[styles.chip, styles.chipRestriction]}>
                <Text style={styles.chipText}>{r}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyPrefs}>{t('profile_empty_prefs')}</Text>
        )}
      </Reveal>

      {/* Réglages */}
      <Reveal index={6} style={styles.section}>
        <GlassGroup>
          {menu.map(({ key, icon, label, onPress }) => (
            <MenuRow key={key} icon={icon} label={label} onPress={onPress} />
          ))}
        </GlassGroup>
      </Reveal>

      <LocalePicker
        visible={showLocalePicker}
        currentLocale={user?.locale ?? 'fr'}
        onSelect={(code) => updateProfile({ locale: code })}
        onClose={() => setShowLocalePicker(false)}
      />

      {/* Déconnexion */}
      <Reveal index={7} style={styles.section}>
        <PressableScale style={styles.logoutBtn} onPress={() => void logout()} scaleTo={0.97}>
          <Text style={styles.logoutText}>{t('logout')}</Text>
        </PressableScale>
      </Reveal>
    </ScrollView>
  );
}

function StatBox({
  label,
  value,
  suffix = '',
  placeholder,
  emoji,
  onPress,
}: {
  label: string;
  /** `null` tant que la donnée n'est pas là : on affiche `placeholder`. */
  value: number | null;
  suffix?: string;
  placeholder: string;
  emoji: string;
  onPress?: () => void;
}) {
  return (
    <PressableScale
      style={[styles.statBox, GLASS]}
      onPress={onPress ? () => { haptics.select(); onPress(); } : undefined}
      disabled={!onPress}
      scaleTo={0.94}
    >
      <Text style={styles.statEmoji}>{emoji}</Text>
      {value === null ? (
        <Text style={styles.statValue}>{placeholder}</Text>
      ) : (
        <CountUp value={value} suffix={suffix} style={styles.statValue} />
      )}
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: spacing.md, marginBottom: spacing.lg },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, marginBottom: spacing.md,
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  hero: { alignItems: 'center', paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  avatarText: { ...typography.display, color: '#fff', fontSize: 40 },
  editDot: { position: 'absolute', bottom: 0, right: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: spacing.md },
  name: { color: colors.textPrimary, fontSize: 28, fontWeight: '900', letterSpacing: -0.6, textAlign: 'center', flexShrink: 1 },
  handle: { ...typography.body, color: colors.brandSoft, marginTop: 4, fontWeight: '700' },
  email: { ...typography.caption, color: colors.textMuted, marginTop: 2 },

  // XP
  xpCard: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  xpHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  xpLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  xpValue: { ...typography.caption, color: colors.textPrimary, fontWeight: '800', fontVariant: ['tabular-nums'] },
  xpTrack: {
    height: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: radius.pill, overflow: 'hidden',
  },
  xpFill: { height: '100%', borderRadius: radius.pill, overflow: 'hidden' },
  xpNext: { ...typography.caption, color: colors.textMuted },

  // Stats
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statBox: {
    flex: 1, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: 4,
    alignItems: 'center', gap: 4,
  },
  statEmoji: { fontSize: 20 },
  statValue: {
    color: colors.textPrimary, fontSize: 20, fontWeight: '900', textAlign: 'center',
    padding: 0, margin: 0, minWidth: 40, fontVariant: ['tabular-nums'],
  },
  statLabel: { ...typography.label, color: colors.textMuted, textAlign: 'center' },

  // Frise des visites
  timelineCard: { borderRadius: radius.lg, padding: spacing.md },
  timelineItem: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md },
  timelineRail: { width: 12, alignItems: 'center' },
  timelineDot: { width: 12, height: 12, borderRadius: 6, marginTop: 5 },
  timelineLine: { flex: 1, width: 2, borderRadius: 1, marginVertical: 3, backgroundColor: `${colors.brand}55` },
  timelineBody: { flex: 1, paddingBottom: spacing.md },
  timelineName: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  timelineMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  timelineXp: { color: colors.brandSoft, fontWeight: '800' },

  // Abonnement
  planInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  planBadgeBox: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  planTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '900', letterSpacing: -0.2 },
  planSub: { ...typography.caption, color: colors.textSecondary, marginTop: 3, lineHeight: 17 },
  tierRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 14, paddingHorizontal: spacing.md,
  },
  tierName: { ...typography.body, color: colors.textPrimary, fontWeight: '700', flex: 1 },
  tierPrice: { ...typography.body, color: colors.textPrimary, fontWeight: '800' },
  tierPer: { ...typography.caption, color: colors.textMuted, fontWeight: '500' },
  tierChevron: { color: colors.textMuted, fontSize: 22, fontWeight: '300', marginTop: -2 },

  // Préférences
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: spacing.md },
  // Restriction : liseré en pointillés, sans couleur supplémentaire.
  chipRestriction: {
    borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'transparent',
  },
  chipText: { ...typography.caption, color: colors.textPrimary, fontWeight: '600' },
  emptyPrefs: { ...typography.body, color: colors.textMuted },

  // Déconnexion (rouge fonctionnel)
  logoutBtn: {
    borderColor: `${colors.danger}88`, borderWidth: 1, borderRadius: radius.pill,
    paddingVertical: spacing.md, alignItems: 'center', backgroundColor: `${colors.danger}12`,
  },
  logoutText: { ...typography.heading, color: colors.danger },
});
