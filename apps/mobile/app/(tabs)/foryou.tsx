import { memo, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  Share,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MOODS, MOOD_META, type Suggestion } from '@yumia/shared';
import { safeMeta, universeLabel } from '../../lib/universeMeta';
import { moodLabel } from '../../lib/labelHelpers';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { useI18n } from '../../lib/useI18n';
import type { TranslationKey } from '../../lib/translations';
import { useLocation } from '../../lib/useLocation';
import { useFeed } from '../../lib/useFeed';
import { useWeather } from '../../lib/useWeather';
import { useAuth } from '../../lib/auth-context';
import { useSaved } from '../../lib/useSaved';
import { placeStore } from '../../lib/place-store';
import { recordVisit, type VisitFeedback } from '../../lib/passport-api';
import { haptics } from '../../lib/useHaptics';
import { XpToast } from '../../components/XpToast';
import { PaywallModal } from '../../components/PaywallModal';
import { PlacePhoto } from '../../components/PlacePhoto';
import { PremiumUpsellModal } from '../../components/PremiumUpsellModal';
import { usePlanLimits } from '../../lib/usePlanLimits';
import type { VisitResult } from '../../lib/passport-api';

/**
 * FOR YOU — cœur addictif. Flux vertical plein écran (snap-to-card), façon TikTok.
 * L'utilisateur ouvre YUMIA même sans intention précise, juste pour être inspiré.
 * Branché sur POST /recommendations/feed (mood-aware).
 */
