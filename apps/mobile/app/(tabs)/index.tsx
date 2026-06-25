import { useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MODES, MODE_META, UNIVERSES, UNIVERSE_META } from '@yumia/shared';
import type { Mode } from '@yumia/shared';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { SuggestionCard } from '../../components/SuggestionCard';
import { ExperienceCard } from '../../components/ExperienceCard';
import { PaywallModal } from '../../components/PaywallModal';
import { useTop3 } from '../../lib/useTop3';
import { useExperience } from '../../lib/useExperience';
import { useLocation } from '../../lib/useLocation';
import { useAuth } from '../../lib/auth-context';
import { recordVisit } from '../../lib/passport-api';
import { useSaved } from '../../lib/useSaved';
import { useI18n } from '../../lib/useI18n';
import { placeStore } from '../../lib/place-store';
import { useWeather } from '../../lib/useWeather';
import { SkeletonCard } from '../../components/SkeletonCard';
import { useTrending } from '../../lib/useTrending';
import type { TrendingPlace } from '../../lib/places-api';

type TFn = (key: Parameters<ReturnType<typeof import('../../lib/useI18n').useI18n>['t']>[0]) => string;

function buildGreeting(name: string, t: TFn): { title: string; sub: string } {
  const h = new Date().getHours();
  const first = name.split(' ')[0];
  if (h >= 5 && h < 12)
    return { title: `${t('greeting_morning')}, ${first}`, sub: t('greeting_sub_morning') };
  if (h >= 12 && h < 18)
    return { title: `${t('greeting_afternoon')}, ${first}`, sub: t('greeting_sub_afternoon') };
  if (h >= 18 && h < 23)
    return { title: `${t('greeting_evening')}, ${first}`, sub: t('greeting_sub_evening') };
  return { title: `${t('greeting_night')}, ${first}`, sub: t('greeting_sub_night') };
}

const ITINERARY_MODES: Mode[] = ['date', 'travel'];

