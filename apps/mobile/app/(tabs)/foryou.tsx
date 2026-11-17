/**
 * FOR YOU — cœur addictif. Flux vertical plein écran (snap-to-card), façon TikTok.
 * L'utilisateur ouvre YUMIA même sans intention précise, juste pour être inspiré.
 * Branché sur POST /recommendations/feed (mood-aware).
 *
 * Mise en scène (17/11/2026, nouvelle DA) : photo plein cadre avec voiles haut
 * et bas, pastille d'univers aux couleurs de sa catégorie, nom en très grand,
 * compatibilité en pastille dégradée, raison de l'IA sur verre, actions en
 * ronds vitrés (cœur qui rebondit). Humeurs en pastilles vitrées qui défilent.
 * Une seule carte à l'écran : rien d'autre ne s'empile.
 */
import { memo, useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
  Share,
  Modal,
} from 'react-native';
import Animated, {
  FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withSequence, withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MOODS, MOOD_META, type Suggestion } from '@yumia/shared';
import { safeMeta, universeLabel } from '../../lib/universeMeta';
import { moodLabel } from '../../lib/labelHelpers';
import { colors, elevation, gradients, motion, radius, spacing, typography } from '../../theme/tokens';
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
import { PlacePhoto } from '../../components/PlacePhoto';
import { PremiumUpsellModal } from '../../components/PremiumUpsellModal';
import { usePlanLimits } from '../../lib/usePlanLimits';
import type { VisitResult } from '../../lib/passport-api';
import { ratingLabel } from '../../lib/place-rating';
import { FeatureTip } from '../../components/FeatureTip';
import { PressableScale, GradientText } from '../../components/ui';
import { UniverseGlyph } from '../../components/UniverseGlyph';
import { universeGradient } from '../../lib/universeTheme';

export default function ForYouScreen() {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { coords, resolving } = useLocation();
  const weather = useWeather(coords.lat, coords.lng);
  const { user, accessToken } = useAuth();
  const router = useRouter();
  const { savedIds, save, unsave, limitError, clearLimitError } = useSaved(accessToken);
  const { checkLimit, recordUsage, quotaMessage, savedLimitMessage } = usePlanLimits();
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
    const { allowed } = await checkLimit('suggestionsPerDay');
    if (!allowed) {
      setUpsell(quotaMessage('suggestionsPerDay', t('tab_foryou')));
      return;
    }
    await recordUsage('suggestionsPerDay');
    loadMore();
  }, [checkLimit, recordUsage, quotaMessage, loadMore, t]);

  const pickMood = (m: (typeof MOODS)[number] | null) => {
    if (m === mood) return;
    haptics.select();
    setMood(m);
  };

  return (
    <View style={styles.screen}>
      <PremiumUpsellModal visible={limitError !== null} message={limitError !== null ? savedLimitMessage() : ''} onClose={clearLimitError} />
      <PremiumUpsellModal visible={upsell !== null} message={upsell ?? ''} onClose={() => setUpsell(null)} />

      {busy && suggestions.length === 0 ? (
        <StateView>
          <ActivityIndicator color={colors.brand} size="large" />
          <GradientText style={styles.stateTitle}>{t('fy_preparing')}</GradientText>
        </StateView>
      ) : error ? (
        <StateView>
          <Text style={styles.stateEmoji}>📡</Text>
          <Text style={styles.stateText}>{error}</Text>
          <PressableScale style={styles.retryBtn} onPress={reload} haptic>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Text style={styles.retryText}>{t('fy_retry')}</Text>
          </PressableScale>
        </StateView>
      ) : suggestions.length === 0 ? (
        <StateView>
          <Text style={styles.stateEmoji}>🧭</Text>
          <Text style={styles.stateText}>{t('fy_empty')}</Text>
        </StateView>
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
          // Plein écran : deux cartes de part et d'autre suffisent, les
          // photos des autres ne restent pas en mémoire.
          windowSize={5}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.brand} style={{ marginVertical: 24 }} /> : undefined}
          renderItem={({ item }) => (
            <FeedCard
              suggestion={item}
              height={height}
              topInset={insets.top}
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

      {/* Humeurs — pastilles vitrées qui défilent, en haut sur la photo */}
      <View style={[styles.moodBar, { top: insets.top + spacing.xs }]} pointerEvents="box-none">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moodRow}>
          <MoodChip active={mood === null} label={`✨ ${t('foryou_mood_all')}`} onPress={() => pickMood(null)} />
          {MOODS.map((m) => (
            <MoodChip
              key={m}
              active={mood === m}
              label={`${MOOD_META[m].emoji} ${moodLabel(t, m, MOOD_META[m].labelFr)}`}
              onPress={() => pickMood(m)}
            />
          ))}
        </ScrollView>
      </View>
      <FeatureTip feature="foryou" />
    </View>
  );
}

