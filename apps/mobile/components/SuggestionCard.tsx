import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import type { Suggestion } from '@yumia/shared';
import { safeMeta, universeLabel } from '../lib/universeMeta';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useI18n } from '../lib/useI18n';
import { haptics } from '../lib/useHaptics';
import type { VisitFeedback, VisitResult } from '../lib/passport-api';
import { XpToast } from './XpToast';
import { PlacePhoto } from './PlacePhoto';
import type { TranslationKey } from '../lib/translations';

interface Props {
  suggestion: Suggestion;
  onPress?: () => void;
  /** « J'y suis allé » — déclenche l'enregistrement de la visite avec feedback optionnel. */
  onVisit?: (feedback?: VisitFeedback) => Promise<VisitResult | void>;
  /** Basculer sauvegarde (save/unsave). */
  onSave?: (placeId: string, saved: boolean) => Promise<void>;
  /** Si le lieu est déjà sauvegardé. */
  isSaved?: boolean;
}

type VisitState = 'idle' | 'loading' | 'feedback' | 'done';

const FEEDBACK_OPTS: { key: VisitFeedback; emoji: string; labelKey: TranslationKey }[] = [
  { key: 'loved', emoji: '❤️', labelKey: 'place_feedback_loved' },
  { key: 'neutral', emoji: '😐', labelKey: 'place_feedback_neutral' },
  { key: 'disliked', emoji: '👎', labelKey: 'place_feedback_disliked' },
];

/** Carte de suggestion : photo (placeholder), nom, méta, compatibilité, explication IA. */
export function SuggestionCard({ suggestion, onPress, onVisit, onSave, isSaved = false }: Props) {
  const { t } = useI18n();
  const { place, compatibility, distanceMeters, reason } = suggestion;
  const meta = safeMeta(place.universe);
  const compatColor = compatibility >= 85 ? colors.compatHigh : colors.compatMid;

  const [visitState, setVisitState] = useState<VisitState>('idle');
  const [xpResult, setXpResult] = useState<VisitResult | null>(null);
  const [saved, setSaved] = useState(isSaved);
  const [saveLoading, setSaveLoading] = useState(false);

  function handleVisit() {
    if (!onVisit || visitState !== 'idle') return;
    haptics.medium();
    setVisitState('feedback');
  }

  async function handleFeedback(fb: VisitFeedback) {
    if (visitState !== 'feedback') return;
    haptics.success();
    setVisitState('loading');
    try {
      const result = await onVisit?.(fb);
      if (result) setXpResult(result);
      setVisitState('done');
    } catch {
      setVisitState('feedback');
    }
  }

  async function handleSkipFeedback() {
    if (visitState !== 'feedback') return;
    setVisitState('loading');
    try {
      const result = await onVisit?.();
      if (result) setXpResult(result);
      setVisitState('done');
    } catch {
      setVisitState('idle');
    }
  }

  async function handleSave() {
    if (!onSave || saveLoading) return;
    haptics.light();
    setSaveLoading(true);
    const next = !saved;
    setSaved(next); // optimiste
    try {
      await onSave(place.id, next);
    } catch {
      setSaved(!next); // rollback
    } finally {
      setSaveLoading(false);
    }
  }

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <XpToast result={xpResult} onDone={() => setXpResult(null)} />
      <View style={styles.photo}>
        <PlacePhoto photoUrls={place.photoUrls} emoji={meta.emoji} emojiSize={56} />
        <View style={[styles.compatBadge, { borderColor: compatColor }]}>
          <Text style={[styles.compatText, { color: compatColor }]}>❤️ {compatibility}%</Text>
        </View>
        {onSave ? (
          <Pressable style={styles.heartBtn} onPress={handleSave} disabled={saveLoading}>
            <Text style={styles.heartIcon}>{saved ? '❤️' : '🤍'}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={styles.name} numberOfLines={1}>
            {place.name}
          </Text>
          <Text style={styles.rating}>⭐ {place.rating.toFixed(1)}</Text>
        </View>

        <Text style={styles.metaLine}>
          {universeLabel(t, place.universe)} · {'€'.repeat(place.priceTier)}
          {distanceMeters != null ? ` · ${formatDistance(distanceMeters)}` : ''}
          {place.openNow ? ` · ${t('sc_open_now')}` : ''}
        </Text>

        <Text style={styles.reason} numberOfLines={2}>
          🤖 {reason}
        </Text>

        {onVisit ? (
          visitState === 'feedback' ? (
            <View style={styles.feedbackRow}>
              <Text style={styles.feedbackPrompt}>{t('place_feedback_prompt')}</Text>
              <View style={styles.feedbackBtns}>
                {FEEDBACK_OPTS.map((opt) => (
                  <Pressable
                    key={opt.key}
                    style={styles.feedbackBtn}
                    onPress={() => void handleFeedback(opt.key)}
                  >
                    <Text style={styles.feedbackEmoji}>{opt.emoji}</Text>
                    <Text style={styles.feedbackLabel}>{t(opt.labelKey)}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={handleSkipFeedback} hitSlop={8}>
                <Text style={styles.skipFeedback}>{t('sc_skip_feedback')}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={[styles.visitBtn, visitState === 'done' && styles.visitBtnDone]}
              onPress={handleVisit}
              disabled={visitState !== 'idle'}
            >
              {visitState === 'loading' ? (
                <ActivityIndicator color={colors.brand} size="small" />
              ) : (
                <Text style={[styles.visitText, visitState === 'done' && styles.visitTextDone]}>
                  {visitState === 'done' ? t('place_visited') : t('place_visit_btn')}
                </Text>
              )}
            </Pressable>
          )
        ) : null}
      </View>
    </Pressable>
  );
}

function formatDistance(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  photo: {
    height: 150,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmoji: { fontSize: 56 },
  compatBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.overlay,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  heartBtn: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.overlay,
    borderRadius: radius.pill,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartIcon: { fontSize: 18 },
  compatText: { ...typography.label },
  body: { padding: spacing.md, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { ...typography.heading, color: colors.textPrimary, flex: 1, marginRight: spacing.sm },
  rating: { ...typography.caption, color: colors.textSecondary },
  metaLine: { ...typography.caption, color: colors.textMuted },
  reason: { ...typography.body, color: colors.textSecondary, marginTop: 2 },
  feedbackRow: { marginTop: spacing.sm, gap: spacing.xs },
  feedbackPrompt: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  feedbackBtns: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  feedbackBtn: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    gap: 4,
  },
  feedbackEmoji: { fontSize: 22 },
  feedbackLabel: { ...typography.label, color: colors.textSecondary },
  skipFeedback: { ...typography.label, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs },
  visitBtn: {
    marginTop: spacing.sm,
    borderColor: colors.brand,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  visitBtnDone: { borderColor: colors.success, backgroundColor: 'rgba(43,182,115,0.12)' },
  visitText: { ...typography.caption, color: colors.brand },
  visitTextDone: { color: colors.success },
});
