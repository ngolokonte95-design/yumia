import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CrystalFill, GradientText, PressableScale } from '../ui';
import { colors, gradients, spacing, typography } from '../../theme/tokens';
import type { CalendarEvent } from '../../lib/calendar-api';
import { dayKey, isSameDay, monthGrid, weekdaysFor } from '../../lib/calendar-format';
import { useI18n } from '../../lib/useI18n';
import { haptics } from '../../lib/useHaptics';

/** Nombre maximal de points affichés sous un jour. */
const MAX_DOTS = 3;
const DAY = 38;

/**
 * Grille mensuelle — DA du 18/11/2026.
 *
 * Toujours 6 semaines (42 cases), même quand le mois en occupe 5 : une hauteur
 * fixe évite que la grille saute en changeant de mois, ce qui est le principal
 * défaut perçu des calendriers mal faits.
 *
 * Une seule couleur : le jour choisi se remplit du dégradé de marque avec un
 * halo doux ; aujourd'hui est serti de cristal ; un jour occupé est voilé de
 * verre, ses événements marqués de points blancs (plus de couleur par
 * catégorie).
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
  const { locale } = useI18n();
  const days = monthGrid(month);
  const today = new Date();

  return (
    <View style={styles.wrap}>
      <View style={styles.weekdays}>
        {weekdaysFor(locale).map((d, i) => (
          <Text key={i} style={[styles.weekday, i >= 5 && styles.weekend]}>{d}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {days.map((day) => {
          const inMonth = day.getMonth() === month.getMonth();
          const isSelected = isSameDay(day, selected);
          const isToday = isSameDay(day, today);
          const events = eventsByDay.get(dayKey(day)) ?? [];
          const busy = events.length > 0;

          return (
            <PressableScale
              key={day.toISOString()}
              scaleTo={0.88}
              haptic={false}
              onPress={() => { if (!isSelected) haptics.select(); onSelect(day); }}
              style={styles.cell}
            >
              <View style={[
                styles.day,
                isSelected && styles.daySelected,
                !isSelected && busy && inMonth && styles.dayBusy,
              ]}>
                {/* Les fonds sont découpés à part : sur iOS, couper les coins
                    du rond lui-même effacerait son halo. */}
                {isSelected || isToday ? (
                  <View style={styles.dayClip} pointerEvents="none">
                    {isSelected ? (
                      <>
                        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                        <LinearGradient colors={gradients.glassSheen} style={StyleSheet.absoluteFill} />
                      </>
                    ) : (
                      <CrystalFill edge={1.4} core="#101018" />
                    )}
                  </View>
                ) : null}
                {isToday && !isSelected ? (
                  <GradientText style={[styles.dayTxt, styles.dayTodayTxt]} colors={gradients.crystal}>
                    {String(day.getDate())}
                  </GradientText>
                ) : (
                  <Text style={[
                    styles.dayTxt,
                    !inMonth && styles.dayOut,
                    isSelected && styles.daySelectedTxt,
                  ]}>
                    {day.getDate()}
                  </Text>
                )}
              </View>

              <View style={styles.dots}>
                {events.slice(0, MAX_DOTS).map((e) => (
                  <View key={e.occurrenceId} style={[styles.dot, !inMonth && styles.dotOut]} />
                ))}
                {/* Au-delà de 3, un point atténué signale « et d'autres » plutôt
                    que d'entasser des points illisibles. */}
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
  wrap: { paddingHorizontal: spacing.xs },
  weekdays: { flexDirection: 'row', marginBottom: 6 },
  weekday: {
    flex: 1, textAlign: 'center',
    ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2,
  },
  weekend: { opacity: 0.6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`, alignItems: 'center',
    paddingVertical: 2, gap: 3,
  },
  day: {
    width: DAY, height: DAY, borderRadius: DAY / 2,
    alignItems: 'center', justifyContent: 'center',
  },
  dayClip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: DAY / 2, overflow: 'hidden' },
  daySelected: {
    shadowColor: colors.brand, shadowOpacity: 0.55, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
  },
  dayBusy: { backgroundColor: 'rgba(255,255,255,0.06)' },
  dayTxt: { ...typography.body, color: colors.textPrimary, fontWeight: '600', fontVariant: ['tabular-nums'] },
  dayOut: { color: colors.textMuted, opacity: 0.4 },
  dayTodayTxt: { fontWeight: '900' },
  daySelectedTxt: { color: '#fff', fontWeight: '900' },
  dots: { flexDirection: 'row', gap: 3, height: 4 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.85)' },
  dotOut: { opacity: 0.35 },
  dotMore: { backgroundColor: 'rgba(255,255,255,0.4)' },
});