function StateView({ children }: { children: ReactNode }) {
  return (
    <View style={styles.center}>
      <LinearGradient colors={gradients.brandSoft} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Animated.View entering={FadeIn.duration(motion.duration.normal)} style={styles.stateInner}>
        {children}
      </Animated.View>
    </View>
  );
}

function MoodChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <PressableScale style={[styles.moodChip, active && styles.moodChipActive]} onPress={onPress} scaleTo={0.94}>
      {active ? (
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      ) : null}
      <Text style={styles.moodText} numberOfLines={1}>{label}</Text>
    </PressableScale>
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
  topInset,
  isSaved = false,
  onSave,
  onVisit,
  onOpenDetail,
}: {
  suggestion: Suggestion;
  height: number;
  topInset: number;
  isSaved?: boolean;
  onSave?: (id: string, willSave: boolean) => Promise<void>;
  onVisit?: (feedback?: VisitFeedback) => Promise<VisitResult>;
  onOpenDetail?: () => void;
}) {
  const { t } = useI18n();
  const { place, reason, compatibility } = suggestion;
  const meta = safeMeta(place.universe);
  const grad = universeGradient(place.universe);
  const [saved, setSaved] = useState(isSaved);
  const [visitState, setVisitState] = useState<'idle' | 'picker' | 'submitting' | 'done'>('idle');
  const [xpResult, setXpResult] = useState<VisitResult | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  // La liste de favoris arrive après coup (chargement, autre écran) : la
  // carte suit, sauf pendant qu'elle-même change l'état.
  useEffect(() => { setSaved(isSaved); }, [isSaved]);

  // Cœur qui rebondit à l'enregistrement.
  const heart = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heart.value }] }));

  async function handleSave() {
    const next = !saved;
    setSaved(next);
    if (next) {
      haptics.light();
      heart.value = withSequence(withSpring(1.35, motion.spring.bouncy), withSpring(1, motion.spring.bouncy));
    }
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

  const rating = ratingLabel(place.rating);

  return (
    <Pressable style={[styles.card, { height }]} onPress={onOpenDetail}>
      <View style={styles.media}>
        <PlacePhoto photoUrls={place.photoUrls} emoji={meta.emoji} emojiSize={120} />
        {/* Sans photo : le dégradé de l'univers plutôt qu'un aplat gris. */}
        {!place.photoUrls?.length ? (
          <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.noPhoto]}>
            <UniverseGlyph u={place.universe} size={120} />
          </LinearGradient>
        ) : null}
        {/* Voiles : haut (humeurs lisibles) et bas (texte lisible). */}
        <LinearGradient
          colors={['rgba(14,14,18,0.7)', 'rgba(14,14,18,0)']}
          style={[styles.scrimTop, { height: topInset + 120 }]}
        />
        <LinearGradient
          colors={['rgba(14,14,18,0)', 'rgba(14,14,18,0.55)', 'rgba(14,14,18,0.95)']}
          locations={[0, 0.45, 1]}
          style={styles.scrimBottom}
        />
      </View>

      {xpResult ? (
        <XpToast result={xpResult} onDone={() => setXpResult(null)} />
      ) : null}

      {/* Ressenti de visite */}
      <Modal visible={showFeedback} transparent animationType="slide" onRequestClose={() => { setShowFeedback(false); void submitVisit(); }}>
        <Pressable style={styles.feedbackOverlay} onPress={() => { setShowFeedback(false); void submitVisit(); }}>
          <View style={styles.feedbackSheet}>
            <LinearGradient colors={gradients.glassSheen} style={StyleSheet.absoluteFill} />
            <View style={styles.sheetHandle} />
            <Text style={styles.feedbackTitle}>{t('place_feedback_prompt')}</Text>
            <View style={styles.feedbackRow}>
              {FEED_FEEDBACK_OPTS.map((opt) => (
                <PressableScale key={opt.key} style={styles.feedbackOpt} onPress={() => void submitVisit(opt.key)} haptic>
                  <Text style={styles.feedbackOptEmoji}>{opt.emoji}</Text>
                  <Text style={styles.feedbackOptLabel}>{t(opt.labelKey)}</Text>
                </PressableScale>
              ))}
            </View>
            <Pressable onPress={() => { setShowFeedback(false); void submitVisit(); }} style={{ marginTop: spacing.sm }} hitSlop={10}>
              <Text style={styles.skipLabel}>{t('fy_skip')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Actions rapides verticales (droite) — ronds vitrés */}
      <View style={styles.actions}>
        <ActionButton
          label={saved ? t('fy_saved') : t('fy_keep')}
          onPress={() => void handleSave()}
          active={saved}
        >
          <Animated.Text style={[styles.actionEmoji, heartStyle]}>{saved ? '❤️' : '🤍'}</Animated.Text>
        </ActionButton>
        {onVisit ? (
          <ActionButton
            label={visitState === 'done' ? t('fy_visited') : t('fy_im_here')}
            onPress={handleVisitPress}
            disabled={visitState !== 'idle'}
            active={visitState === 'done'}
          >
            {visitState === 'submitting'
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.actionEmoji}>{visitState === 'done' ? '✅' : '📍'}</Text>}
          </ActionButton>
        ) : null}
        <ActionButton label={t('fy_ask')} onPress={() => onOpenDetail?.()}>
          <Text style={styles.actionEmoji}>🤖</Text>
        </ActionButton>
        <ActionButton label={t('fy_share')} onPress={() => void handleShare()}>
          <Text style={styles.actionEmoji}>📤</Text>
        </ActionButton>
      </View>

      {/* Bandeau d'info (bas) */}
      <Animated.View entering={FadeInDown.duration(motion.duration.normal)} style={styles.info}>
        <View style={[styles.universePill, { backgroundColor: grad[1] }]}>
          <UniverseGlyph u={place.universe} size={14} />
          <Text style={styles.universePillText} numberOfLines={1}>{universeLabel(t, place.universe)}</Text>
        </View>

        <Text style={styles.infoName} numberOfLines={2}>{place.name}</Text>

        <View style={styles.pillRow}>
          <View style={styles.compatPill}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Text style={styles.compatText}>❤️ {compatibility}%</Text>
          </View>
          {rating ? (
            <View style={styles.glassPill}>
              <Text style={styles.glassPillText}>{rating}</Text>
            </View>
          ) : null}
        </View>

        {reason ? (
          <View style={styles.reasonCard}>
            <LinearGradient colors={gradients.glassSheen} style={StyleSheet.absoluteFill} />
            <Text style={styles.reasonIcon}>✨</Text>
            <Text style={styles.infoReason} numberOfLines={3}>{reason}</Text>
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
});

