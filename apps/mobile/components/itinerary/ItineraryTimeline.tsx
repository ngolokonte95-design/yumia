/**
 * Frise d'un itinéraire : résumé chiffré en tête, puis les étapes reliées par
 * une ligne au dégradé de marque qui se dessine de haut en bas, étape après
 * étape. Partagée par l'écran de génération et le détail d'un itinéraire
 * enregistré.
 *
 * Une seule couleur d'accent, celle de la marque (orange → violet) — pas de
 * couleur par humeur ni par univers (demande de l'utilisateur, 17/11/2026).
 */
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';
import { colors, elevation, gradients, radius, spacing, typography } from '../../theme/tokens';
import { AnimatedNumber, GradientText, Reveal } from '../ui';

export interface TimelineStep {
  time: string;
  name: string;
  description: string;
  duration: string;
  emoji: string;
  tips?: string;
  placePhoto?: string;
  placeRating?: number;
}

/** Délai entre l'apparition de deux étapes (la ligne suit le même rythme). */
const STEP_DELAY = 140;

// ── Résumé ───────────────────────────────────────────────────────────────────

export function ItinerarySummary({
  summary,
  stepCount,
  timeRange,
  stepsLabel,
  budget,
}: {
  summary: string;
  stepCount: number;
  /** « 19:00 → 23:30 », ou une seule heure. */
  timeRange: string;
  /** Libellé des étapes, sans le nombre (« étapes »). */
  stepsLabel: string;
  /** Emoji + libellé du budget, s'il est connu. */
  budget?: { emoji: string; label: string };
}) {
  return (
    <Reveal index={0} style={styles.summaryCard}>
      <View style={styles.summaryHead}>
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summaryBadge}>
          <Text style={styles.summaryBadgeText}>✨</Text>
        </LinearGradient>
        <Text style={styles.summaryText}>{summary}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <AnimatedNumber value={stepCount} style={styles.statNumber} />
          <Text style={styles.statLabel} numberOfLines={1}>{stepsLabel}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{timeRange}</Text>
          <Text style={styles.statLabel}>🕐</Text>
        </View>
        {budget ? (
          <>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{budget.emoji}</Text>
              <Text style={styles.statLabel} numberOfLines={1}>{budget.label}</Text>
            </View>
          </>
        ) : null}
      </View>
    </Reveal>
  );
}

/** « 19:00 → 23:30 » à partir des étapes. */
export function stepsTimeRange(steps: Array<{ time: string }>): string {
  if (steps.length === 0) return '';
  const first = steps[0].time;
  const last = steps[steps.length - 1].time;
  return first === last ? first : `${first} → ${last}`;
}

// ── Frise ────────────────────────────────────────────────────────────────────

export function ItineraryTimeline<S extends TimelineStep>({
  steps,
  renderActions,
}: {
  steps: S[];
  /** Boutons propres à l'écran (voir le lieu, voir la journée…). */
  renderActions?: (step: S, index: number) => ReactNode;
}) {
  return (
    <View style={styles.timeline}>
      {steps.map((step, i) => (
        <TimelineRow
          key={`${i}-${step.time}-${step.name}`}
          step={step}
          index={i}
          last={i === steps.length - 1}
          actions={renderActions?.(step, i)}
        />
      ))}
    </View>
  );
}

function TimelineRow({
  step, index, last, actions,
}: {
  step: TimelineStep;
  index: number;
  last: boolean;
  actions?: ReactNode;
}) {
  return (
    <View style={styles.row}>
      {/* Rail : pastille de l'étape + segment qui se dessine vers la suivante. */}
      <View style={styles.rail}>
        <Reveal index={Math.min(index, 8) + 1} from="fade">
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.node}>
            <Text style={styles.nodeEmoji}>{step.emoji}</Text>
          </LinearGradient>
        </Reveal>
        {!last ? <Connector index={index} /> : null}
      </View>

      <Reveal index={Math.min(index, 8) + 1} style={styles.card}>
        {step.placePhoto ? (
          <Image source={{ uri: step.placePhoto }} style={styles.photo} contentFit="cover" transition={200} />
        ) : null}
        <View style={styles.body}>
          <View style={styles.topRow}>
            <GradientText style={styles.time}>{step.time}</GradientText>
            {step.duration ? (
              <View style={styles.durationPill}>
                <Text style={styles.durationText}>⏱ {step.duration}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.name}>{step.name}</Text>
          <Text style={styles.desc}>{step.description}</Text>

          {step.placeRating ? (
            <View style={styles.ratingPill}>
              <Text style={styles.ratingText}>⭐ {step.placeRating.toFixed(1)}</Text>
            </View>
          ) : null}

          {step.tips ? (
            <View style={styles.tipBox}>
              <Text style={styles.tipText}>💡 {step.tips}</Text>
            </View>
          ) : null}

          {actions}
        </View>
      </Reveal>
    </View>
  );
}

/** Segment de ligne au dégradé de marque, qui se « dessine » vers le bas. */
function Connector({ index }: { index: number }) {
  const progress = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    progress.value = reduced
      ? 1
      : withDelay(260 + Math.min(index, 8) * STEP_DELAY, withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }));
  }, [index, progress, reduced]);
  const drawn = useAnimatedStyle(() => ({ transform: [{ scaleY: progress.value }] }));

  return (
    <View style={styles.connector}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.connectorOrigin, drawn]}>
        <LinearGradient colors={[colors.brand, colors.accent]} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

const NODE = 46;

const styles = StyleSheet.create({
  // Résumé
  summaryCard: {
    padding: spacing.md, borderRadius: radius.lg, gap: spacing.md, marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
    ...elevation.medium,
  },
  summaryHead: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  summaryBadge: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  summaryBadgeText: { fontSize: 16 },
  summaryText: { flex: 1, ...typography.body, color: colors.textPrimary, lineHeight: 22, fontStyle: 'italic' },
  statsRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.xs,
    borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)',
  },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  statNumber: { color: colors.textPrimary, fontSize: 24, fontWeight: '900', padding: 0, textAlign: 'center' },
  statValue: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  statLabel: { ...typography.label, color: colors.textSecondary, fontSize: 11 },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.14)' },

  // Frise
  timeline: {},
  row: { flexDirection: 'row', gap: spacing.md },
  rail: { width: NODE, alignItems: 'center' },
  node: {
    width: NODE, height: NODE, borderRadius: NODE / 2, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.bg,
    ...elevation.glowBrand,
  },
  nodeEmoji: { fontSize: 20 },
  connector: {
    flex: 1, width: 3, minHeight: 24, marginVertical: 6, borderRadius: 2, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  connectorOrigin: { transformOrigin: 'top' },

  card: {
    flex: 1, marginBottom: spacing.lg, borderRadius: radius.lg, overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  photo: { width: '100%', height: 170 },
  body: { padding: spacing.md, gap: 6 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  time: { fontSize: 15, fontWeight: '900', letterSpacing: 0.3 },
  durationPill: {
    paddingVertical: 3, paddingHorizontal: 9, borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)',
  },
  durationText: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  name: { color: colors.textPrimary, fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  // Texte généré par l'IA : en clair pour rester lisible sur le fond sombre.
  desc: { color: colors.textPrimary, fontSize: 14, lineHeight: 20, opacity: 0.92 },
  ratingPill: {
    alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 9, borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  ratingText: { color: colors.textPrimary, fontSize: 12, fontWeight: '700' },
  tipBox: {
    marginTop: 2, padding: spacing.sm, borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  tipText: { color: colors.textPrimary, fontSize: 13, fontStyle: 'italic', lineHeight: 18 },
});