export default function ForYouScreen() {
  const { height } = useWindowDimensions();
  const { t } = useI18n();
  const { coords, resolving } = useLocation();
  const weather = useWeather(coords.lat, coords.lng);
  const { user, accessToken } = useAuth();
  const router = useRouter();
  const { savedIds, save, unsave, limitError, clearLimitError } = useSaved(accessToken);
  const { checkLimit, recordUsage } = usePlanLimits();
  const [mood, setMood] = useState<(typeof MOODS)[number] | null>(null);
  const [upsell, setUpsell] = useState<string | null>(null);

  const { suggestions, loading, loadingMore, error, reload, loadMore } = useFeed({
    lat: coords.lat,
    lng: coords.lng,
    mood: mood ?? undefined,
    enabled: !resolving,
    favoriteUniverses: user?.preferences?.favoriteUniverses,
    restrictions: user?.preferences?.restrictions,
    weather: weather ?? undefined,
  });

  const busy = resolving || loading;

  // Quota Gratuit : on ouvre l'upsell au lieu de charger davantage au-delà de la limite.
  const handleEndReached = useCallback(async () => {
    const { allowed, message } = await checkLimit('suggestionsPerDay');
    if (!allowed) {
      setUpsell(message);
      return;
    }
    await recordUsage('suggestionsPerDay');
    loadMore();
  }, [checkLimit, recordUsage, loadMore]);

  return (
    <View style={styles.screen}>
      <PaywallModal visible={limitError !== null} onClose={clearLimitError} />
      <PremiumUpsellModal visible={upsell !== null} message={upsell ?? ''} onClose={() => setUpsell(null)} />

      {busy && suggestions.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={styles.centerText}>{t('fy_preparing')}</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.centerText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={reload}>
            <Text style={styles.retryText}>{t('fy_retry')}</Text>
          </Pressable>
        </View>
      ) : suggestions.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.centerText}>{t('fy_empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={suggestions}
          keyExtractor={(s) => s.place.id}
          pagingEnabled
          snapToInterval={height}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.brand} style={{ marginVertical: 24 }} /> : null}
          renderItem={({ item }) => (
            <FeedCard
              suggestion={item}
              height={height}
              isSaved={savedIds.has(item.place.id)}
              onSave={
                accessToken
                  ? (id, willSave) => willSave ? save(id) : unsave(id)
                  : undefined
              }
              onVisit={
                accessToken
                  ? async (fb) => { return recordVisit(accessToken, item.place.id, fb); }
                  : undefined
              }
              onOpenDetail={() => { placeStore.set(item); router.push('/place'); }}
            />
          )}
        />
      )}

      {/* Filtre d'humeur flottant en haut */}
      <View style={styles.moodBar} pointerEvents="box-none">
        {MOODS.map((m) => {
          const active = mood === m;
          return (
            <Pressable
              key={m}
              style={[styles.moodChip, active && styles.moodChipActive]}
              onPress={() => setMood(active ? null : m)}
            >
              <Text style={styles.moodText}>
                {MOOD_META[m].emoji} {moodLabel(t, m, MOOD_META[m].labelFr)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const FEED_FEEDBACK_OPTS: { key: VisitFeedback; emoji: string; labelKey: TranslationKey }[] = [
  { key: 'loved', emoji: '❤️', labelKey: 'place_feedback_loved' },
  { key: 'neutral', emoji: '😐', labelKey: 'place_feedback_neutral' },
  { key: 'disliked', emoji: '👎', labelKey: 'place_feedback_disliked' },
];

const FeedCard = memo(function FeedCard({
  suggestion,
  height,
  isSaved = false,
  onSave,
  onVisit,
  onOpenDetail,
}: {
  suggestion: Suggestion;
  height: number;
  isSaved?: boolean;
  onSave?: (id: string, willSave: boolean) => Promise<void>;
  onVisit?: (feedback?: VisitFeedback) => Promise<VisitResult>;
  onOpenDetail?: () => void;
}) {
  const { t } = useI18n();
  const { place, reason, compatibility } = suggestion;
  const meta = safeMeta(place.universe);
  const [saved, setSaved] = useState(isSaved);
  const [visitState, setVisitState] = useState<'idle' | 'picker' | 'submitting' | 'done'>('idle');
  const [xpResult, setXpResult] = useState<VisitResult | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  async function handleSave() {
    const next = !saved;
    setSaved(next);
    try {
      await onSave?.(place.id, next);
    } catch {
      setSaved(!next);
    }
  }

  async function handleShare() {
    await Share.share({
      message: t('place_share_message')
        .replace('{emoji}', meta.emoji)
        .replace('{name}', place.name)
        .replace('{link}', `yumia://place?id=${place.id}`),
      title: place.name,
      url: `yumia://place?id=${place.id}`,
    });
  }

  function handleVisitPress() {
    if (visitState !== 'idle') return;
    haptics.medium();
    setShowFeedback(true);
    setVisitState('picker');
  }

  async function submitVisit(fb?: VisitFeedback) {
    setShowFeedback(false);
    setVisitState('submitting');
    haptics.success();
    try {
      const result = await onVisit?.(fb);
      if (result) setXpResult(result);
      setVisitState('done');
    } catch {
      setVisitState('idle');
    }
  }

  return (
    <Pressable style={[styles.card, { height }]} onPress={onOpenDetail}>
      <View style={styles.media}>
        <PlacePhoto photoUrls={place.photoUrls} emoji={meta.emoji} emojiSize={120} scrim />
      </View>

      {xpResult ? (
        <XpToast result={xpResult} onDone={() => setXpResult(null)} />
      ) : null}

      {/* Feedback picker modal */}
      <Modal visible={showFeedback} transparent animationType="slide" onRequestClose={() => { setShowFeedback(false); void submitVisit(); }}>
        <Pressable style={styles.feedbackOverlay} onPress={() => { setShowFeedback(false); void submitVisit(); }}>
          <View style={styles.feedbackSheet}>
            <Text style={styles.feedbackTitle}>{t('place_feedback_prompt')}</Text>
            <View style={styles.feedbackRow}>
              {FEED_FEEDBACK_OPTS.map((opt) => (
                <Pressable key={opt.key} style={styles.feedbackOpt} onPress={() => void submitVisit(opt.key)}>
                  <Text style={styles.feedbackOptEmoji}>{opt.emoji}</Text>
                  <Text style={styles.feedbackOptLabel}>{t(opt.labelKey)}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => { setShowFeedback(false); void submitVisit(); }} style={{ marginTop: spacing.sm }}>
              <Text style={styles.skipLabel}>{t('fy_skip')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Actions rapides verticales (droite) */}
      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={handleSave}>
          <Text style={styles.actionEmoji}>{saved ? '❤️' : '🤍'}</Text>
          <Text style={styles.actionLabel}>{saved ? t('fy_saved') : t('fy_keep')}</Text>
        </Pressable>
        {onVisit ? (
          <Pressable style={styles.action} onPress={handleVisitPress} disabled={visitState !== 'idle'}>
            {visitState === 'submitting'
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.actionEmoji}>{visitState === 'done' ? '✅' : '📍'}</Text>
            }
            <Text style={styles.actionLabel}>{visitState === 'done' ? t('fy_visited') : t('fy_im_here')}</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.action} onPress={onOpenDetail}>
          <Text style={styles.actionEmoji}>🤖</Text>
          <Text style={styles.actionLabel}>{t('fy_ask')}</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => void handleShare()}>
          <Text style={styles.actionEmoji}>📤</Text>
          <Text style={styles.actionLabel}>{t('fy_share')}</Text>
        </Pressable>
      </View>

      {/* Bandeau d'info (bas) */}
      <View style={styles.info}>
        <Text style={styles.infoName}>{place.name}</Text>
        <Text style={styles.infoMeta}>
          {universeLabel(t, place.universe)} · ⭐ {place.rating.toFixed(1)} · {'€'.repeat(place.priceTier)} · ❤️ {compatibility}%
        </Text>
        <Text style={styles.infoReason}>🤖 {reason}</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  centerText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  retryText: { ...typography.caption, color: '#fff' },
  card: { width: '100%', justifyContent: 'flex-end' },
  media: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaEmoji: { fontSize: 120, opacity: 0.5 },
  moodBar: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  moodChip: {
    backgroundColor: colors.overlay,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  moodChipActive: { backgroundColor: colors.brand },
  moodText: { ...typography.caption, color: colors.textPrimary },
  actions: { position: 'absolute', right: spacing.md, bottom: 160, gap: spacing.lg, alignItems: 'center' },
  action: { alignItems: 'center', gap: 4 },
  actionEmoji: { fontSize: 30 },
  actionLabel: { ...typography.label, color: colors.textPrimary },
  info: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: 6, maxWidth: '78%' },
  infoName: { ...typography.title, color: colors.textPrimary },
  infoMeta: { ...typography.caption, color: colors.textSecondary },
  infoReason: { ...typography.body, color: colors.textPrimary, marginTop: 4 },
  feedbackOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  feedbackSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md,
  },
  feedbackTitle: { ...typography.heading, color: colors.textPrimary },
  feedbackRow: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center' },
  feedbackOpt: {
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    minWidth: 80,
    borderWidth: 1,
    borderColor: colors.border,
  },
  feedbackOptEmoji: { fontSize: 32 },
  feedbackOptLabel: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  skipLabel: { ...typography.caption, color: colors.textMuted },
});
