/**
 * CLASSEMENT — Top 50 utilisateurs YUMIA de la semaine (par XP).
 * Scope : global, ou filtré par ville de l'utilisateur connecté.
 * Moteur de rétention inspiré de Duolingo (PRD § 5.4).
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { useLocation } from '../lib/useLocation';
import { getLeaderboard, type LeaderboardEntry } from '../lib/passport-api';
import { LEVELS } from '@yumia/shared';
import { useI18n } from '../lib/useI18n';
import type { TranslationKey } from '../lib/translations';

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

  function renderItem({ item }: { item: LeaderboardEntry }) {
    const isMe = item.userId === myUserId;
    const podium = item.rank <= 3;
    const podiumEmoji = item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : '🥉';

    return (
      <View style={[styles.row, isMe && styles.rowMe]}>
        {/* Rang */}
        <View style={styles.rankWrap}>
          {podium ? (
            <Text style={styles.podiumEmoji}>{podiumEmoji}</Text>
          ) : (
            <Text style={styles.rankText}>{item.rank}</Text>
          )}
        </View>

        {/* Avatar initial */}
        <View style={[styles.avatar, isMe && styles.avatarMe]}>
          <Text style={styles.avatarText}>
            {(item.displayName ?? '?').charAt(0).toUpperCase()}
          </Text>
        </View>

        {/* Infos */}
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

        {/* XP de la semaine */}
        <View style={styles.xpWrap}>
          <Text style={styles.xpValue}>{item.weeklyXp}</Text>
          <Text style={styles.xpLabel}>{t('lb_xp_per_week')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>{t('lb_title')}</Text>
        <View style={styles.scopePills}>
          {(Object.entries(SCOPE_LABEL_KEYS) as [Scope, TranslationKey][]).map(([key, labelKey]) => (
            <Pressable
              key={key}
              style={[styles.scopeChip, scope === key && styles.scopeChipActive]}
              onPress={() => setScope(key)}
            >
              <Text style={[styles.scopeText, scope === key && styles.scopeTextActive]}>
                {t(labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Text style={styles.subtitle}>{t('lb_this_week')}</Text>

      {loading && entries.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={styles.loadingText}>{t('lb_loading')}</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>{t('lb_retry')}</Text>
          </Pressable>
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🏆</Text>
          <Text style={styles.emptyText}>
            {scope === 'local'
              ? t('lb_empty_local')
              : t('lb_empty_global')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.userId}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />
          }
          renderItem={renderItem}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  backBtn: { padding: spacing.xs, alignSelf: 'flex-start' },
  backText: { ...typography.heading, color: colors.brandSoft, fontSize: 22 },
  title: { ...typography.title, color: colors.textPrimary },
  scopePills: { flexDirection: 'row', gap: spacing.sm },
  scopeChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  scopeChipActive: { backgroundColor: `${colors.brand}18`, borderColor: colors.brand },
  scopeText: { ...typography.caption, color: colors.textSecondary },
  scopeTextActive: { color: colors.brandSoft },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { ...typography.body, color: colors.textSecondary },
  errorText: { ...typography.body, color: colors.danger },
  retryBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  retryText: { ...typography.caption, color: '#fff' },
  emptyEmoji: { fontSize: 56 },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },

  list: { padding: spacing.md, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowMe: { borderColor: colors.brand, backgroundColor: `${colors.brand}0A` },

  rankWrap: { width: 32, alignItems: 'center' },
  podiumEmoji: { fontSize: 22 },
  rankText: { ...typography.heading, color: colors.textMuted },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMe: { backgroundColor: colors.brand },
  avatarText: { ...typography.heading, color: colors.textPrimary, fontSize: 16 },

  info: { flex: 1 },
  name: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  meta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },

  xpWrap: { alignItems: 'flex-end' },
  xpValue: { ...typography.heading, color: colors.brand },
  xpLabel: { ...typography.label, color: colors.textMuted },
});
