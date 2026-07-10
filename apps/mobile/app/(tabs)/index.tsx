import { useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MODE_META, UNIVERSES, UNIVERSE_META } from '@yumia/shared';
import type { Mode } from '@yumia/shared';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { SuggestionCard } from '../../components/SuggestionCard';
import { ExperienceCard } from '../../components/ExperienceCard';
import { PaywallModal } from '../../components/PaywallModal';
import { PremiumUpsellModal } from '../../components/PremiumUpsellModal';
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
import { usePlanLimits } from '../../lib/usePlanLimits';
import type { TrendingPlace } from '../../lib/places-api';
import { CannabisIcon } from '../../components/icons/CannabisIcon';

const UNIVERSE_CUSTOM_ICONS: Partial<Record<string, (props: { size: number }) => ReturnType<typeof CannabisIcon>>> = {
  cannabis: CannabisIcon,
};

function UniverseIcon({ u }: { u: string }) {
  const Icon = UNIVERSE_CUSTOM_ICONS[u];
  if (Icon) return <Icon size={26} />;
  return <Text style={styles.universeEmoji}>{UNIVERSE_META[u as keyof typeof UNIVERSE_META]?.emoji ?? '❓'}</Text>;
}

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

const FEATURE_SHORTCUTS: { key: string; emoji: string; label: string; route: string }[] = [
  { key: 'swipe', emoji: '💫', label: 'Swipe', route: '/swipe' },
  { key: 'chatbot', emoji: '🤖', label: 'Assistant', route: '/chatbot' },
  { key: 'itinerary', emoji: '✨', label: 'Itinéraire', route: '/itinerary' },
  { key: 'nearby', emoji: '📍', label: 'Nearby', route: '/nearby-users' },
  { key: 'quests', emoji: '🏆', label: 'Quêtes', route: '/quests' },
  { key: 'chat', emoji: '💬', label: 'Messages', route: '/chat' },
  { key: 'sorties', emoji: '🎟️', label: 'Sorties', route: '/sorties' },
  { key: 'group', emoji: '👥', label: 'Groupe', route: '/group' },
  { key: 'surprise', emoji: '🎲', label: 'Surprise', route: '/surprise' },
  { key: 'leaderboard', emoji: '🏆', label: 'Classement', route: '/leaderboard' },
  { key: 'saved', emoji: '🤍', label: 'Sauvegardés', route: '/saved' },
  { key: 'guides', emoji: '🧑‍🏫', label: 'Guides', route: '/guides' },
];

const MODE_CHIPS: { key: Mode; emoji: string; label: string }[] = [
  { key: 'date', emoji: '❤️', label: 'Date' },
  { key: 'family', emoji: '👨‍👩‍👧', label: 'Famille' },
  { key: 'travel', emoji: '✈️', label: 'Voyage' },
];

/** Route spéciale par univers (remplace /universe?u= pour certains) */
const UNIVERSE_ROUTE_OVERRIDES: Partial<Record<string, string>> = {
  nightclub: '/nightclub',
};
function universeRoute(u: string): string {
  return UNIVERSE_ROUTE_OVERRIDES[u] ?? `/universe?u=${u}`;
}

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
  const [upsell, setUpsell] = useState<string | null>(null);
  const { savedIds, save, unsave, limitError, clearLimitError } = useSaved(accessToken);
  const { checkLimit, recordUsage } = usePlanLimits();

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

  async function toggleMode(m: Mode) {
    if (m === 'group') {
      router.push('/group');
      return;
    }
    // Désactive si déjà actif
    if (selectedMode === m) {
      setSelectedMode(null);
      return;
    }
    // Gate planifier (date / travel) pour les forfaits Gratuits
    if (ITINERARY_MODES.includes(m)) {
      const { allowed, message } = await checkLimit('plannerPerWeek');
      if (!allowed) { setUpsell(message); return; }
      await recordUsage('plannerPerWeek');
    }
    setSelectedMode(m);
  }

  const sectionTitle = isItinerary
    ? `${MODE_META[selectedMode!].emoji} ${MODE_META[selectedMode!].labelFr}`
    : t('top3_title');

  return (
    <>
    <PremiumUpsellModal visible={upsell !== null} message={upsell ?? ''} onClose={() => setUpsell(null)} />
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

      {/* Fonctionnalités — raccourcis compacts */}
      <View style={styles.section}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shortcutsRow}>
          {FEATURE_SHORTCUTS.map((s) => (
            <Pressable key={s.key} style={styles.shortcut} onPress={() => router.push(s.route as never)}>
              <Text style={styles.shortcutEmoji}>{s.emoji}</Text>
              <Text style={styles.shortcutLabel}>{s.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Modes IA — toggle humeur */}
      <View style={styles.section}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modesRow}>
          {MODE_CHIPS.map((m) => {
            const active = selectedMode === m.key;
            return (
              <Pressable
                key={m.key}
                style={[styles.modeChip, active && styles.modeChipActive]}
                onPress={() => void toggleMode(m.key)}
              >
                <Text style={styles.modeEmoji}>{m.emoji}</Text>
                <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Tous les univers — grille 4 colonnes */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('explore_title')}</Text>
        <View style={styles.universeGrid}>
          {UNIVERSES.map((u) => (
            <Pressable key={u} style={styles.universeCard} onPress={() => router.push(universeRoute(u) as never)}>
              <UniverseIcon u={u} />
              <Text style={styles.universeLabel}>{UNIVERSE_META[u].labelFr}</Text>
            </Pressable>
          ))}
        </View>
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

    </ScrollView>
    </>
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
        <Image source={{ uri: place.photoUrls[0] }} style={styles.trendingImg} contentFit="cover" cachePolicy="memory-disk" recyclingKey={place.photoUrls[0]} />
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
  shortcutsRow: { gap: spacing.sm, paddingRight: spacing.md },
  shortcut: {
    width: 72,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    gap: 4,
  },
  shortcutEmoji: { fontSize: 22 },
  shortcutLabel: { ...typography.label, color: colors.textSecondary, fontSize: 11 },
  modesRow: { gap: spacing.sm, paddingRight: spacing.md },
  modeChip: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
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
  modeLabel: { ...typography.caption, color: colors.textPrimary, fontWeight: '600' },
  modeLabelActive: { color: colors.brandSoft },
  universeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  universeCard: {
    width: '22.5%',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 3,
  },
  universeEmoji: { fontSize: 22 },
  universeLabel: { ...typography.label, color: colors.textSecondary, textAlign: 'center', fontSize: 9, lineHeight: 12 },
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
