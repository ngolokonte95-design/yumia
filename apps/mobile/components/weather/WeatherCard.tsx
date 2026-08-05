import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { PressableScale } from '../ui';
import { colors, elevation, gradients, radius, spacing, typography } from '../../theme/tokens';
import { useWeatherReport } from '../../lib/useWeatherReport';
import {
  activitiesFor, dayMomentAt, KIND_LABEL, kindEmoji,
  type DayMoment, type WeatherKind,
} from '../../lib/services/weather';

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
 * Carte météo de l'accueil.
 *
 * Remplace la pastille de température, trop discrète pour laisser deviner
 * qu'un écran complet se cache derrière. La carte reprend l'ambiance du ciel
 * du moment et annonce déjà la valeur de Yumia : ce qu'il y a à faire par ce
 * temps-là.
 */
export function WeatherCard({ lat, lng, city }: { lat: number; lng: number; city?: string }) {
  const router = useRouter();
  const { report } = useWeatherReport(lat, lng);

  // Pas de squelette : tant que la météo n'est pas là, mieux vaut ne rien
  // afficher que réserver un bloc vide en haut de l'accueil.
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
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.card}
      >
        <View style={styles.left}>
          <Text style={styles.temp}>{current.tempC}°</Text>
          <View style={styles.leftMeta}>
            <Text style={styles.condition}>{KIND_LABEL[current.kind]}</Text>
            {today && (
              <Text style={styles.minmax}>↑{today.maxC}°  ↓{today.minC}°</Text>
            )}
          </View>
        </View>

        <View style={styles.right}>
          <Text style={styles.icon}>{kindEmoji(current.kind, current.isDay)}</Text>
          {city ? <Text style={styles.city} numberOfLines={1}>{city}</Text> : null}
        </View>

        {/* Aperçu de la recommandation : c'est ce qui distingue la météo de
            Yumia d'un simple thermomètre. */}
        {suggestion && (
          <View style={styles.suggestion}>
            <Text style={styles.suggestionTxt} numberOfLines={1}>
              {suggestion.emoji} {suggestion.label} · {suggestion.reason}
            </Text>
            <Text style={styles.chevron}>›</Text>
          </View>
        )}
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { ...elevation.medium, borderRadius: radius.lg },
  card: {
    borderRadius: radius.lg, padding: spacing.md,
    overflow: 'hidden',
  },
  left: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  temp: {
    fontSize: 46, fontWeight: '300', color: '#fff',
    letterSpacing: -2, lineHeight: 50,
  },
  leftMeta: { paddingBottom: 6, gap: 1 },
  condition: { ...typography.body, color: '#fff', fontWeight: '700' },
  minmax: { ...typography.caption, color: 'rgba(255,255,255,0.8)' },
  right: { position: 'absolute', top: spacing.md, right: spacing.md, alignItems: 'flex-end', gap: 2 },
  icon: { fontSize: 34 },
  city: { ...typography.label, color: 'rgba(255,255,255,0.85)', maxWidth: 110 },
  suggestion: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.md, paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.28)',
  },
  suggestionTxt: { ...typography.caption, color: 'rgba(255,255,255,0.92)', flex: 1, fontWeight: '600' },
  chevron: { fontSize: 22, color: 'rgba(255,255,255,0.75)', fontWeight: '700' },
});
