/**
 * StreakModal — détails de la série de l'utilisateur.
 * Calendrier 14 jours (vert = visite, gris = manqué, or = aujourd'hui),
 * record personnel, et CTA freeze streak (Plus).
 */
import { Modal, View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { PassportStats, PassportVisit } from '../lib/usePassportStats';

interface Props {
  visible: boolean;
  onClose: () => void;
  stats: PassportStats;
  visits: PassportVisit[];
  isPlus: boolean;
}

export function StreakModal({ visible, onClose, stats, visits, isPlus }: Props) {
  const router = useRouter();
  const days = buildLast14Days(visits);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />

        <Text style={styles.title}>🔥 Ta série</Text>

        {/* Métriques */}
        <View style={styles.metricsRow}>
          <MetricBox label="Série actuelle" value={`${stats.streak.current}j`} highlight />
          <MetricBox label="Meilleur record" value={`${stats.streak.best}j`} />
          {stats.streak.lastActivityDay ? (
            <MetricBox
              label="Dernière visite"
              value={new Date(stats.streak.lastActivityDay).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'short',
              })}
            />
          ) : null}
        </View>

        {/* Calendrier 14 jours */}
        <Text style={styles.calLabel}>14 derniers jours</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.calendar}
        >
          {days.map((d) => (
            <View key={d.dateStr} style={styles.dayCol}>
              <View style={[
                styles.dayDot,
                d.isToday ? styles.dayToday : d.visited ? styles.dayVisited : styles.dayMissed,
              ]} />
              <Text style={styles.dayLabel}>{d.shortLabel}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Teaser freeze */}
        {!isPlus ? (
          <View style={styles.freezeBox}>
            <Text style={styles.freezeTitle}>🧊 Freeze de série</Text>
            <Text style={styles.freezeSub}>
              Protège ta série les jours où tu ne sors pas. Disponible avec YUMIA Plus.
            </Text>
            <Pressable style={styles.freezeBadge} onPress={() => { onClose(); router.push('/plus'); }}>
              <Text style={styles.freezeBadgeText}>Passer à Plus →</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.freezeBox}>
            <Text style={styles.freezeTitle}>🧊 Freeze activé</Text>
            <Text style={styles.freezeSub}>
              Ta série est protégée. Tu peux manquer un jour sans la perdre.
            </Text>
          </View>
        )}

        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>Fermer</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function MetricBox({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={[styles.metricBox, highlight && styles.metricBoxHighlight]}>
      <Text style={[styles.metricValue, highlight && styles.metricValueHighlight]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

interface DayInfo {
  dateStr: string;
  shortLabel: string;
  visited: boolean;
  isToday: boolean;
}

function buildLast14Days(visits: PassportVisit[]): DayInfo[] {
  const visitedDates = new Set(
    visits.map((v) => v.visitedAt.slice(0, 10)),
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days: DayInfo[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const shortLabel = d.toLocaleDateString('fr-FR', { weekday: 'narrow' });
    days.push({
      dateStr,
      shortLabel,
      visited: visitedDates.has(dateStr),
      isToday: i === 0,
    });
  }
  return days;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'center' },

  metricsRow: { flexDirection: 'row', gap: spacing.sm },
  metricBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  metricBoxHighlight: {
    backgroundColor: `${colors.warning}18`,
    borderColor: colors.warning,
  },
  metricValue: { ...typography.heading, color: colors.textPrimary, fontSize: 22 },
  metricValueHighlight: { color: colors.warning },
  metricLabel: { ...typography.label, color: colors.textMuted, textAlign: 'center' },

  calLabel: { ...typography.caption, color: colors.textMuted },
  calendar: { gap: spacing.sm, paddingVertical: spacing.xs },
  dayCol: { alignItems: 'center', gap: 6, width: 32 },
  dayDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  dayToday: { backgroundColor: colors.brand },
  dayVisited: { backgroundColor: colors.success },
  dayMissed: { backgroundColor: colors.surfaceElevated },
  dayLabel: { ...typography.label, color: colors.textMuted, fontSize: 10 },

  freezeBox: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  freezeTitle: { ...typography.heading, color: colors.textPrimary },
  freezeSub: { ...typography.body, color: colors.textSecondary, lineHeight: 20 },
  freezeBadge: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
  },
  freezeBadgeText: { ...typography.label, color: colors.textMuted },

  closeBtn: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  closeBtnText: { ...typography.body, color: colors.textSecondary },
});
