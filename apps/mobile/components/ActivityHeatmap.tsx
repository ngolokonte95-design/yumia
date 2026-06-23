/**
 * ActivityHeatmap — grille 90 jours style GitHub Contributions.
 * 13 colonnes (semaines) × 7 lignes (jours), colorées selon l'intensité d'activité.
 */
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';

interface Props {
  data: Record<string, number>;
  days?: number;
}

const CELL = 10;
const GAP = 2;
const COLS = 13;
const ROWS = 7;

function intensityColor(count: number): string {
  if (count === 0) return colors.surfaceElevated;
  if (count === 1) return `${colors.brand}55`;
  if (count === 2) return `${colors.brand}99`;
  return colors.brand;
}

const DAY_LABELS = ['L', '', 'M', '', 'J', '', 'S'];

export function ActivityHeatmap({ data = {}, days = 91 }: Props) {
  // Génère les jours de la grille : COLS semaines × ROWS jours = 91 cases
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Aligne le début sur le lundi de la première semaine affichée
  const totalCells = COLS * ROWS;
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - (totalCells - 1));

  const cells: { date: string; count: number }[] = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const isFuture = d > today;
    cells.push({ date: key, count: isFuture ? -1 : (data[key] ?? 0) });
  }

  // Transpose en colonnes (semaines)
  const cols: typeof cells[] = [];
  for (let col = 0; col < COLS; col++) {
    cols.push(cells.slice(col * ROWS, col * ROWS + ROWS));
  }

  const total = Object.values(data).reduce((a, b) => a + b, 0);

  return (
    <View style={styles.wrapper}>
      <View style={styles.labelRow}>
        {DAY_LABELS.map((l, i) => (
          <Text key={i} style={styles.dayLabel}>{l}</Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cols.map((col, ci) => (
          <View key={ci} style={styles.col}>
            {col.map(({ date, count }, ri) => (
              <View
                key={ri}
                style={[
                  styles.cell,
                  { backgroundColor: count < 0 ? 'transparent' : intensityColor(count) },
                ]}
              />
            ))}
          </View>
        ))}
      </View>
      <Text style={styles.legend}>{total} visite{total !== 1 ? 's' : ''} sur 90 jours</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  labelRow: {
    flexDirection: 'column',
    position: 'absolute',
    left: 0,
    top: 0,
    gap: GAP,
    paddingRight: spacing.xs,
  },
  dayLabel: { fontSize: 8, color: colors.textMuted, height: CELL, lineHeight: CELL, width: 10, textAlign: 'center' },
  grid: { flexDirection: 'row', gap: GAP, marginLeft: 14 },
  col: { flexDirection: 'column', gap: GAP },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: 2,
  },
  legend: { ...typography.label, color: colors.textMuted, marginTop: spacing.xs },
});
