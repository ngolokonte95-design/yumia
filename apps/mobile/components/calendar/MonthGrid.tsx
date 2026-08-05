import { StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '../ui';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { CATEGORY_META, type CalendarEvent, type EventCategory } from '../../lib/calendar-api';
import { dayKey, isSameDay, monthGrid, WEEKDAYS } from '../../lib/calendar-format';

/** Nombre maximal de pastilles affichées sous un jour. */
const MAX_DOTS = 3;

/**
 * Grille mensuelle.
 *
 * Toujours 6 semaines (42 cases), même quand le mois en occupe 5 : une hauteur
 * fixe évite que la grille saute en changeant de mois, ce qui est le principal
 * défaut perçu des calendriers mal faits.
 */
export function MonthGrid({
  month, selected, eventsByDay, onSelect,
}: {
  month: Date;
  selected: Date;
  /** Événements indexés par clé de jour locale. */
  eventsByDay: Map<string, CalendarEvent[]>;
  onSelect: (day: Date) => void;
}) {
  const days = monthGrid(month);
  const today = new Date();

  return (
    <View style={styles.wrap}>
      <View style={styles.weekdays}>
        {WEEKDAYS.map((d, i) => (
          <Text key={i} style={styles.weekday}>{d}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {days.map((day) => {
          const inMonth = day.getMonth() === month.getMonth();
          const isSelected = isSameDay(day, selected);
          const isToday = isSameDay(day, today);
          const events = eventsByDay.get(dayKey(day)) ?? [];

          return (
            <PressableScale
              key={day.toISOString()}
              scaleTo={0.9}
              onPress={() => onSelect(day)}
              style={styles.cell}
            >
              <View style={[
                styles.dayCircle,
                isToday && !isSelected && styles.dayToday,
                isSelected && styles.daySelected,
              ]}>
                <Text style={[
                  styles.dayTxt,
                  !inMonth && styles.dayOut,
                  isToday && !isSelected && styles.dayTodayTxt,
                  isSelected && styles.daySelectedTxt,
                ]}>
                  {day.getDate()}
                </Text>
              </View>

              <View style={styles.dots}>
                {events.slice(0, MAX_DOTS).map((e) => (
                  <View
                    key={e.occurrenceId}
                    style={[
                      styles.dot,
                      { backgroundColor: CATEGORY_META[e.category as EventCategory]?.color ?? colors.textMuted },
                    ]}
                  />
                ))}
                {/* Au-delà de 3, un point neutre signale « et d'autres » plutôt
                    que d'entasser des pastilles illisibles. */}
                {events.length > MAX_DOTS && <View style={[styles.dot, styles.dotMore]} />}
              </View>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.sm },
  weekdays: { flexDirection: 'row', marginBottom: 4 },
  weekday: {
    flex: 1, textAlign: 'center',
    ...typography.label, color: colors.textMuted, textTransform: 'uppercase',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`, alignItems: 'center',
    paddingVertical: 3, gap: 3,
  },
  dayCircle: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  dayToday: { borderWidth: 1.5, borderColor: colors.brand },
  daySelected: { backgroundColor: colors.brand },
  dayTxt: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  dayOut: { color: colors.textMuted, opacity: 0.45 },
  dayTodayTxt: { color: colors.brandSoft, fontWeight: '800' },
  daySelectedTxt: { color: '#fff', fontWeight: '800' },
  dots: { flexDirection: 'row', gap: 3, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dotMore: { backgroundColor: colors.textMuted, opacity: 0.6 },
});
