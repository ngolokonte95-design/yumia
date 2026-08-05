import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { GlassCard } from '../ui';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatLocalHour, kindEmoji, type HourPoint } from '../../lib/services/weather';

/** Nombre de créneaux affichés — 24 h suffisent, au-delà on lit les 10 jours. */
const HOURS = 24;

/**
 * Bande horaire des prochaines heures. Le premier créneau est marqué
 * « Maintenant » plutôt que par son heure, comme repère de lecture.
 */
export function HourlyStrip({
  hours, utcOffsetSeconds,
}: {
  hours: HourPoint[];
  utcOffsetSeconds: number;
}) {
  const slice = hours.slice(0, HOURS);
  if (slice.length === 0) return null;

  return (
    <GlassCard style={styles.card} rounded={radius.lg}>
      <Text style={styles.title}>Prochaines 24 heures</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {slice.map((h, i) => (
          <View key={h.time} style={styles.hour}>
            <Text style={styles.hourLabel}>
              {i === 0 ? 'Maint.' : formatLocalHour(h.time, utcOffsetSeconds)}
            </Text>
            <Text style={styles.hourIcon}>{kindEmoji(h.kind, h.isDay)}</Text>
            {h.precipitationChance >= 20 ? (
              <Text style={styles.rainChance}>{h.precipitationChance}%</Text>
            ) : (
              <View style={styles.rainSpacer} />
            )}
            <Text style={styles.hourTemp}>{h.tempC}°</Text>
          </View>
        ))}
      </ScrollView>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.md, marginTop: spacing.md },
  title: {
    ...typography.label,
    color: 'rgba(255,255,255,0.65)',
    textTransform: 'uppercase',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  row: { paddingHorizontal: spacing.sm, paddingBottom: spacing.md },
  hour: { alignItems: 'center', width: 58, gap: 6 },
  hourLabel: { ...typography.caption, color: 'rgba(255,255,255,0.75)' },
  hourIcon: { fontSize: 22 },
  rainChance: { ...typography.label, color: '#7EC8F5' },
  // Réserve la place du pourcentage même absent, pour que les températures
  // restent alignées d'un créneau à l'autre.
  rainSpacer: { height: 13 },
  hourTemp: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
});