/** HOME — « Que faire maintenant ? ». Point de départ de chaque session. */
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const { t } = useI18n();
  const { title: greetTitle, sub: greetSub } = buildGreeting(user?.displayName ?? 'toi', t);
  const { coords, resolving, isFallback, city } = useLocation();
  const weather = useWeather(coords.lat, coords.lng);
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null);
  const { savedIds, save, unsave, limitError, clearLimitError } = useSaved(accessToken);

  const isItinerary = selectedMode !== null && ITINERARY_MODES.includes(selectedMode);
  const prefs = {
    favoriteUniverses: user?.preferences?.favoriteUniverses,
    restrictions: user?.preferences?.restrictions,
  };

  const trending = useTrending({
    lat: coords.lat,
    lng: coords.lng,
    radius: 5_000,
    limit: 8,
    enabled: !resolving,
  });

  // Params mémoïsés et STABLES : sans ça, `localTimeIso: new Date()` (qui change
  // à chaque render) faisait re-fetcher le Top 3 en boucle → écran qui "vibre" +
  // ThrottlerException (429). On arrondit l'heure à l'heure pleine et on ne
  // dépend que de valeurs primitives.
  const top3Params = useMemo(
    () => {
      const hour = new Date();
      hour.setMinutes(0, 0, 0);
      return {
        lat: coords.lat,
        lng: coords.lng,
        locale: user?.locale ?? 'fr',
        localTimeIso: hour.toISOString(),
        mode: selectedMode ?? undefined,
        weather: weather ?? undefined,
        city: city ?? undefined,
        favoriteUniverses: user?.preferences?.favoriteUniverses,
        restrictions: user?.preferences?.restrictions,
      };
    },
    [
      coords.lat,
      coords.lng,
      user?.locale,
      selectedMode,
      weather?.tempC,
      weather?.condition,
      city,
      user?.preferences?.favoriteUniverses,
      user?.preferences?.restrictions,
    ],
  );

  const top3 = useTop3(top3Params, !resolving && !isItinerary);

  const experience = useExperience(
    {
      lat: coords.lat,
      lng: coords.lng,
      mode: (selectedMode ?? 'date') as 'date' | 'travel',
      locale: 'fr',
      ...prefs,
    },
    !resolving && isItinerary,
  );

  function toggleMode(m: Mode) {
    if (m === 'group') {
      router.push('/group');
      return;
    }
    setSelectedMode((prev) => (prev === m ? null : m));
  }

  const sectionTitle = isItinerary
    ? `${MODE_META[selectedMode!].emoji} ${MODE_META[selectedMode!].labelFr}`
    : t('top3_title');

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxl }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={top3.loading && !resolving}
          onRefresh={() => top3.refetch()}
          tintColor={colors.brand}
        />
      }
    >
      {/* Greeting contextuel */}
      <View style={styles.section}>
        <View style={styles.greetingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greetTitle}</Text>
            <Text style={styles.subGreeting}>
              {city ? `📍 ${city} · ` : ''}{greetSub}
            </Text>
          </View>
          {weather ? (
            <View style={styles.weatherPill}>
              <Text style={styles.weatherText}>
                {weatherEmoji(weather.condition)} {weather.tempC}°
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Barre de recherche conversationnelle */}
      <View style={styles.section}>
        <Pressable style={styles.search} onPress={() => router.push('/search')}>
          <Text style={styles.searchText}>{t('home_search_placeholder')}</Text>
        </Pressable>
      </View>

      {/* Modes rapides */}
      <View style={styles.section}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {MODES.filter((m) => m !== 'solo').map((m) => {
            const active = selectedMode === m;
            return (
              <Pressable
                key={m}
                style={[styles.modeChip, active && styles.modeChipActive]}
                onPress={() => toggleMode(m)}
              >
                <Text style={styles.modeEmoji}>{MODE_META[m].emoji}</Text>
                <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>
                  {MODE_META[m].labelFr}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Surprise Me */}
      <View style={styles.section}>
        <Pressable style={styles.surpriseBtn} onPress={() => router.push('/surprise')}>
          <Text style={styles.surpriseEmoji}>🎲</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.surpriseTitle}>Surprise Me</Text>
            <Text style={styles.surpriseSub}>Laisse YUMIA choisir pour toi</Text>
          </View>
          <Text style={styles.surpriseChevron}>›</Text>
        </Pressable>
      </View>

      {/* Tendances près de toi */}
      {(trending.places.length > 0 || trending.loading) && !resolving ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔥 Tendances près de toi</Text>
          {trending.loading ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendingRow}>
              {Array.from({ length: 4 }).map((_, i) => (
                <View key={i} style={styles.trendingSkeletonCard} />
              ))}
            </ScrollView>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendingRow}>
              {trending.places.map((place) => (
                <TrendingCard
                  key={place.id}
                  place={place}
                  onPress={() => {
                    placeStore.set({
                      place: {
                        id: place.id,
                        name: place.name,
                        universe: place.universe,
                        location: { lat: place.lat, lng: place.lng },
                        city: place.city,
                        countryCode: place.countryCode,
                        rating: place.rating,
                        priceTier: place.priceTier as 1 | 2 | 3 | 4,
                        photoUrls: place.photoUrls,
                        tags: place.tags,
                      },
                      compatibility: 0,
                      distanceMeters: Math.round(place.distanceMeters),
                      reason: `🔥 Tendance — ${place.visitCount} visites récentes`,
                      engine: 'mood',
                    });
                    router.push('/place');
                  }}
                />
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}

      {/* Section principale : Top 3 ou Itinéraire selon le mode */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{sectionTitle}</Text>

        {!isItinerary && top3.data?.reason ? (
          <Text style={styles.top3Reason}>{top3.data.reason}</Text>
        ) : null}
        {isFallback && !resolving ? (
          <Text style={styles.fallbackHint}>{t('location_fallback')}</Text>
        ) : null}

        <PaywallModal visible={limitError !== null} onClose={clearLimitError} />

        {resolving ? (
          <View style={{ gap: spacing.md }}>
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </View>
        ) : isItinerary ? (
          experience.loading ? (
            <StateBox loading text={t('ai_planning')} />
          ) : experience.error ? (
            <StateBox text={experience.error} onRetry={experience.refetch} />
          ) : experience.data ? (
            <ExperienceCard
              result={experience.data}
              savedIds={savedIds}
              onSave={accessToken ? (id, willSave) => willSave ? save(id) : unsave(id) : undefined}
              onVisit={
                accessToken
                  ? (placeId, feedback) => recordVisit(accessToken, placeId, feedback)
                  : undefined
              }
              onStepPress={(step) => { placeStore.set({ place: step.place, compatibility: 0, reason: step.reason, engine: 'mood' }); router.push('/place'); }}
            />
          ) : null
        ) : top3.loading ? (
          <View style={{ gap: spacing.md }}>
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </View>
        ) : top3.error ? (
          <StateBox text={top3.error} onRetry={top3.refetch} />
        ) : top3.data && top3.data.suggestions.length > 0 ? (
          <View style={{ gap: spacing.md }}>
            {top3.data.suggestions.map((s) => (
              <SuggestionCard
                key={s.place.id}
                suggestion={s}
                isSaved={savedIds.has(s.place.id)}
                onPress={() => { placeStore.set(s); router.push('/place'); }}
                onSave={accessToken ? (id, willSave) => willSave ? save(id) : unsave(id) : undefined}
                onVisit={
                  accessToken
                    ? async (feedback) => recordVisit(accessToken, s.place.id, feedback)
                    : undefined
                }
              />
            ))}
          </View>
        ) : (
          <StateBox text={t('no_results')} />
        )}
      </View>

      {/* Univers (grille horizontale scrollable) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('explore_title')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {UNIVERSES.map((u) => (
            <Pressable key={u} style={styles.universeChip} onPress={() => router.push(`/universe?u=${u}`)}>
              <Text style={styles.universeEmoji}>{UNIVERSE_META[u].emoji}</Text>
              <Text style={styles.universeLabel}>{UNIVERSE_META[u].labelFr}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </ScrollView>
  );
}

function TrendingCard({ place, onPress }: { place: TrendingPlace; onPress: () => void }) {
  const meta = UNIVERSE_META[place.universe];
  const distKm = place.distanceMeters < 1000
    ? `${Math.round(place.distanceMeters)} m`
    : `${(place.distanceMeters / 1000).toFixed(1)} km`;
  return (
    <Pressable style={styles.trendingCard} onPress={onPress}>
      {place.photoUrls?.[0] ? (
        <Image source={{ uri: place.photoUrls[0] }} style={styles.trendingImg} resizeMode="cover" />
      ) : (
        <View style={styles.trendingImgPlaceholder}>
          <Text style={{ fontSize: 32 }}>{meta?.emoji ?? '📍'}</Text>
        </View>
      )}
      <View style={styles.trendingVisitBadge}>
        <Text style={styles.trendingVisitText}>{place.visitCount} visites</Text>
      </View>
      <View style={styles.trendingInfo}>
        <Text style={styles.trendingName} numberOfLines={1}>{place.name}</Text>
        <Text style={styles.trendingMeta}>{distKm} · ⭐ {place.rating.toFixed(1)}</Text>
      </View>
    </Pressable>
  );
}

function weatherEmoji(condition: string): string {
  const c = condition.toLowerCase();
  if (c.includes('thunder')) return '⛈️';
  if (c.includes('snow')) return '❄️';
  if (c.includes('heavy rain') || c.includes('shower')) return '🌧️';
  if (c.includes('rain') || c.includes('drizzle')) return '🌦️';
  if (c.includes('fog')) return '🌫️';
  if (c.includes('overcast')) return '☁️';
  if (c.includes('partly') || c.includes('mostly')) return '⛅';
  return '☀️';
}

function StateBox({
  loading = false,
  text,
  onRetry,
}: {
  loading?: boolean;
  text?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.stateBox}>
      {loading && <ActivityIndicator color={colors.brand} />}
      {text ? <Text style={styles.stateText}>{text}</Text> : null}
      {onRetry ? (
        <Pressable style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryText}>Réessayer</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: spacing.md, marginBottom: spacing.lg },
  greetingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  greeting: { ...typography.display, color: colors.textPrimary },
  subGreeting: { ...typography.body, color: colors.textSecondary, marginTop: 4 },
  weatherPill: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  weatherText: { ...typography.caption, color: colors.textSecondary },
  search: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  searchText: { ...typography.body, color: colors.textMuted },
  chipsRow: { gap: spacing.sm, paddingRight: spacing.md },
  modeChip: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  modeChipActive: {
    backgroundColor: `${colors.brand}18`,
    borderColor: colors.brand,
  },
  modeEmoji: { fontSize: 16 },
  modeLabel: { ...typography.caption, color: colors.textPrimary },
  modeLabelActive: { color: colors.brandSoft },
  sectionTitle: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.md },
  top3Reason: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  fallbackHint: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.md },
  stateBox: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  stateText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  retryBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  retryText: { ...typography.caption, color: colors.textPrimary },
  surpriseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: `${colors.accent}14`,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  surpriseEmoji: { fontSize: 28 },
  surpriseTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  surpriseSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  surpriseChevron: { ...typography.title, color: colors.textMuted },
  universeChip: {
    width: 88,
    height: 88,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  universeEmoji: { fontSize: 28 },
  universeLabel: { ...typography.label, color: colors.textSecondary, textAlign: 'center' },
  trendingRow: { gap: spacing.md, paddingRight: spacing.md },
  trendingCard: {
    width: 148,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  trendingImg: { width: '100%', height: 96 },
  trendingImgPlaceholder: {
    width: '100%',
    height: 96,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendingVisitBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    backgroundColor: `${colors.brand}CC`,
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  trendingVisitText: { ...typography.label, color: '#fff', fontSize: 11 },
  trendingInfo: { padding: spacing.sm, gap: 2 },
  trendingName: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  trendingMeta: { ...typography.caption, color: colors.textSecondary },
  trendingSkeletonCard: {
    width: 148,
    height: 148,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
  },
});
