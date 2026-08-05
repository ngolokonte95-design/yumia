import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { GlassCard, PressableScale, Reveal } from '../ui';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { activitiesFor, type CurrentWeather } from '../../lib/services/weather';

/**
 * Activités recommandées selon la météo du moment.
 *
 * C'est le pont entre la météo et le cœur de Yumia : chaque carte ouvre
 * l'univers correspondant, donc la liste réelle des lieux autour de soi. Sans
 * ce lien, la météo ne serait qu'un gadget de plus.
 */
export function WeatherActivities({ current }: { current: CurrentWeather }) {
  const router = useRouter();
  const suggestions = activitiesFor(current);

  if (suggestions.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>À faire maintenant</Text>
      <Text style={styles.subtitle}>Sélectionné selon la météo actuelle</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {suggestions.map((s, i) => (
          <Reveal key={s.universe} index={i} from="fade">
            <PressableScale
              haptic
              onPress={() => router.push(`/universe?u=${s.universe}` as never)}
            >
              <GlassCard rounded={radius.md} style={styles.card}>
                {/* La suggestion la plus pertinente se distingue par un liseré
                    de marque plutôt que par une ombre colorée : sur iOS, un
                    halo se diffuse en tache floue autour de la carte. */}
                <View style={[styles.cardInner, i === 0 && styles.cardTop]}>
                  <Text style={styles.emoji}>{s.emoji}</Text>
                  <Text style={styles.label} numberOfLines={1}>{s.label}</Text>
                  <Text style={styles.reason} numberOfLines={1}>{s.reason}</Text>
                </View>
              </GlassCard>
            </PressableScale>
          </Reveal>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.lg },
  title: {
    ...typography.title, color: colors.textPrimary, paddingHorizontal: spacing.md,
  },
  subtitle: {
    ...typography.caption, color: 'rgba(255,255,255,0.55)',
    paddingHorizontal: spacing.md, marginTop: 2, marginBottom: spacing.sm,
  },
  row: { paddingHorizontal: spacing.md, gap: spacing.sm, paddingVertical: 4 },
  card: { width: 124, height: 124 },
  cardInner: {
    flex: 1, padding: spacing.md, justifyContent: 'space-between',
  },
  cardTop: {
    borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md,
  },
  emoji: { fontSize: 30 },
  label: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  reason: { ...typography.label, color: 'rgba(255,255,255,0.6)' },
});
