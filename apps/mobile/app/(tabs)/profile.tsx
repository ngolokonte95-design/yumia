import { useEffect, useRef, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, Animated, Share, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { PLUS_PRICE_EUR, UNIVERSE_META } from '@yumia/shared';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { useAuth } from '../../lib/auth-context';
import { API_BASE_URL } from '../../lib/config';
import { useI18n } from '../../lib/useI18n';
import { usePassportStats } from '../../lib/usePassportStats';
import { useNotificationHistory } from '../../lib/useNotificationHistory';
import { LocalePicker } from '../../components/LocalePicker';
import { StreakModal } from '../../components/StreakModal';
import { BadgesModal } from '../../components/BadgesModal';
import { CountriesModal } from '../../components/CountriesModal';

/** PROFIL — niveau XP animé, stats, visites récentes, préférences, paramètres. */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout, accessToken, updateProfile } = useAuth();
  const router = useRouter();
  const { t } = useI18n();
  const { stats, passport, loading } = usePassportStats(accessToken);
  const { unreadCount } = useNotificationHistory();
  const [showLocalePicker, setShowLocalePicker] = useState(false);
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [showBadgesModal, setShowBadgesModal] = useState(false);
  const [showCountriesModal, setShowCountriesModal] = useState(false);

  const displayName = user?.displayName ?? 'Toi';
  const initial = displayName.charAt(0).toUpperCase();
  const isPlus = user?.plan === 'plus';
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
      {/* En-tête profil */}
      <View style={[styles.section, styles.header]}>
        <Pressable onPress={() => router.push('/edit-profile')}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          )}
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{displayName}</Text>
          {stats ? (
            <Text style={styles.handle}>
              {stats.level.current.emoji} {stats.level.current.titleFr}
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
                {t('profile_xp')} · Niveau {stats.level.current.value}
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
                Prochain niveau : {stats.level.next.emoji} {stats.level.next.titleFr}
              </Text>
            ) : (
              <Text style={styles.xpNext}>Niveau max atteint 🏆</Text>
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
            label="Pays"
            value={passport?.distinctCountries ?? (loading ? '…' : '-')}
            emoji="🌍"
            onPress={passport && passport.visits.length > 0 ? () => setShowCountriesModal(true) : undefined}
          />
          <StatBox
            label="Badges"
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
          isPlus={isPlus}
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
          <Text style={styles.sectionTitle}>Visites récentes</Text>
          <View style={styles.timeline}>
            {passport.visits.slice(0, 8).map((v) => {
              const meta = UNIVERSE_META[v.place.universe as keyof typeof UNIVERSE_META];
              const date = new Date(v.visitedAt);
              const label = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
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
          <View style={{ flex: 1 }}>
            <Text style={styles.planTitle}>{isPlus ? 'YUMIA Plus' : 'YUMIA Free'}</Text>
            <Text style={styles.planSub}>
              {isPlus ? 'Merci de soutenir YUMIA 🧡' : '90 % des fonctionnalités, sans frustration.'}
            </Text>
          </View>
          {!isPlus ? (
            <Pressable style={styles.upgradeBtn} onPress={() => router.push('/plus')}>
              <Text style={styles.upgradeText}>Plus · {PLUS_PRICE_EUR.toFixed(2)} €</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Préférences & restrictions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile_universes')}</Text>
        {hasPrefs ? (
          <View style={styles.chips}>
            {favoriteUniverses.map((u) => {
              const meta = UNIVERSE_META[u];
              return (
                <View key={u} style={styles.chip}>
                  <Text style={styles.chipText}>{meta?.emoji} {meta?.labelFr}</Text>
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
          { key: 'saved', label: '🤍 Mes adresses sauvegardées', onPress: () => router.push('/saved') },
          { key: 'locale', label: '🌐 Langue & région', onPress: () => setShowLocalePicker(true) },
          { key: 'notifs', label: '🔔 Notifications', onPress: () => router.push('/notifications') },
          { key: 'privacy', label: '🔒 Confidentialité', onPress: () => router.push('/settings') },
          {
            key: 'share',
            label: '📤 Partager mon profil',
            onPress: () => {
              const levelLabel = stats ? `${stats.level.current.emoji} ${stats.level.current.titleFr}` : '';
              const visitsLabel = passport ? `${passport.totalVisits} visites` : '';
              void Share.share({
                message: `Je suis ${displayName} sur YUMIA !\n${levelLabel}${visitsLabel ? ' · ' + visitsLabel : ''}\nRejoins-moi et découvre les meilleures expériences autour de toi.`,
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
  upgradeBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  upgradeText: { ...typography.label, color: '#fff' },

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
