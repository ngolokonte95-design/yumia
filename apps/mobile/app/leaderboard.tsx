/**
 * CLASSEMENT — Top 50 utilisateurs YUMIA de la semaine (par XP).
 * Scope : global, ou filtré par ville de l'utilisateur connecté.
 * Moteur de rétention inspiré de Duolingo (PRD § 5.4).
 *
 * Mise en scène (18/11/2026) : podium animé du top 3 (socles qui montent,
 * médaillons à anneau de marque), carte « ta position » mise en avant quand
 * tu es hors du podium, puis la suite en lignes vitrées. Une seule couleur
 * d'accent ; l'or/argent/bronze ne passent que par les médailles.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, radius, spacing } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { useLocation } from '../lib/useLocation';
import { getLeaderboard, type LeaderboardEntry } from '../lib/passport-api';
import { LEVELS } from '@yumia/shared';
import { useI18n } from '../lib/useI18n';
import type { TranslationKey } from '../lib/translations';
import { haptics } from '../lib/useHaptics';
import { GradientText, Reveal } from '../components/ui';
import { BrandButton, BrandChip, SectionTitle } from '../components/social/SocialChrome';
import { BrandFrame, GradientRing } from '../components/profile/ProfileChrome';
import { GLASS_SURFACE, P2Empty, P2Header } from '../components/p2c/P2Visuals';
import { Podium } from '../components/p2c/Podium';

const SCOPE_LABEL_KEYS = { global: 'lb_scope_global', local: 'lb_scope_local' } as const satisfies Record<string, TranslationKey>;
type Scope = keyof typeof SCOPE_LABEL_KEYS;

function levelEmoji(level: number): string {
  const def = LEVELS.find((l) => l.level === level);
  return def?.emoji ?? '⭐';
}

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const { city } = useLocation();
  const { t } = useI18n();

  const [scope, setScope] = useState<Scope>('global');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const cityFilter = scope === 'local' ? (city ?? undefined) : undefined;
      const data = await getLeaderboard(accessToken, cityFilter);
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lb_load_error'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, scope, city]);

  useEffect(() => { void load(); }, [load]);

  const myUserId = user?.id;

  const podium = entries.filter((e) => e.rank <= 3);
  const rest = entries.filter((e) => e.rank > 3);
  // Ma ligne, mise en avant en tête de liste quand je suis hors du podium.
  const me = entries.find((e) => e.userId === myUserId && e.rank > 3);

  const listHeader = (
    <View>
      {podium.length > 0 ? (
        <Podium
          entries={podium}
          myUserId={myUserId}
          anonymousLabel={t('lb_anonymous')}
          youSuffix={t('lb_you_suffix')}
          xpLabel={t('lb_xp_per_week')}
        />
      ) : null}
      {me ? (
        <Reveal index={4} style={styles.meWrap}>
          <BrandFrame innerStyle={styles.meInner}>
            <GradientText style={styles.meRank}>{`#${me.rank}`}</GradientText>
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={1}>
                {me.displayName ?? t('lb_anonymous')}{t('lb_you_suffix')}
              </Text>
              <Text style={styles.meta}>
                {levelEmoji(me.level)} {t('lb_level_short')} {me.level}
                {me.streak > 0 ? ` · ${t('lb_streak_days').replace('{n}', String(me.streak))}` : ''}
              </Text>
            </View>
            <View style={styles.xpWrap}>
              <Text style={styles.xpValue}>{me.weeklyXp}</Text>
              <Text style={styles.xpLabel}>{t('lb_xp_per_week')}</Text>
            </View>
          </BrandFrame>
        </Reveal>
      ) : null}
      {rest.length > 0 ? <View style={styles.restTitle}><SectionTitle title={t('lb_this_week')} /></View> : null}
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <P2Header title={t('lb_title')} emoji="🏆" onBack={() => router.back()} />

      <View style={styles.scopePills}>
        {(Object.entries(SCOPE_LABEL_KEYS) as [Scope, TranslationKey][]).map(([key, labelKey]) => (
          <BrandChip
            key={key}
            label={t(labelKey)}
            active={scope === key}
            onPress={() => { haptics.select(); setScope(key); }}
          />
        ))}
      </View>

      {loading && entries.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={styles.loadingText}>{t('lb_loading')}</Text>
        </View>
      ) : error ? (
        <P2Empty
          emoji="📡"
          text={error}
          action={<BrandButton label={t('lb_retry')} onPress={load} compact />}
        />
      ) : entries.length === 0 ? (
        <P2Empty
          emoji="🏆"
          text={scope === 'local'
            ? t('lb_empty_local')
            : t('lb_empty_global')}
        />
      ) : (
        <FlatList
          data={rest}
          keyExtractor={(e) => e.userId}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />
          }
          ListHeaderComponent={listHeader}
          renderItem={({ item, index }) => (
            <LeaderRow item={item} index={index} isMe={item.userId === myUserId} />
          )}
        />
      )}
    </View>
  );
}

/** Ligne du classement (4e place et au-delà). */
function LeaderRow({ item, index, isMe }: { item: LeaderboardEntry; index: number; isMe: boolean }) {
  const { t } = useI18n();
  const initial = (item.displayName ?? '?').charAt(0).toUpperCase();
  return (
    <Reveal index={Math.min(index, 8)} from="fade">
      <View style={[styles.row, isMe && styles.rowMe]}>
        <View style={styles.rankWrap}>
          <Text style={styles.rankText}>{item.rank}</Text>
        </View>

        {isMe ? (
          <GradientRing size={44} thickness={2.5}>
            <Text style={styles.avatarText}>{initial}</Text>
          </GradientRing>
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
        )}

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {item.displayName ?? t('lb_anonymous')}
            {isMe ? t('lb_you_suffix') : ''}
          </Text>
          <Text style={styles.meta}>
            {levelEmoji(item.level)} {t('lb_level_short')} {item.level}
            {item.streak > 0 ? ` · ${t('lb_streak_days').replace('{n}', String(item.streak))}` : ''}
          </Text>
        </View>

        <View style={styles.xpWrap}>
          <Text style={styles.xpValue}>{item.weeklyXp}</Text>
          <Text style={styles.xpLabel}>{t('lb_xp_per_week')}</Text>
        </View>
      </View>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scopePills: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.xs },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },

  list: { paddingHorizontal: spacing.md, gap: spacing.sm },

  meWrap: { marginTop: spacing.lg },
  meInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  meRank: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  restTitle: { marginTop: spacing.lg, marginHorizontal: -spacing.md },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderRadius: radius.lg, padding: spacing.md, ...GLASS_SURFACE,
  },
  rowMe: { borderColor: colors.brand, backgroundColor: 'rgba(232,98,26,0.08)' },

  rankWrap: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  rankText: { color: colors.textSecondary, fontSize: 14, fontWeight: '900' },

  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.textPrimary, fontSize: 17, fontWeight: '900' },

  info: { flex: 1, minWidth: 0 },
  name: { color: colors.textPrimary, fontSize: 15, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 2 },

  xpWrap: { alignItems: 'flex-end' },
  xpValue: { color: colors.brandSoft, fontSize: 18, fontWeight: '900' },
  xpLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
});
