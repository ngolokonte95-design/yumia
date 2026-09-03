import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard, Reveal } from '../ui';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatLocalWeekday, kindEmoji, type DayPoint } from '../../lib/services/weather';
import { useI18n } from '../../lib/useI18n';

/**
 * Prévisions sur 10 jours.
 *
 * Chaque jour affiche une barre de température **positionnée sur l'amplitude
 * globale de la période**, pas sur sa propre amplitude : c'est ce qui permet de
 * voir d'un coup d'œil qu'un jour est plus froid qu'un autre, ce qu'une barre
 * normalisée par ligne rendrait impossible.
 */
export function DailyForecast({
  days, utcOffsetSeconds,
}: {
  days: DayPoint[];
  utcOffsetSeconds: number;
}) {
  const { t, locale } = useI18n();
  if (days.length === 0) return null;

  const globalMin = Math.min(...days.map((d) => d.minC));
  const globalMax = Math.max(...days.map((d) => d.maxC));
  const span = Math.max(globalMax - globalMin, 1);

  return (
    <GlassCard style={styles.card} rounded={radius.lg}>
      <Text style={styles.title}>{t('wx_10day_title')}</Text>

      {days.map((day, i) => {
        const left = ((day.minC - globalMin) / span) * 100;
        const width = Math.max(((day.maxC - day.minC) / span) * 100, 8);

        return (
          <Reveal key={day.date} index={i} from="fade">
            <View style={styles.row}>
              <Text style={styles.day}>
                {i === 0 ? t('wx_today_short') : formatLocalWeekday(day.date, utcOffsetSeconds, locale)}
              </Text>

              <View style={styles.iconCol}>
                <Text style={styles.icon}>{kindEmoji(day.kind)}</Text>
                {day.precipitationChance >= 20 && (
                  <Text style={styles.chance}>{day.precipitationChance}%</Text>
                )}
              </View>

              <Text style={styles.min}>{day.minC}°</Text>

              <View style={styles.track}>
                <LinearGradient
                  colors={['#5AB4F0', '#F2B705', '#E8621A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.bar, { left: `${left}%`, width: `${width}%` }]}
                />
              </View>

              <Text style={styles.max}>{day.maxC}°</Text>
            </View>
          </Reveal>
        );
      })}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.md, marginTop: spacing.md, paddingBottom: spacing.sm },
  title: {
    ...typography.label,
    color: 'rgba(255,255,255,0.65)',
    textTransform: 'uppercase',
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: 7, gap: spacing.sm,
  },
  day: { ...typography.body, color: colors.textPrimary, width: 42, fontWeight: '600' },
  iconCol: { width: 40, alignItems: 'center' },
  icon: { fontSize: 18 },
  chance: { ...typography.label, color: '#7EC8F5', fontSize: 10 },
  min: { ...typography.body, color: 'rgba(255,255,255,0.55)', width: 32, textAlign: 'right' },
  track: {
    flex: 1, height: 5, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  bar: { position: 'absolute', top: 0, bottom: 0, borderRadius: 3 },
  max: { ...typography.body, color: colors.textPrimary, width: 34, textAlign: 'right', fontWeight: '700' },
});
