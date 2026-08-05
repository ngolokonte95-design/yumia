import { useMemo } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedNumber, PressableScale, Reveal } from '../components/ui';
import { WeatherSky } from '../components/weather/WeatherSky';
import { HourlyStrip } from '../components/weather/HourlyStrip';
import { DailyForecast } from '../components/weather/DailyForecast';
import { MetricsGrid } from '../components/weather/MetricsGrid';
import { AirQualityCard } from '../components/weather/AirQualityCard';
import { SunPath } from '../components/weather/SunPath';
import { WeatherActivities } from '../components/weather/WeatherActivities';
import { useLocation } from '../lib/useLocation';
import { useWeatherReport } from '../lib/useWeatherReport';
import { dayMomentAt, KIND_LABEL, kindEmoji } from '../lib/services/weather';
import { colors, spacing, typography } from '../theme/tokens';

/**
 * Écran météo complet de Yumia.
 *
 * Ne contient **aucun appel réseau** : toute la donnée vient de
 * `useWeatherReport`, qui délègue lui-même au fournisseur configuré dans la
 * couche Services. L'écran ne fait que présenter.
 */
export default function WeatherScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { coords, resolving } = useLocation();
  const { report, loading, refreshing, error, refresh } = useWeatherReport(coords.lat, coords.lng);

  // Le moment de la journée pilote toute l'ambiance visuelle : on le calcule
  // une fois, à partir du lieu observé (et non du fuseau du téléphone).
  const moment = useMemo(() => {
    if (!report) return 'day' as const;
    return dayMomentAt(new Date(), report.astro, report.coordinates.lat);
  }, [report]);

  if ((loading || resolving) && !report) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} size="large" />
        <Text style={styles.loadingText}>Lecture du ciel…</Text>
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorEmoji}>🌫️</Text>
        <Text style={styles.errorTitle}>Météo indisponible</Text>
        <Text style={styles.errorText}>{error ?? 'Impossible de récupérer les conditions.'}</Text>
        <PressableScale haptic onPress={() => void refresh()} style={styles.retry}>
          <Text style={styles.retryText}>Réessayer</Text>
        </PressableScale>
      </View>
    );
  }

  const { current, astro, utcOffsetSeconds } = report;
  const today = report.daily[0];

  return (
    <View style={styles.container}>
      <WeatherSky kind={current.kind} moment={moment} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + spacing.xxl },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor="#fff"
          />
        }
      >
        {/* En-tête */}
        <View style={styles.header}>
          <PressableScale onPress={() => router.back()} hitSlop={12} style={styles.back}>
            <Text style={styles.backIcon}>←</Text>
          </PressableScale>
          <Text style={styles.headerTitle}>Météo</Text>
          <View style={styles.back} />
        </View>

        {/* Bloc principal */}
        <Reveal from="fade" duration={520}>
          <View style={styles.hero}>
            <Text style={styles.heroIcon}>{kindEmoji(current.kind, current.isDay)}</Text>

            <View style={styles.tempRow}>
              <AnimatedNumber value={current.tempC} style={styles.temp} suffix="°" />
            </View>

            <Text style={styles.condition}>{KIND_LABEL[current.kind]}</Text>
            <Text style={styles.feels}>Ressenti {current.feelsLikeC}°</Text>

            {today && (
              <Text style={styles.minmax}>
                ↑ {today.maxC}°   ↓ {today.minC}°
              </Text>
            )}
          </View>
        </Reveal>

        <WeatherActivities current={current} />

        <HourlyStrip hours={report.hourly} utcOffsetSeconds={utcOffsetSeconds} />
        <DailyForecast days={report.daily} utcOffsetSeconds={utcOffsetSeconds} />

        <MetricsGrid current={current} />

        <SunPath astro={astro} utcOffsetSeconds={utcOffsetSeconds} />

        {report.airQuality && <AirQualityCard air={report.airQuality} />}

        {/* Mention du fournisseur + fraîcheur de la donnée */}
        <Text style={styles.footer}>
          {report.timezone} · Données Open-Meteo
          {error ? ' · dernières données connues' : ''}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: spacing.xxl },

  center: {
    flex: 1, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    padding: spacing.lg,
  },
  loadingText: { ...typography.body, color: colors.textSecondary },
  errorEmoji: { fontSize: 48 },
  errorTitle: { ...typography.title, color: colors.textPrimary },
  errorText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  retry: {
    marginTop: spacing.md, backgroundColor: colors.brand,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999,
  },
  retryText: { ...typography.body, color: '#fff', fontWeight: '700' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, marginBottom: spacing.sm,
  },
  back: { width: 40 },
  backIcon: { fontSize: 26, color: '#fff', fontWeight: '700' },
  headerTitle: { ...typography.heading, color: '#fff' },

  hero: { alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.md },
  heroIcon: { fontSize: 64, marginBottom: spacing.sm },
  tempRow: { flexDirection: 'row', alignItems: 'flex-start' },
  temp: {
    fontSize: 92, fontWeight: '200', color: '#fff',
    letterSpacing: -4, textAlign: 'center',
  },
  condition: { ...typography.title, color: '#fff', marginTop: -4 },
  feels: { ...typography.body, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  minmax: { ...typography.body, color: 'rgba(255,255,255,0.65)', marginTop: spacing.sm },

  footer: {
    ...typography.caption, color: 'rgba(255,255,255,0.4)',
    textAlign: 'center', marginTop: spacing.lg,
  },
});
