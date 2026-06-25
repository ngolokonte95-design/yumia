import { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, ActivityIndicator, RefreshControl, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BADGES, BADGE_META, UNIVERSE_META, isUniverse } from '@yumia/shared';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { useAuth } from '../../lib/auth-context';
import { usePassport } from '../../lib/usePassport';
import { freezeStreak } from '../../lib/passport-api';
import { ActivityHeatmap } from '../../components/ActivityHeatmap';
import { usePlanLimits } from '../../lib/usePlanLimits';
import { FREE_LIMITS } from '../../lib/constants/plan-limits';
import type { UniverseCount } from '../../lib/passport-api';

/**
 * PASSEPORT YUMIA — mémoire gamifiée : stats, badges, carte du monde.
 * Moteur de rétention long terme (section 5.4 du PRD). Branché sur /passport.
 */
export default function PassportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const { stats, passport, heatmap, universeBreakdown, loading, error, reload } = usePassport();
  const { isPremium } = usePlanLimits();
  const [freezing, setFreezing] = useState(false);
  const passportFull = !isPremium && (passport?.totalVisits ?? 0) >= FREE_LIMITS.passportMaxEntries;

  const level = stats?.level.current;
  const earned = new Set<string>(stats?.badges.earned ?? []);
  async function handleFreeze() {
    if (!accessToken) return;
    setFreezing(true);
    try {
      const result = await freezeStreak(accessToken);
      Alert.alert(
        '🧊 Streak protégé !',
        `Ton streak est maintenu pour aujourd\'hui. Il te reste ${result.freezesLeft} freeze${result.freezesLeft > 1 ? 's' : ''}.`,
      );
      reload();
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Impossible d\'utiliser le freeze.');
    } finally {
      setFreezing(false);
    }
  }

  const statCards = [
    { label: 'Lieux', value: String(passport?.totalVisits ?? 0) },
    { label: 'Univers', value: String(passport?.distinctUniverses ?? 0) },
    { label: 'Pays', value: String(passport?.distinctCountries ?? 0) },
    { label: 'Streak', value: `${stats?.streak.current ?? 0} 🔥` },
  ];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxl }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.brand} />
      }
    >
      {passportFull ? (
        <Pressable
          style={styles.passportFullBanner}
          onPress={() => router.push('/(premium)' as never)}
        >
          <Text style={styles.passportFullEmoji}>👑</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.passportFullTitle}>Passeport plein ({FREE_LIMITS.passportMaxEntries} visites)</Text>
            <Text style={styles.passportFullSub}>Passe en Premium pour une mémoire illimitée → 2.99€/mois</Text>
          </View>
          <Text style={styles.passportFullArrow}>›</Text>
        </Pressable>
      ) : null}

      <View style={styles.section}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Passeport YUMIA</Text>
            {level ? (
              <Text style={styles.levelLine}>
                {level.emoji} {level.titleFr} · {stats?.totalXp} XP
              </Text>
            ) : (
              <Text style={styles.levelLine}>Ton aventure commence…</Text>
            )}
          </View>
          <Pressable style={styles.leaderboardBtn} onPress={() => router.push('/leaderboard')}>
            <Text style={styles.leaderboardText}>🏆 Classement</Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <View style={styles.section}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading && !stats ? (
        <View style={styles.section}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : null}

      {/* Progression de niveau */}
      {stats?.level.next ? (
        <View style={styles.section}>
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${Math.round(stats.level.ratio * 100)}%` }]}
            />
          </View>
          <Text style={styles.progressHint}>
            {stats.level.xpIntoLevel} / {stats.level.xpForNext} XP vers {stats.level.next.emoji}{' '}
            {stats.level.next.titleFr}
          </Text>
        </View>
      ) : null}

      {/* Stats */}
      <View style={[styles.section, styles.statsRow]}>
        {statCards.map((s) => (
          <View key={s.label} style={styles.statCard}>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Raccourci vers l'historique complet */}
      <View style={[styles.section, { marginTop: 0 }]}>
        <Pressable style={styles.historyBtn} onPress={() => router.push('/visits')}>
          <Text style={styles.historyIcon}>🗺️</Text>
          <Text style={styles.historyLabel}>Voir mes visites</Text>
          <Text style={styles.historyChevron}>›</Text>
        </Pressable>
      </View>

      {/* Freeze de streak (YUMIA Plus) */}
      {user?.plan === 'plus' && (stats?.streak.freezesLeft ?? 0) > 0 && (stats?.streak.current ?? 0) > 0 ? (
        <View style={[styles.section, { marginTop: 0 }]}>
          <Pressable
            style={[styles.freezeBtn, freezing && styles.freezeBtnDisabled]}
            onPress={handleFreeze}
            disabled={freezing}
          >
            {freezing ? (
              <ActivityIndicator color={colors.brand} size="small" />
            ) : (
              <>
                <Text style={styles.freezeIcon}>🧊</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.freezeTitle}>Protéger mon streak</Text>
                  <Text style={styles.freezeSub}>
                    {stats?.streak.freezesLeft} freeze{(stats?.streak.freezesLeft ?? 0) > 1 ? 's' : ''} disponible{(stats?.streak.freezesLeft ?? 0) > 1 ? 's' : ''}
                  </Text>
                </View>
              </>
            )}
          </Pressable>
        </View>
      ) : null}

      {/* Heatmap d'activité (90 jours) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Activité</Text>
        <View style={styles.heatmapCard}>
          <ActivityHeatmap data={heatmap} />
        </View>
      </View>

      {/* Universe breakdown */}
      {universeBreakdown.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Univers explorés</Text>
          <View style={styles.universeList}>
            {universeBreakdown.slice(0, 5).map((item) => (
              <UniverseBar key={item.universe} item={item} max={universeBreakdown[0].count} />
            ))}
          </View>
        </View>
      ) : null}

      {/* Badges */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Badges · {earned.size}/{BADGES.length}
        </Text>
        <View style={styles.badgeGrid}>
          {BADGES.map((b) => {
            const isEarned = earned.has(b);
            return (
              <View key={b} style={[styles.badge, !isEarned && styles.badgeLocked]}>
                <Text style={[styles.badgeEmoji, !isEarned && styles.badgeLockedEmoji]}>
                  {BADGE_META[b].emoji}
                </Text>
                <Text style={styles.badgeName} numberOfLines={1}>
                  {BADGE_META[b].nameFr}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

function UniverseBar({ item, max }: { item: UniverseCount; max: number }) {
  const meta = isUniverse(item.universe) ? UNIVERSE_META[item.universe] : null;
  const ratio = max > 0 ? item.count / max : 0;
  return (
    <View style={univStyles.row}>
      <Text style={univStyles.emoji}>{meta?.emoji ?? '📍'}</Text>
      <View style={{ flex: 1 }}>
        <View style={univStyles.track}>
          <View style={[univStyles.fill, { width: `${Math.round(ratio * 100)}%` }]} />
        </View>
      </View>
      <Text style={univStyles.count}>{item.count}</Text>
    </View>
  );
}

const univStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  emoji: { fontSize: 18, width: 24, textAlign: 'center' },
  track: {
    flex: 1,
    height: 8,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: { height: 8, backgroundColor: colors.brand, borderRadius: radius.pill },
  count: { ...typography.label, color: colors.textMuted, width: 28, textAlign: 'right' },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: spacing.md, marginBottom: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  title: { ...typography.display, color: colors.textPrimary },
  levelLine: { ...typography.body, color: colors.brandSoft, marginTop: 4 },
  leaderboardBtn: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  leaderboardText: { ...typography.caption, color: colors.textPrimary },
  errorText: { ...typography.body, color: colors.danger },
  progressTrack: {
    height: 8,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: { height: 8, backgroundColor: colors.brand, borderRadius: radius.pill },
  progressHint: { ...typography.caption, color: colors.textMuted, marginTop: 6 },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  statValue: { ...typography.title, color: colors.textPrimary },
  statLabel: { ...typography.label, color: colors.textMuted },
  heatmapCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  sectionTitle: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.md },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: {
    width: '23%',
    aspectRatio: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 4,
  },
  badgeLocked: { opacity: 0.35 },
  badgeEmoji: { fontSize: 26 },
  badgeLockedEmoji: { opacity: 0.6 },
  badgeName: { ...typography.label, color: colors.textSecondary, textAlign: 'center' },
  universeList: { gap: spacing.sm },
  freezeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: `${colors.brand}12`,
    borderWidth: 1,
    borderColor: `${colors.brand}40`,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  freezeBtnDisabled: { opacity: 0.5 },
  freezeIcon: { fontSize: 24 },
  freezeTitle: { ...typography.body, color: colors.brandSoft, fontWeight: '700' },
  freezeSub: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  passportFullBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#7C3AED18',
    borderColor: '#7C3AED',
    borderWidth: 1,
    borderRadius: radius.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  passportFullEmoji: { fontSize: 24 },
  passportFullTitle: { ...typography.body, color: '#C4B5FD', fontWeight: '700' },
  passportFullSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  passportFullArrow: { ...typography.title, color: '#7C3AED', lineHeight: 22 },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  historyIcon: { fontSize: 20 },
  historyLabel: { ...typography.body, color: colors.textPrimary, flex: 1, fontWeight: '600' },
  historyChevron: { ...typography.title, color: colors.textMuted },
});
