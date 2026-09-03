import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { PressableScale } from '../ui';
import { elevation, gradients, radius, spacing, typography } from '../../theme/tokens';
import { useWeatherReport } from '../../lib/useWeatherReport';
import {
  activitiesFor, dayMomentAt, KIND_LABEL, kindEmoji,
  type DayMoment, type WeatherKind,
} from '../../lib/services/weather';
import { useI18n } from '../../lib/useI18n';
import { universeLabel } from '../../lib/universeMeta';
import { weatherKindLabel } from '../../lib/labelHelpers';

/** Même logique d'ambiance que l'écran météo, pour une continuité visuelle. */
function skyColors(kind: WeatherKind, moment: DayMoment): readonly string[] {
  if (moment === 'night') return gradients.weatherNight;
  if (moment === 'sunrise') return gradients.weatherSunrise;
  if (moment === 'sunset') return gradients.weatherSunset;
  switch (kind) {
    case 'clear':
    case 'partly_cloudy': return gradients.weatherClear;
    case 'thunderstorm': return gradients.weatherStorm;
    case 'snow': return gradients.weatherSnow;
    case 'fog': return gradients.weatherFog;
    case 'cloudy': return gradients.weatherCloudy;
    case 'rain':
    case 'heavy_rain':
    case 'drizzle': return gradients.weatherRain;
  }
}

/**
 * Bandeau météo de l'accueil, tout en haut de l'écran.
 *
 * Volontairement compact (une seule ligne) : c'est l'info la plus rapide à
 * vérifier en ouvrant l'app, elle ne doit pas prendre le pas sur le reste de
 * la page. La ville n'y est pas répétée puisqu'elle apparaît juste en dessous
 * dans le message d'accueil. L'aperçu de recommandation en fin de ligne est
 * ce qui distingue la météo Yumia d'un simple thermomètre.
 */
export function WeatherCard({ lat, lng }: { lat: number; lng: number }) {
  const router = useRouter();
  const { t } = useI18n();
  const { report } = useWeatherReport(lat, lng);

  // Pas de squelette : tant que la météo n'est pas là, mieux vaut ne rien
  // afficher que réserver un bandeau vide en haut de l'accueil.
  if (!report) return null;

  const { current, astro, coordinates } = report;
  const moment = dayMomentAt(new Date(), astro, coordinates.lat);
  const today = report.daily[0];
  const suggestion = activitiesFor(current, 1)[0];

  return (
    <PressableScale
      haptic
      scaleTo={0.97}
      onPress={() => router.push('/weather' as never)}
      style={styles.wrap}
    >
      <LinearGradient
        colors={skyColors(current.kind, moment) as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.4 }}
        style={styles.card}
      >
        <Text style={styles.icon}>{kindEmoji(current.kind, current.isDay)}</Text>

        <View style={styles.meta}>
          <Text style={styles.temp} numberOfLines={1}>
            {current.tempC}° · {weatherKindLabel(t, current.kind, KIND_LABEL[current.kind])}
          </Text>
          {today && (
            <Text style={styles.minmax}>↑{today.maxC}° ↓{today.minC}°</Text>
          )}
        </View>

        {suggestion && (
          <Text style={styles.suggestion} numberOfLines={1}>
            {suggestion.emoji} {universeLabel(t, suggestion.universe)}
          </Text>
        )}

        <Text style={styles.chevron}>›</Text>
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { ...elevation.medium, borderRadius: radius.lg },
  card: {
    borderRadius: radius.lg, overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  icon: { fontSize: 22 },
  meta: { gap: 0 },
  temp: { ...typography.body, color: '#fff', fontWeight: '700' },
  minmax: { ...typography.label, color: 'rgba(255,255,255,0.78)' },
  suggestion: {
    flex: 1, textAlign: 'right',
    ...typography.caption, color: 'rgba(255,255,255,0.9)', fontWeight: '600',
  },
  chevron: { fontSize: 20, color: 'rgba(255,255,255,0.75)', fontWeight: '700' },
});