function ActionButton({
  children, label, onPress, disabled, active,
}: {
  children: ReactNode;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <PressableScale style={styles.action} onPress={onPress} disabled={disabled} scaleTo={0.88}>
      <View style={[styles.actionCircle, active && styles.actionCircleActive]}>{children}</View>
      <Text style={styles.actionLabel} numberOfLines={1}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  // États (chargement, erreur, vide)
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  stateInner: { alignItems: 'center', gap: spacing.md, maxWidth: 320 },
  stateTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  stateEmoji: { fontSize: 44 },
  stateText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  retryBtn: {
    borderRadius: radius.pill, overflow: 'hidden',
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.xl, ...elevation.glowBrand,
  },
  retryText: { ...typography.body, color: '#fff', fontWeight: '800' },

  // Carte plein écran
  card: { width: '100%', justifyContent: 'flex-end' },
  media: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  scrimTop: { position: 'absolute', top: 0, left: 0, right: 0 },
  scrimBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },

  // Humeurs
  moodBar: { position: 'absolute', left: 0, right: 0 },
  moodRow: { paddingHorizontal: spacing.md, gap: spacing.sm },
  moodChip: {
    borderRadius: radius.pill,
    overflow: 'hidden',
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(14,14,18,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  moodChipActive: { borderColor: 'rgba(255,255,255,0.45)' },
  moodText: { ...typography.caption, color: '#fff', fontWeight: '700' },

  // Actions
  actions: { position: 'absolute', right: spacing.md, bottom: 170, gap: spacing.md, alignItems: 'center' },
  action: { alignItems: 'center', gap: 5, width: 64 },
  actionCircle: {
    width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(14,14,18,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },
  actionCircleActive: { borderColor: colors.brand, backgroundColor: `${colors.brand}40` },
  actionEmoji: { fontSize: 26 },
  actionLabel: {
    ...typography.label, color: '#fff', fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 },
  },

  // Bandeau d'info
  info: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm, maxWidth: '80%' },
  universePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingVertical: 5, paddingHorizontal: 12, borderRadius: radius.pill,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },
  universePillText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  infoName: {
    color: '#fff', fontSize: 32, fontWeight: '900', letterSpacing: -0.8, lineHeight: 36,
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 14, textShadowOffset: { width: 0, height: 2 },
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  compatPill: { borderRadius: radius.pill, overflow: 'hidden', paddingVertical: 5, paddingHorizontal: 12 },
  compatText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  glassPill: {
    borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 12,
    backgroundColor: 'rgba(14,14,18,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },
  glassPillText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  reasonCard: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', overflow: 'hidden',
    marginTop: 2, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: 'rgba(14,14,18,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
  },
  reasonIcon: { fontSize: 16 },
  infoReason: { ...typography.body, color: colors.textPrimary, flex: 1, lineHeight: 21 },

  // Ressenti de visite
  feedbackOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  feedbackSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
    padding: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md,
  },
  sheetHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.brand, marginBottom: spacing.sm },
  feedbackTitle: { ...typography.heading, color: colors.textPrimary, fontWeight: '900', textAlign: 'center' },
  feedbackRow: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center' },
  feedbackOpt: {
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minWidth: 92,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  feedbackOptEmoji: { fontSize: 34 },
  feedbackOptLabel: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  skipLabel: { ...typography.caption, color: colors.textMuted },
});
