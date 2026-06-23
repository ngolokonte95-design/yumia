/**
 * Itinéraire 3 étapes (Date / Travel) — affiché sur le Home quand un mode
 * buildsItinerary est sélectionné.
 * Chaque étape expose : sauvegarder, « J'y vais », ouvrir la fiche lieu.
 */
import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { UNIVERSE_META } from '@yumia/shared';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { ExperienceResult, ExperienceStep } from '../lib/api';
import type { VisitFeedback, VisitResult } from '../lib/passport-api';
import { XpToast } from './XpToast';

interface Props {
  result: ExperienceResult;
  savedIds?: Set<string>;
  onSave?: (placeId: string, willSave: boolean) => Promise<void>;
  onVisit?: (placeId: string, feedback?: VisitFeedback) => Promise<VisitResult | void>;
  onStepPress?: (step: ExperienceStep) => void;
}

export function ExperienceCard({ result, savedIds, onSave, onVisit, onStepPress }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{result.titleFr}</Text>

      {result.steps.map((step, idx) => {
        const meta = UNIVERSE_META[step.place.universe as keyof typeof UNIVERSE_META];
        const isLast = idx === result.steps.length - 1;
        return (
          <View key={step.order} style={styles.stepRow}>
            <View style={styles.timeline}>
              <View style={[styles.dot, { backgroundColor: stepColor(idx) }]} />
              {!isLast && <View style={styles.line} />}
            </View>
            <StepCard
              step={step}
              meta={meta}
              isSaved={savedIds?.has(step.place.id) ?? false}
              onSave={onSave}
              onVisit={onVisit}
              onPress={() => onStepPress?.(step)}
            />
          </View>
        );
      })}

      {result.steps.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            Aucun lieu disponible dans ce rayon pour cet itinéraire.
          </Text>
        </View>
      )}
    </View>
  );
}

function stepColor(idx: number): string {
  const palette = [colors.brand, colors.accent, colors.success];
  return palette[idx % palette.length];
}

function StepCard({
  step,
  meta,
  isSaved,
  onSave,
  onVisit,
  onPress,
}: {
  step: ExperienceStep;
  meta: (typeof UNIVERSE_META)[keyof typeof UNIVERSE_META] | undefined;
  isSaved: boolean;
  onSave?: Props['onSave'];
  onVisit?: Props['onVisit'];
  onPress?: () => void;
}) {
  const [saved, setSaved] = useState(isSaved);
  const [saveLoading, setSaveLoading] = useState(false);
  const [visitState, setVisitState] = useState<'idle' | 'feedback' | 'loading' | 'done'>('idle');
  const [xpResult, setXpResult] = useState<VisitResult | null>(null);

  async function handleSave() {
    if (!onSave || saveLoading) return;
    setSaveLoading(true);
    const next = !saved;
    setSaved(next);
    try { await onSave(step.place.id, next); }
    catch { setSaved(!next); }
    finally { setSaveLoading(false); }
  }

  function handleVisit() {
    if (!onVisit || visitState !== 'idle') return;
    setVisitState('feedback');
  }

  async function handleFeedback(fb?: VisitFeedback) {
    setVisitState('loading');
    try {
      const result = await onVisit?.(step.place.id, fb);
      if (result) setXpResult(result);
      setVisitState('done');
    } catch {
      setVisitState('idle');
    }
  }

  return (
    <Pressable style={styles.stepCard} onPress={onPress}>
      <XpToast result={xpResult} onDone={() => setXpResult(null)} />
      <View style={styles.stepHeader}>
        <Text style={styles.stepLabel}>{step.labelFr}</Text>
        <Text style={styles.stepUniverse}>{meta?.emoji} {meta?.labelFr}</Text>
      </View>
      <Text style={styles.placeName}>{step.place.name}</Text>
      <Text style={styles.placeRating}>
        ⭐ {step.place.rating.toFixed(1)} · {'€'.repeat(step.place.priceTier)}
        {step.place.city ? ` · ${step.place.city}` : ''}
      </Text>
      <Text style={styles.reason}>{step.reason}</Text>

      {/* Actions */}
      <View style={styles.actions}>
        {onSave ? (
          <Pressable style={styles.actionBtn} onPress={handleSave} disabled={saveLoading}>
            {saveLoading
              ? <ActivityIndicator size="small" color={colors.brand} />
              : <Text style={styles.actionText}>{saved ? '❤️' : '🤍'}</Text>}
          </Pressable>
        ) : null}

        {onVisit ? (
          visitState === 'feedback' ? (
            <View style={styles.feedbackRow}>
              {([
                { key: 'loved' as VisitFeedback, emoji: '❤️' },
                { key: 'neutral' as VisitFeedback, emoji: '😐' },
                { key: 'disliked' as VisitFeedback, emoji: '👎' },
              ]).map((opt) => (
                <Pressable
                  key={opt.key}
                  style={styles.feedbackBtn}
                  onPress={() => void handleFeedback(opt.key)}
                >
                  <Text>{opt.emoji}</Text>
                </Pressable>
              ))}
              <Pressable style={styles.feedbackBtn} onPress={() => void handleFeedback()}>
                <Text style={{ fontSize: 11, color: colors.textMuted }}>→</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={[styles.visitBtn, visitState === 'done' && styles.visitBtnDone]}
              onPress={handleVisit}
              disabled={visitState !== 'idle'}
            >
              {visitState === 'loading'
                ? <ActivityIndicator size="small" color={colors.brand} />
                : <Text style={[styles.visitText, visitState === 'done' && styles.visitTextDone]}>
                    {visitState === 'done' ? '✓ Visité' : '📍 J\'y vais'}
                  </Text>}
            </Pressable>
          )
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: 0 },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.lg },

  stepRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },

  timeline: { alignItems: 'center', width: 20 },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 4, minHeight: 40 },

  stepCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
    marginBottom: spacing.md,
  },
  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  stepLabel: { ...typography.label, color: colors.brand, textTransform: 'uppercase', letterSpacing: 0.6 },
  stepUniverse: { ...typography.caption, color: colors.textMuted },
  placeName: { ...typography.heading, color: colors.textPrimary },
  placeRating: { ...typography.caption, color: colors.textSecondary },
  reason: { ...typography.caption, color: colors.textMuted, marginTop: 2, fontStyle: 'italic' },

  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionText: { fontSize: 16 },
  visitBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  visitBtnDone: { borderColor: colors.success, backgroundColor: `${colors.success}18` },
  visitText: { ...typography.caption, color: colors.brand },
  visitTextDone: { color: colors.success },
  feedbackRow: { flex: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
  feedbackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },

  empty: { padding: spacing.lg, alignItems: 'center' },
  emptyText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
});
