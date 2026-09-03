import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Keyboard, Pressable, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, View,
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
import { WeatherMaps } from '../components/weather/WeatherMaps';
import { WeatherActivities } from '../components/weather/WeatherActivities';
import { useLocation } from '../lib/useLocation';
import { useWeatherReport } from '../lib/useWeatherReport';
import { useCitySearch } from '../lib/useCitySearch';
import { dayMomentAt, KIND_LABEL, kindEmoji, type CitySuggestion } from '../lib/services/weather';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useI18n } from '../lib/useI18n';
import { weatherKindLabel } from '../lib/labelHelpers';

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
  const { t } = useI18n();
  const { coords, resolving } = useLocation();

  // Ville choisie par recherche — remplace la position GPS tant qu'elle est
  // active. `null` = on suit la position réelle de l'utilisateur.
  const [city, setCity] = useState<CitySuggestion | null>(null);
  const activeCoords = city ?? coords;
  const { report, loading, refreshing, error, refresh } = useWeatherReport(activeCoords.lat, activeCoords.lng);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { results, loading: searching } = useCitySearch(query);
  const searchInputRef = useRef<TextInput>(null);

  function openSearch() {
    setSearchOpen(true);
    setQuery('');
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function closeSearch() {
    Keyboard.dismiss();
    setSearchOpen(false);
  }

  function pickCity(c: CitySuggestion) {
    setCity(c);
    closeSearch();
  }

  // Le moment de la journée pilote toute l'ambiance visuelle : on le calcule
  // une fois, à partir du lieu observé (et non du fuseau du téléphone).
  const moment = useMemo(() => {
    if (!report) return 'day' as const;
    return dayMomentAt(new Date(), report.astro, report.coordinates.lat);
  }, [report]);

  // Une ville choisie par recherche ne dépend pas du GPS — ne pas attendre
  // `resolving` dans ce cas, sinon l'écran resterait bloqué en chargement si
  // la localisation échoue ou est refusée.
  if ((loading || (resolving && !city)) && !report) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} size="large" />
        <Text style={styles.loadingText}>{t('weather_reading_sky')}</Text>
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorEmoji}>🌫️</Text>
        <Text style={styles.errorTitle}>{t('weather_unavailable')}</Text>
        <Text style={styles.errorText}>{error ?? t('weather_fetch_error')}</Text>
        <PressableScale haptic onPress={() => void refresh()} style={styles.retry}>
          <Text style={styles.retryText}>{t('weather_retry')}</Text>
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
          <Text style={styles.headerTitle}>{t('weather_title')}</Text>
          <PressableScale onPress={openSearch} hitSlop={12} style={styles.back}>
            <Text style={styles.searchIcon}>🔍</Text>
          </PressableScale>
        </View>

        {/* Bloc principal */}
        <Reveal from="fade" duration={520}>
          <View style={styles.hero}>
            {/* Lieu observé — la ville recherchée si elle est active, sinon la
                position réelle. Tap pour rouvrir la recherche ; si une ville est
                choisie, une pastille permet de revenir à sa position. */}
            <Pressable onPress={openSearch} style={styles.locationRow} hitSlop={8}>
              <Text style={styles.locationLabel} numberOfLines={1}>
                📍 {city ? `${city.name}${city.admin1 ? `, ${city.admin1}` : ''}` : t('weather_my_location')}
              </Text>
            </Pressable>
            {city ? (
              <Pressable onPress={() => setCity(null)} style={styles.myLocationChip} hitSlop={8}>
                <Text style={styles.myLocationChipText}>{t('weather_back_to_my_location')}</Text>
              </Pressable>
            ) : null}

            <Text style={styles.heroIcon}>{kindEmoji(current.kind, current.isDay)}</Text>

            <View style={styles.tempRow}>
              <AnimatedNumber value={current.tempC} style={styles.temp} suffix="°" />
            </View>

            <Text style={styles.condition}>{weatherKindLabel(t, current.kind, KIND_LABEL[current.kind])}</Text>
            <Text style={styles.feels}>{t('weather_feels_like').replace('{temp}', String(current.feelsLikeC))}</Text>

            {today && (
              <Text style={styles.minmax}>
                ↑ {today.maxC}°   ↓ {today.minC}°
              </Text>
            )}
          </View>
        </Reveal>

        <WeatherActivities current={current} coords={activeCoords} cityLabel={city?.name} />

        <HourlyStrip hours={report.hourly} utcOffsetSeconds={utcOffsetSeconds} />
        <DailyForecast days={report.daily} utcOffsetSeconds={utcOffsetSeconds} />

        <WeatherMaps center={report.coordinates} utcOffsetSeconds={utcOffsetSeconds} />

        <MetricsGrid current={current} />

        <SunPath astro={astro} utcOffsetSeconds={utcOffsetSeconds} />

        {report.airQuality && <AirQualityCard air={report.airQuality} />}

        {/* Mention du fournisseur + fraîcheur de la donnée */}
        <Text style={styles.footer}>
          {t('weather_footer_data').replace('{tz}', report.timezone).replace('{stale}', error ? t('weather_footer_stale') : '')}
        </Text>
      </ScrollView>

      {/* Recherche de ville — en overlay, pour ne jamais perdre le contexte
          météo affiché derrière (comme le filtre univers de la carte). */}
      {searchOpen ? (
        <View style={[StyleSheet.absoluteFill, styles.searchOverlay, { paddingTop: insets.top + 8 }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSearch} />
          <View style={styles.searchHeader}>
            <View style={styles.searchBox}>
              <Text style={styles.searchBoxIcon}>🔍</Text>
              <TextInput
                ref={searchInputRef}
                style={styles.searchInput}
                placeholder={t('weather_search_placeholder')}
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                returnKeyType="search"
              />
              {searching ? <ActivityIndicator size="small" color="#fff" /> : null}
            </View>
            <Pressable onPress={closeSearch} hitSlop={12} style={styles.searchCancel}>
              <Text style={styles.searchCancelText}>{t('weather_search_cancel')}</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.searchResults}>
            {!query.trim() ? (
              <Text style={styles.searchHint}>{t('weather_search_hint')}</Text>
            ) : results.length === 0 && !searching ? (
              <Text style={styles.searchHint}>{t('weather_no_city_found')}</Text>
            ) : (
              results.map((c) => (
                <Pressable key={c.id} style={styles.cityRow} onPress={() => pickCity(c)}>
                  <Text style={styles.cityName}>{c.name}</Text>
                  <Text style={styles.cityRegion} numberOfLines={1}>
                    {[c.admin1, c.country].filter(Boolean).join(', ')}
                  </Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      ) : null}
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
  searchIcon: { fontSize: 26, textAlign: 'right' },

  hero: { alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.md },
  locationRow: { paddingHorizontal: spacing.xl, maxWidth: '100%' },
  locationLabel: { ...typography.body, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  myLocationChip: {
    marginTop: spacing.xs, backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  myLocationChipText: { ...typography.caption, color: '#fff' },
  heroIcon: { fontSize: 64, marginTop: spacing.sm, marginBottom: spacing.sm },
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

  // Recherche de ville
  searchOverlay: { backgroundColor: 'rgba(9,9,13,0.92)' },
  searchHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.pill,
    paddingHorizontal: spacing.md, height: 42,
  },
  searchBoxIcon: { fontSize: 15 },
  searchInput: { flex: 1, ...typography.body, color: '#fff' },
  searchCancel: { paddingVertical: spacing.xs },
  searchCancelText: { ...typography.body, color: colors.brandSoft, fontWeight: '600' },
  searchResults: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },
  searchHint: {
    ...typography.body, color: 'rgba(255,255,255,0.5)',
    textAlign: 'center', marginTop: spacing.xl,
  },
  cityRow: {
    paddingVertical: spacing.sm, borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  cityName: { ...typography.body, color: '#fff', fontWeight: '600' },
  cityRegion: { ...typography.caption, color: 'rgba(255,255,255,0.55)', marginTop: 1 },
});
