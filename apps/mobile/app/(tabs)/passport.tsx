/**
 * PASSEPORT YUMIA — mémoire gamifiée : stats, badges, pays, univers.
 * Moteur de rétention long terme (section 5.4 du PRD). Branché sur /passport.
 *
 * Mise en scène (17/11/2026) : couverture de passeport animée (niveau, XP qui
 * défile, progression), stats en tuiles vitrées, tampons des pays visités,
 * univers aux couleurs de leur catégorie, badges en médaillons. Uniquement
 * les données renvoyées par l'API — rien d'inventé.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, ZoomIn, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { BADGES, BADGE_META } from '@yumia/shared';
import { colors, gradients, motion, radius, spacing, typography } from '../../theme/tokens';
import { useAuth } from '../../lib/auth-context';
import { usePassport } from '../../lib/usePassport';
import { freezeStreak } from '../../lib/passport-api';
import { ActivityHeatmap } from '../../components/ActivityHeatmap';
import { usePlanLimits } from '../../lib/usePlanLimits';
import { useI18n } from '../../lib/useI18n';
import type { TranslationKey } from '../../lib/translations';
import { badgeCondition, badgeName, levelName } from '../../lib/labelHelpers';
import type { UniverseCount } from '../../lib/passport-api';
import { FeatureTip } from '../../components/FeatureTip';
import { AnimatedNumber, PressableScale, Reveal } from '../../components/ui';
import { UniverseGlyph } from '../../components/UniverseGlyph';
import { universeGradient } from '../../lib/universeTheme';
import { universeLabel } from '../../lib/universeMeta';
import { PassportCover } from '../../components/passport/PassportCover';
import { BadgeGrid } from '../../components/passport/BadgeGrid';
import { haptics } from '../../lib/useHaptics';

/** Drapeau emoji d'un code pays ISO (« FR » → 🇫🇷) ; null si code invalide. */
function flagOf(code: string | null | undefined): string | null {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;
  return String.fromCodePoint(...code.toUpperCase().split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export default function PassportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const { t } = useI18n();
  const { stats, passport, heatmap, universeBreakdown, loading, error, reload } = usePassport();
  const { getLimit } = usePlanLimits();
  const [freezing, setFreezing] = useState(false);
  const passportFull = (passport?.totalVisits ?? 0) >= getLimit('passportMaxEntries');

  // Les animations en boucle de la couverture ne tournent qu'onglet affiché.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const level = stats?.level.current;
  const earned = new Set<string>(stats?.badges.earned ?? []);
  async function handleFreeze() {
    if (!accessToken) return;
    setFreezing(true);
    try {
      const result = await freezeStreak(accessToken);
      haptics.success();
      Alert.alert(
        t('passport_freeze_alert_title'),
        t('passport_freeze_alert_body')
          .replace('{n}', String(result.freezesLeft))
          .replace('{s}', result.freezesLeft > 1 ? 's' : ''),
      );
      reload();
    } catch (err) {
      Alert.alert(t('passport_freeze_error_title'), err instanceof Error ? err.message : t('passport_freeze_error_generic'));
    } finally {
      setFreezing(false);
    }
  }

  const statTiles = [
    { key: 'places', emoji: '📍', label: t('stat_places'), value: passport?.totalVisits ?? 0, tint: colors.brand },
    { key: 'universes', emoji: '🌐', label: t('stat_universes'), value: passport?.distinctUniverses ?? 0, tint: colors.accent },
    { key: 'countries', emoji: '✈️', label: t('stat_countries'), value: passport?.distinctCountries ?? 0, tint: colors.success },
    { key: 'streak', emoji: '🔥', label: t('stat_streak'), value: stats?.streak.current ?? 0, tint: colors.warning },
  ];

  // Tampons : pays présents dans les visites renvoyées, du plus récent au plus ancien.
  const stamps: { code: string; flag: string }[] = [];
  for (const v of passport?.visits ?? []) {
    const code = v.place.countryCode?.toUpperCase();
    const flag = flagOf(code);
    if (code && flag && !stamps.some((s) => s.code === code)) stamps.push({ code, flag });
  }

  const progressHint = stats?.level.next
    ? `${stats.level.xpIntoLevel} / ${stats.level.xpForNext} XP ${t('passport_xp_toward')} ${stats.level.next.emoji} ${levelName(t, stats.level.next.level, stats.level.next.titleFr)}`
    : null;

  const badgeItems = BADGES.map((b) => ({
    key: b,
    emoji: BADGE_META[b].emoji,
    name: badgeName(t, b, BADGE_META[b].nameFr),
    condition: badgeCondition(t, b, BADGE_META[b].conditionFr),
    earned: earned.has(b),
  }));

  const showFreeze = !!user?.plan && user.plan !== 'free'
    && (stats?.streak.freezesLeft ?? 0) > 0 && (stats?.streak.current ?? 0) > 0;

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxl }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.brand} />}
      >
        {/* ── Couverture ─────────────────────────────────────────────── */}
        <Reveal index={0} style={styles.section}>
          <PassportCover
            active={focused}
            title={t('passport_title')}
            holder={user?.displayName}
            level={level ? { emoji: level.emoji, name: levelName(t, level.level, level.titleFr) } : null}
            journeyStart={t('passport_journey_start')}
            totalXp={stats?.totalXp ?? 0}
            ratio={stats?.level.next ? stats.level.ratio : null}
            progressHint={progressHint}
            leaderboardLabel={t('passport_leaderboard')}
            onLeaderboard={() => router.push('/leaderboard')}
          />
        </Reveal>

        {passportFull ? (
          <Reveal index={1} style={styles.section}>
            <PressableScale style={styles.fullBanner} onPress={() => router.push('/plus' as never)}>
              <LinearGradient colors={gradients.shop} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <Text style={styles.fullEmoji}>👑</Text>
              <View style={styles.flex}>
                <Text style={styles.fullTitle}>
                  {t('passport_full_title')} ({getLimit('passportMaxEntries')} {t('passport_full_visits')})
                </Text>
                <Text style={styles.fullSub}>{t('passport_full_sub')}</Text>
              </View>
              <Text style={styles.fullArrow}>›</Text>
            </PressableScale>
          </Reveal>
        ) : null}

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

        {/* ── Stats en tuiles vitrées ────────────────────────────────── */}
        <View style={[styles.section, styles.statsGrid]}>
          {statTiles.map((s, i) => (
            <Reveal key={s.key} index={i + 1} style={styles.statCell}>
              <View style={[styles.statTile, { borderColor: `${s.tint}55` }]}>
                <LinearGradient colors={[`${s.tint}40`, `${s.tint}08`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <Text style={styles.statEmoji}>{s.emoji}</Text>
                <AnimatedNumber value={s.value} style={styles.statValue} />
                <Text style={styles.statLabel} numberOfLines={1}>{s.label}</Text>
              </View>
            </Reveal>
          ))}
        </View>

        {/* ── Actions : historique + protection du streak ────────────── */}
        <View style={[styles.section, styles.actions]}>
          <PressableScale style={styles.actionCard} onPress={() => router.push('/visits')}>
            <LinearGradient colors={gradients.brandSoft} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Text style={styles.actionIcon}>🗺️</Text>
            <Text style={styles.actionLabel} numberOfLines={2}>{t('passport_see_visits')}</Text>
            <Text style={styles.actionChevron}>›</Text>
          </PressableScale>

          {showFreeze ? (
            <PressableScale style={[styles.actionCard, freezing && styles.disabled]} onPress={handleFreeze} disabled={freezing}>
              <LinearGradient colors={gradients.weatherSnow} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.iceTint]} />
              {freezing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={styles.actionIcon}>🧊</Text>
                  <View style={styles.flex}>
                    <Text style={styles.actionLabel}>{t('passport_protect_streak')}</Text>
                    <Text style={styles.actionSub}>
                      {stats?.streak.freezesLeft} {t('passport_freezes_available')
                        .replace('{s}', (stats?.streak.freezesLeft ?? 0) > 1 ? 's' : '')
                        .replace('{s2}', (stats?.streak.freezesLeft ?? 0) > 1 ? 's' : '')}
                    </Text>
                  </View>
                </>
              )}
            </PressableScale>
          ) : null}
        </View>

        {/* ── Tampons des pays ───────────────────────────────────────── */}
        {stamps.length > 0 ? (
          <View style={styles.block}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{t('passport_stamps_title' as TranslationKey)}</Text>
              <Text style={styles.sectionCount}>{passport?.distinctCountries ?? stamps.length}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stampsRow}>
              {stamps.map((s, i) => (
                <Animated.View
                  key={s.code}
                  entering={ZoomIn.duration(motion.duration.normal).delay(i * 70)}
                  style={[styles.stamp, { transform: [{ rotate: i % 2 ? '7deg' : '-8deg' }] }]}
                >
                  <View style={styles.stampInner}>
                    <Text style={styles.stampFlag}>{s.flag}</Text>
                    <Text style={styles.stampCode}>{s.code}</Text>
                  </View>
                </Animated.View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* ── Activité (90 jours) ────────────────────────────────────── */}
        <Reveal index={2} style={styles.section}>
          <Text style={[styles.sectionTitle, styles.titleSpaced]}>{t('passport_activity')}</Text>
          <View style={styles.glassCard}>
            <ActivityHeatmap data={heatmap} />
          </View>
        </Reveal>

        {/* ── Univers explorés ───────────────────────────────────────── */}
        {universeBreakdown.length > 0 ? (
          <Reveal index={3} style={styles.section}>
            <Text style={[styles.sectionTitle, styles.titleSpaced]}>{t('passport_universes_explored')}</Text>
            <View style={[styles.glassCard, styles.universeList]}>
              {universeBreakdown.slice(0, 5).map((item, i) => (
                <UniverseBar key={item.universe} item={item} index={i} label={universeLabel(t, item.universe)} />
              ))}
            </View>
          </Reveal>
        ) : null}

        {/* ── Badges ─────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={[styles.sectionHead, styles.noPad]}>
            <Text style={styles.sectionTitle}>{t('passport_badges')}</Text>
            <Text style={styles.sectionCount}>{earned.size}/{BADGES.length}</Text>
          </View>
          <BadgeGrid
            badges={badgeItems}
            earnedLabel={t('passport_badge_earned' as TranslationKey)}
            lockedLabel={t('passport_badge_locked' as TranslationKey)}
            tapHint={t('passport_badge_tap_hint' as TranslationKey)}
          />
        </View>
      </ScrollView>
      <FeatureTip feature="passport" />
    </>
  );
}

// Échelle FIXE (pas relative à ton propre univers le plus visité) — avec une
// échelle relative, un seul univers visité remplissait toujours la barre à
// 100 % dès la première visite, ce qui ressemblait à un bug.
const UNIVERSE_BAR_SCALE = 15;

function UniverseBar({ item, index, label }: { item: UniverseCount; index: number; label: string }) {
  const ratio = Math.min(1, item.count / UNIVERSE_BAR_SCALE);
  const grad = universeGradient(item.universe);

  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withDelay(200 + index * 120, withTiming(ratio, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [ratio, index, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <View style={univStyles.row}>
      <View style={[univStyles.icon, { borderColor: `${grad[1]}88` }]}>
        <LinearGradient colors={[`${grad[1]}55`, `${grad[0]}22`]} style={StyleSheet.absoluteFill} />
        <UniverseGlyph u={item.universe} size={20} />
      </View>
      <View style={univStyles.body}>
        <View style={univStyles.labelRow}>
          <Text style={univStyles.label} numberOfLines={1}>{label}</Text>
          <Text style={univStyles.count}>{item.count}</Text>
        </View>
        {/* Rangée : le remplissage part du début de ligne, à gauche en LTR, à droite en RTL. */}
        <View style={univStyles.track}>
          <Animated.View style={[univStyles.fill, fillStyle]}>
            <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const univStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: 40, height: 40, borderRadius: 14, overflow: 'hidden', borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { flex: 1, gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  label: { ...typography.body, color: colors.textPrimary, fontWeight: '700', flex: 1 },
  count: { ...typography.caption, color: colors.textSecondary, fontWeight: '800' },
  track: {
    height: 8, borderRadius: radius.pill, overflow: 'hidden', flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
  },
  fill: { height: '100%', borderRadius: radius.pill, overflow: 'hidden' },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  section: { paddingHorizontal: spacing.md, marginBottom: spacing.lg },
  block: { marginBottom: spacing.lg },
  sectionHead: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, marginBottom: spacing.md, gap: spacing.sm,
  },
  noPad: { paddingHorizontal: 0 },
  sectionTitle: { fontSize: 22, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.4 },
  titleSpaced: { marginBottom: spacing.md },
  sectionCount: { ...typography.body, color: colors.brandSoft, fontWeight: '800' },
  errorText: { ...typography.body, color: colors.danger },

  // Bannière « passeport plein »
  fullBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md,
    borderRadius: radius.lg, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)',
  },
  fullEmoji: { fontSize: 26 },
  fullTitle: { ...typography.body, color: '#fff', fontWeight: '800' },
  fullSub: { ...typography.caption, color: 'rgba(255,255,255,0.82)', marginTop: 2 },
  fullArrow: { ...typography.title, color: '#fff' },

  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statCell: { width: '48.5%' },
  statTile: {
    borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1,
    backgroundColor: colors.surface, padding: spacing.md, gap: 2,
  },
  statEmoji: { fontSize: 22, marginBottom: 4 },
  statValue: { color: colors.textPrimary, fontSize: 30, fontWeight: '900', letterSpacing: -0.5 },
  statLabel: { ...typography.label, color: colors.textSecondary, fontSize: 12 },

  // Actions
  actions: { gap: spacing.sm },
  actionCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderRadius: radius.lg, overflow: 'hidden', padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)',
  },
  iceTint: { opacity: 0.55 },
  disabled: { opacity: 0.5 },
  actionIcon: { fontSize: 24 },
  actionLabel: { ...typography.body, color: colors.textPrimary, fontWeight: '800', flex: 1 },
  actionSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  actionChevron: { ...typography.title, color: colors.textSecondary },

  // Tampons
  stampsRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.md },
  stamp: {
    width: 86, height: 86, borderRadius: 43, padding: 4,
    borderWidth: 2, borderColor: colors.brandSoft,
  },
  stampInner: {
    flex: 1, borderRadius: 40, borderWidth: 1.5, borderStyle: 'dashed', borderColor: `${colors.brandSoft}AA`,
    alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.brand}14`,
  },
  stampFlag: { fontSize: 32 },
  stampCode: { color: colors.brandSoft, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },

  // Cartes vitrées
  glassCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  universeList: { gap: spacing.md },
});
