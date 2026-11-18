import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Keyboard, Pressable, RefreshControl, ScrollView, StyleSheet, Text,
  View,
} from 'react-native';
import type { TextInputInstance } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedNumber, GradientText, PressableScale, Reveal } from '../components/ui';
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
import { BrandButton, GlassIconButton, SocialEmpty } from '../components/social/SocialChrome';
import { GlassGroup } from '../components/profile/ProfileChrome';
import { BACK_ICON, GLASS_CARD, IconMedal, SearchPill } from '../components/p2a/P2Chrome';

/**
 * Écran météo complet de Yumia.
 *
 * Ne contient **aucun appel réseau** : toute la donnée vient de
 * `useWeatherReport`, qui délègue lui-même au fournisseur configuré dans la
 * couche Services. L'écran ne fait que présenter.
 *
 * DA (18/11/2026) : ciel animé en fond UNI (`flat` : sans dégradé ni voile,
 * qui dessinaient une « barre grise »), arrêté quand l'écran n'est plus
 * affiché ; boutons ronds en verre, lieu en pastille vitrée, température en
 * très grand, mini/maxi en pastilles ; les sections (déjà en cartes vitrées)
 * apparaissent en cascade ; recherche de ville en pilule vitrée, résultats en
 * groupe vitré.
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
  const searchInputRef = useRef<TextInputInstance>(null);

  // Le ciel animé ne tourne que tant que l'écran est affiché (batterie).
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

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
        <IconMedal icon={<ActivityIndicator color="#fff" />} size={64} lit />
        <GradientText style={styles.loadingText}>{t('weather_reading_sky')}</GradientText>
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.center}>
        <SocialEmpty
          emoji="🌫️"
          title={t('weather_unavailable')}
          text={error ?? t('weather_fetch_error')}
          action={<BrandButton label={t('weather_retry')} onPress={() => void refresh()} compact />}
        />
      </View>
    );
  }

  const { current, astro, utcOffsetSeconds } = report;
  const today = report.daily[0];

  return (
    <View style={styles.container}>
      {focused ? <WeatherSky kind={current.kind} moment={moment} flat /> : null}

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
          <GlassIconButton icon={BACK_ICON} onPress={() => router.back()} />
          <Text style={styles.headerTitle}>{t('weather_title')}</Text>
          <GlassIconButton icon="🔍" onPress={openSearch} />
        </View>

        {/* Bloc principal */}
        <Reveal from="fade" duration={520}>
          <View style={styles.hero}>
            {/* Lieu observé — la ville recherchée si elle est active, sinon la
                position réelle. Tap pour rouvrir la recherche ; si une ville est
                choisie, une pastille permet de revenir à sa position. */}
            <PressableScale onPress={openSearch} style={[styles.locationPill, GLASS_CARD]} hitSlop={8} scaleTo={0.96}>
              <Text style={styles.locationLabel} numberOfLines={1}>
                📍 {city ? `${city.name}${city.admin1 ? `, ${city.admin1}` : ''}` : t('weather_my_location')}
              </Text>
            </PressableScale>
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
              <View style={styles.minmaxRow}>
                <View style={[styles.minmaxPill, GLASS_CARD]}>
                  <Text style={styles.minmaxText}>↑ {today.maxC}°</Text>
                </View>
                <View style={[styles.minmaxPill, GLASS_CARD]}>
                  <Text style={styles.minmaxText}>↓ {today.minC}°</Text>
                </View>
              </View>
            )}
          </View>
        </Reveal>

        {/* Sections : déjà en cartes vitrées, révélées en cascade. */}
        <Reveal index={1}>
          <WeatherActivities current={current} coords={activeCoords} cityLabel={city?.name} />
        </Reveal>

        <Reveal index={2}>
          <HourlyStrip hours={report.hourly} utcOffsetSeconds={utcOffsetSeconds} />
        </Reveal>
        <Reveal index={3}>
          <DailyForecast days={report.daily} utcOffsetSeconds={utcOffsetSeconds} />
        </Reveal>

        <Reveal index={4}>
          <WeatherMaps center={report.coordinates} utcOffsetSeconds={utcOffsetSeconds} />
        </Reveal>

        <Reveal index={5}>
          <MetricsGrid current={current} />
        </Reveal>

        <Reveal index={5}>
          <SunPath astro={astro} utcOffsetSeconds={utcOffsetSeconds} />
        </Reveal>

        {report.airQuality && (
          <Reveal index={5}>
            <AirQualityCard air={report.airQuality} />
          </Reveal>
        )}

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
            <SearchPill
              inputRef={searchInputRef}
              style={styles.searchPill}
              placeholder={t('weather_search_placeholder')}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              returnKeyType="search"
              right={searching ? <ActivityIndicator size="small" color={colors.brand} /> : undefined}
            />
            <PressableScale onPress={closeSearch} hitSlop={12} scaleTo={0.94} style={styles.searchCancel}>
              <Text style={styles.searchCancelText}>{t('weather_search_cancel')}</Text>
            </PressableScale>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.searchResults}>
            {!query.trim() ? (
              <Text style={styles.searchHint}>{t('weather_search_hint')}</Text>
            ) : results.length === 0 && !searching ? (
              <Text style={styles.searchHint}>{t('weather_no_city_found')}</Text>
            ) : (
              <Reveal from="fade">
                <GlassGroup>
                  {results.map((c) => (
                    <PressableScale key={c.id} style={styles.cityRow} scaleTo={0.98} onPress={() => pickCity(c)}>
                      <IconMedal icon="📍" size={36} />
                      <View style={styles.cityText}>
                        <Text style={styles.cityName}>{c.name}</Text>
                        <Text style={styles.cityRegion} numberOfLines={1}>
                          {[c.admin1, c.country].filter(Boolean).join(', ')}
                        </Text>
                      </View>
                    </PressableScale>
                  ))}
                </GlassGroup>
              </Reveal>
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
    alignItems: 'center', justifyContent: 'center', gap: spacing.md,
    padding: spacing.lg,
  },
  loadingText: { fontSize: 18, fontWeight: '900', textAlign: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, marginBottom: spacing.sm,
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },

  hero: { alignItems: 'center', paddingTop: spacing.md, paddingBottom: spacing.lg },
  locationPill: {
    maxWidth: '86%', borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: 7,
  },
  locationLabel: { ...typography.body, color: '#fff', fontWeight: '700' },
  myLocationChip: {
    marginTop: spacing.sm, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: 5,
    borderWidth: 1.5, borderColor: colors.brand, backgroundColor: 'rgba(232,98,26,0.12)',
  },
  myLocationChipText: { ...typography.caption, color: '#fff', fontWeight: '800' },
  heroIcon: { fontSize: 72, marginTop: spacing.md, marginBottom: spacing.xs },
  tempRow: { flexDirection: 'row', alignItems: 'flex-start' },
  temp: {
    fontSize: 104, fontWeight: '200', color: '#fff',
    letterSpacing: -5, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 18, textShadowOffset: { width: 0, height: 4 },
  },
  condition: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: -0.4, marginTop: -6 },
  feels: { ...typography.body, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  minmaxRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  minmaxPill: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  minmaxText: { color: '#fff', fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },

  footer: {
    ...typography.caption, color: 'rgba(255,255,255,0.45)',
    textAlign: 'center', marginTop: spacing.lg, paddingHorizontal: spacing.lg,
  },

  // Recherche de ville (voile uni, sans dégradé)
  searchOverlay: { backgroundColor: 'rgba(9,9,13,0.94)' },
  searchHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
  },
  searchPill: { flex: 1 },
  searchCancel: { paddingVertical: spacing.xs },
  searchCancelText: { ...typography.body, color: colors.brandSoft, fontWeight: '800' },
  searchResults: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },
  searchHint: {
    ...typography.body, color: 'rgba(255,255,255,0.55)',
    textAlign: 'center', marginTop: spacing.xl,
  },
  cityRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: 11,
  },
  cityText: { flex: 1 },
  cityName: { ...typography.body, color: '#fff', fontWeight: '800' },
  cityRegion: { ...typography.caption, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
});
