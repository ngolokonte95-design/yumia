import { useEffect, useRef, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, Animated, Share, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { PLAN_PRICE_EUR, type Plan } from '@yumia/shared';
import { nextPaidPlan } from '../../lib/constants/plan-limits';
import { safeMeta, universeLabel } from '../../lib/universeMeta';
import { colors, radius, spacing, typography } from '../../theme/tokens';
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

/** PROFIL — niveau XP animé, stats, visites récentes, préférences, paramètres. */
/** Noms commerciaux des paliers — identiques dans toutes les langues. */
const PLAN_NAME: Record<Plan, string> = {
  free: 'YUMIA Free', plus: 'YUMIA Plus', gold: 'YUMIA Gold', diamond: 'YUMIA Diamond',
};

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
  const PAID_TIERS: Exclude<Plan, 'free'>[] = ['plus', 'gold', 'diamond'];
  const upgrades = nextTier ? PAID_TIERS.slice(PAID_TIERS.indexOf(nextTier)) : [];
  const photoUrl = user?.photoUrl
    ? user.photoUrl.startsWith('http') ? user.photoUrl : `${API_BASE_URL}${user.photoUrl}`
    : null;

  // Barre XP animée
  const xpAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!stats) return;
    Animated.timing(xpAnim, {
      toValue: stats.level.ratio,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [stats, xpAnim]);

  const favoriteUniverses = user?.preferences?.favoriteUniverses ?? [];
  const restrictions = user?.preferences?.restrictions ?? [];
  const hasPrefs = favoriteUniverses.length > 0 || restrictions.length > 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxl }}
      showsVerticalScrollIndicator={false}
    >
      {/* Logo Yumia — bien visible */}
      <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
        <YumiaLogo height={110} />
      </View>

      {/* En-tête profil */}
      <View style={[styles.section, styles.header]}>
        <Pressable onPress={() => router.push('/edit-profile')}>
          <Avatar
            uri={photoUrl}
            size={64}
            borderWidth={photoUrl ? 2 : undefined}
            borderColor={colors.brand}
            placeholderColor={colors.brand}
            fallback={<Text style={styles.avatarText}>{initial}</Text>}
          />
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.name}>{displayName}</Text>
            <PlanBadgeIcon plan={user?.plan} size={42} />
          </View>
          {stats ? (
            <Text style={styles.handle}>
              {stats.level.current.emoji} {levelName(t, stats.level.current.value, stats.level.current.titleFr)}
            </Text>
          ) : null}
          {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}
        </View>
        {/* Actions rapides */}
        <View style={styles.headerActions}>
          <Pressable style={styles.bellBtn} onPress={() => router.push('/notifications')}>
            <Text style={styles.bell}>🔔</Text>
            {unreadCount > 0 ? (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable style={styles.settingsBtn} onPress={() => router.push('/settings')}>
            <Text style={styles.settingsIcon}>⚙️</Text>
          </Pressable>
        </View>
      </View>

      {/* Progression XP */}
      {stats ? (
        <View style={styles.section}>
          <View style={styles.xpCard}>
            <View style={styles.xpHeader}>
              <Text style={styles.xpLabel}>
                {t('profile_xp')} · {t('profile_level_prefix')} {stats.level.current.value}
              </Text>
              <Text style={styles.xpValue}>
                {stats.level.xpIntoLevel} / {stats.level.xpForNext} XP
              </Text>
            </View>
            <View style={styles.xpTrack}>
              <Animated.View
                style={[
                  styles.xpFill,
                  {
                    width: xpAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>
            {stats.level.next ? (
              <Text style={styles.xpNext}>
                {t('profile_next_level')} {stats.level.next.emoji} {levelName(t, stats.level.next.value, stats.level.next.titleFr)}
              </Text>
            ) : (
              <Text style={styles.xpNext}>{t('profile_max_level')}</Text>
            )}
          </View>
        </View>
      ) : null}

      {/* Stats gamification */}
      <View style={styles.section}>
        <View style={styles.statsRow}>
          <StatBox
            label={t('profile_visits')}
            value={passport?.totalVisits ?? (loading ? '…' : '-')}
            emoji="📍"
          />
          <StatBox
            label={t('profile_streak')}
            value={stats ? `${stats.streak.current}j` : (loading ? '…' : '-')}
            emoji="🔥"
            onPress={stats ? () => setShowStreakModal(true) : undefined}
          />
          <StatBox
            label={t('profile_countries_label')}
            value={passport?.distinctCountries ?? (loading ? '…' : '-')}
            emoji="🌍"
            onPress={passport && passport.visits.length > 0 ? () => setShowCountriesModal(true) : undefined}
          />
          <StatBox
            label={t('profile_badges_label')}
            value={stats ? `${stats.badges.earned.length}/${stats.badges.total}` : (loading ? '…' : '-')}
            emoji="🏅"
            onPress={stats ? () => setShowBadgesModal(true) : undefined}
          />
        </View>
      </View>

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

      {/* Visites récentes */}
      {passport && passport.visits.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile_recent_visits')}</Text>
          <View style={styles.timeline}>
            {passport.visits.slice(0, 8).map((v) => {
              const meta = safeMeta(v.place.universe);
              const date = new Date(v.visitedAt);
              const label = date.toLocaleDateString(
                { fr: 'fr-FR', en: 'en-US', es: 'es-ES', pt: 'pt-PT', ar: 'ar-SA' }[locale] ?? 'fr-FR',
                { day: 'numeric', month: 'short' },
              );
              return (
                <View key={v.id} style={styles.timelineItem}>
                  <View style={styles.timelineDot} />
                  <View style={styles.timelineBody}>
                    <Text style={styles.timelineName} numberOfLines={1}>
                      {meta?.emoji ?? '📍'} {v.place.name}
                    </Text>
                    <Text style={styles.timelineMeta}>
                      {v.place.city ?? v.place.countryCode} · {label} · +{v.xpAwarded} XP
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Abonnement */}
      <View style={styles.section}>
        <View style={styles.planCard}>
          <PlanBadgeIcon plan={plan} size={32} />
          <View style={{ flex: 1 }}>
            <Text style={styles.planTitle}>{PLAN_NAME[plan]}</Text>
            <Text style={styles.planSub}>
              {isPaid ? t('profile_plan_plus_sub') : t('profile_plan_free_sub')}
            </Text>
          </View>
        </View>

        {/* TOUS les paliers au-dessus, pas seulement le suivant : quelqu'un
            qui envisage de payer compare, et n'a pas a monter marche par
            marche pour decouvrir ce qui existe. Ceux qu'on possede deja ou
            qui sont en dessous ne sont pas listes — ils ne leveraient rien.
            En Diamond, la liste est vide et la section s'arrete a la carte. */}
        {upgrades.map((tier) => (
          <Pressable key={tier} style={styles.tierRow} onPress={() => router.push('/plus')}>
            <PlanBadgeIcon plan={tier} size={26} />
            <Text style={styles.tierName}>{PLAN_NAME[tier]}</Text>
            <Text style={styles.tierPrice}>
              {PLAN_PRICE_EUR[tier].toFixed(2).replace('.', ',')} €
              <Text style={styles.tierPer}>{t('plus_per_month')}</Text>
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Préférences & restrictions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile_universes')}</Text>
        {hasPrefs ? (
          <View style={styles.chips}>
            {favoriteUniverses.map((u) => {
              const meta = safeMeta(u);
              return (
                <View key={u} style={styles.chip}>
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
      </View>

      {/* Réglages */}
      <View style={styles.section}>
        {[
          { key: 'saved', label: t('profile_setting_saved'), onPress: () => router.push('/favorites' as never) },
          { key: 'locale', label: t('profile_setting_locale'), onPress: () => setShowLocalePicker(true) },
          { key: 'notifs', label: t('profile_setting_notifs'), onPress: () => router.push('/notifications') },
          { key: 'privacy', label: t('profile_setting_privacy'), onPress: () => router.push('/settings') },
          ...(isAdmin ? [{ key: 'admin', label: t('profile_setting_admin'), onPress: () => router.push('/admin') }] : []),
          {
            key: 'share',
            label: t('profile_setting_share'),
            onPress: () => {
              const levelLabel = stats ? `${stats.level.current.emoji} ${levelName(t, stats.level.current.value, stats.level.current.titleFr)}` : '';
              const visitsLabel = passport ? `${passport.totalVisits} ${t('profile_share_visits')}` : '';
              void Share.share({
                message: t('profile_share_message')
                  .replace('{name}', displayName)
                  .replace('{level}', levelLabel)
                  .replace('{visits}', visitsLabel ? ' · ' + visitsLabel : ''),
              });
            },
          },
        ].map(({ key, label, onPress }) => (
          <Pressable key={key} style={styles.settingRow} onPress={onPress}>
            <Text style={styles.settingLabel}>{label}</Text>
            <Text style={styles.settingChevron}>›</Text>
          </Pressable>
        ))}
      </View>

      <LocalePicker
        visible={showLocalePicker}
        currentLocale={user?.locale ?? 'fr'}
        onSelect={(code) => updateProfile({ locale: code })}
        onClose={() => setShowLocalePicker(false)}
      />

      {/* Déconnexion */}
      <View style={styles.section}>
        <Pressable style={styles.logoutBtn} onPress={() => void logout()}>
          <Text style={styles.logoutText}>{t('logout')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function StatBox({
  label,
  value,
  emoji,
  onPress,
}: {
  label: string;
  value: string | number;
  emoji: string;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.statBox} onPress={onPress} disabled={!onPress}>
      <Text style={styles.statEmoji}>{emoji}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: spacing.md, marginBottom: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: colors.brand,
  },
  avatarText: { ...typography.display, color: '#fff' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  bellBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  settingsBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  settingsIcon: { fontSize: 22 },
  bell: { fontSize: 22 },
  bellBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: colors.danger,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  bellBadgeText: { fontSize: 9, color: '#fff', fontWeight: '700' },
  name: { ...typography.title, color: colors.textPrimary },
  handle: { ...typography.body, color: colors.brandSoft, marginTop: 2 },
  email: { ...typography.caption, color: colors.textMuted, marginTop: 2 },

  // XP
  xpCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  xpHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  xpLabel: { ...typography.caption, color: colors.textSecondary },
  xpValue: { ...typography.caption, color: colors.brandSoft },
  xpTrack: {
    height: 8,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
  },
  xpNext: { ...typography.caption, color: colors.textMuted },

  // Stats
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center',
    gap: 4,
  },
  statEmoji: { fontSize: 22 },
  statValue: { ...typography.heading, color: colors.textPrimary },
  statLabel: { ...typography.label, color: colors.textMuted, textAlign: 'center' },

  // Timeline
  sectionTitle: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.md },
  timeline: { gap: 0 },
  timelineItem: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand,
    marginTop: 7,
    flexShrink: 0,
  },
  timelineBody: {
    flex: 1,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  timelineName: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  timelineMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },

  // Plan
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  planTitle: { ...typography.heading, color: colors.textPrimary },
  planSub: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  tierRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  tierName: { ...typography.label, color: colors.textPrimary, flex: 1 },
  tierPrice: { ...typography.label, color: colors.textPrimary },
  tierPer: { ...typography.caption, color: colors.textMuted },

  // Préférences
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  chipRestriction: { borderWidth: 1, borderColor: colors.warning },
  chipText: { ...typography.caption, color: colors.textPrimary },
  emptyPrefs: { ...typography.body, color: colors.textMuted },

  // Réglages
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  settingLabel: { ...typography.body, color: colors.textPrimary },
  settingChevron: { ...typography.title, color: colors.textMuted },

  // Logout
  logoutBtn: {
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  logoutText: { ...typography.heading, color: colors.danger },
});
