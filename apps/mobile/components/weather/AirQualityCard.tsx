import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '../ui';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type { AirQuality } from '../../lib/services/weather';

/**
 * Échelle européenne (EAQI), graduée de 0 à 100+. Les seuils et les couleurs
 * suivent la norme officielle : on ne réinvente pas une échelle maison sur un
 * sujet de santé publique.
 */
const LEVELS: Record<AirQuality['level'], { label: string; color: string; advice: string }> = {
  good: {
    label: 'Bonne', color: '#2BB673',
    advice: 'Idéal pour toutes les activités extérieures.',
  },
  fair: {
    label: 'Correcte', color: '#A8CF45',
    advice: 'Aucune restriction pour la plupart des gens.',
  },
  moderate: {
    label: 'Moyenne', color: '#F2B705',
    advice: 'Les personnes sensibles peuvent limiter les efforts prolongés.',
  },
  poor: {
    label: 'Mauvaise', color: '#E5484D',
    advice: 'Réduis les activités intenses en extérieur.',
  },
  very_poor: {
    label: 'Très mauvaise', color: '#8B4FD6',
    advice: 'Privilégie les activités en intérieur.',
  },
};

function Pollutant({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <View style={styles.pollutant}>
      <Text style={styles.pollutantLabel}>{label}</Text>
      <Text style={styles.pollutantValue}>
        {Math.round(value)}<Text style={styles.unit}> {unit}</Text>
      </Text>
    </View>
  );
}

export function AirQualityCard({ air }: { air: AirQuality }) {
  const level = LEVELS[air.level];
  // L'échelle sature à 100 : au-delà, la jauge reste pleine.
  const ratio = Math.min(air.index / 100, 1);

  return (
    <GlassCard style={styles.card} rounded={radius.lg}>
      <View style={styles.inner}>
        <Text style={styles.title}>Qualité de l'air</Text>

        <View style={styles.headline}>
          <Text style={[styles.index, { color: level.color }]}>{Math.round(air.index)}</Text>
          <View style={styles.headlineText}>
            <Text style={styles.level}>{level.label}</Text>
            <Text style={styles.scale}>Indice européen</Text>
          </View>
        </View>

        <View style={styles.track}>
          <LinearGradient
            colors={['#2BB673', '#A8CF45', '#F2B705', '#E5484D', '#8B4FD6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.cursor, { left: `${ratio * 100}%` }]} />
        </View>

        <Text style={styles.advice}>{level.advice}</Text>

        <View style={styles.pollutants}>
          <Pollutant label="PM2.5" value={air.pm25} unit="µg/m³" />
          <Pollutant label="PM10" value={air.pm10} unit="µg/m³" />
          <Pollutant label="O₃" value={air.ozone} unit="µg/m³" />
          <Pollutant label="NO₂" value={air.nitrogenDioxide} unit="µg/m³" />
        </View>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.md, marginTop: spacing.md },
  inner: { padding: spacing.md, gap: spacing.sm },
  title: {
    ...typography.label, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase',
  },
  headline: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  index: { fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  headlineText: { gap: 2 },
  level: { ...typography.heading, color: colors.textPrimary },
  scale: { ...typography.caption, color: 'rgba(255,255,255,0.5)' },
  track: {
    height: 6, borderRadius: 3, overflow: 'hidden', justifyContent: 'center',
    marginTop: 4,
  },
  cursor: {
    position: 'absolute', width: 3, height: 12, borderRadius: 2,
    backgroundColor: '#fff', marginLeft: -1.5,
  },
  advice: { ...typography.caption, color: 'rgba(255,255,255,0.75)', lineHeight: 18 },
  pollutants: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)',
  },
  pollutant: { alignItems: 'center', gap: 2 },
  pollutantLabel: { ...typography.label, color: 'rgba(255,255,255,0.55)' },
  pollutantValue: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  unit: { ...typography.label, color: 'rgba(255,255,255,0.45)', fontWeight: '500' },
});
