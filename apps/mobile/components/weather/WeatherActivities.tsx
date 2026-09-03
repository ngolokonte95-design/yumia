import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { GlassCard, PressableScale, Reveal } from '../ui';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { activitiesFor, type Coordinates, type CurrentWeather } from '../../lib/services/weather';
import { useI18n } from '../../lib/useI18n';
import { universeLabel } from '../../lib/universeMeta';

/**
 * Activités recommandées selon la météo du moment.
 *
 * C'est le pont entre la météo et le cœur de Yumia : chaque carte ouvre
 * l'univers correspondant, donc la liste réelle des lieux autour du point
 * observé — sa vraie position, ou la ville recherchée si l'utilisateur en a
 * choisi une. Sans `coords`, l'écran univers retombait toujours sur le GPS,
 * même en consultant la météo d'une ville lointaine.
 */
export function WeatherActivities({
  current, coords, cityLabel,
}: {
  current: CurrentWeather;
  /** Point observé : la ville choisie, ou la position réelle par défaut. */
  coords: Coordinates;
  /** Nom de la ville choisie, à afficher dans l'écran univers. Absent = position réelle. */
  cityLabel?: string;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const suggestions = activitiesFor(current);

  if (suggestions.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>{t('wxa_title')}</Text>
      <Text style={styles.subtitle}>{t('wxa_subtitle')}</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {suggestions.map((s, i) => (
          <Reveal key={s.universe} index={i} from="fade">
            <PressableScale
              haptic
              onPress={() => {
                const params = new URLSearchParams({ u: s.universe });
                // On ne force les coordonnées que pour une ville recherchée —
                // avec la position réelle, l'écran univers suit le GPS en direct
                // (utile si l'utilisateur se déplace), comme avant cette fonctionnalité.
                if (cityLabel) {
                  params.set('lat', String(coords.lat));
                  params.set('lng', String(coords.lng));
                  params.set('place', cityLabel);
                }
                router.push(`/universe?${params.toString()}` as never);
              }}
            >
              <GlassCard rounded={radius.md} style={styles.card}>
                {/* La suggestion la plus pertinente se distingue par un liseré
                    de marque plutôt que par une ombre colorée : sur iOS, un
                    halo se diffuse en tache floue autour de la carte. */}
                <View style={[styles.cardInner, i === 0 && styles.cardTop]}>
                  <Text style={styles.emoji}>{s.emoji}</Text>
                  <Text style={styles.label} numberOfLines={1}>{universeLabel(t, s.universe)}</Text>
                  <Text style={styles.reason} numberOfLines={1}>{t(s.reasonKey)}</Text>
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
