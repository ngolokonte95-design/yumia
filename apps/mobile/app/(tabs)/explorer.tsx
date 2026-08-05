/**
 * EXPLORER — hub de découverte & catalogue. Distinct de Home (« quoi faire
 * maintenant ») : ici on parcourt, on cherche, on accède aux univers, aux
 * guides, aux sorties, au mode groupe et au classement. Contient aussi les
 * sections « Tendances » et « Top 3 / Itinéraire » (déménagées depuis Home,
 * qui ne montre plus que la grille d'univers).
 */
import { useEffect, useMemo, useState } from 'react';
import { Image as RNImage, ScrollView, View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MODE_META, UNIVERSE_META } from '@yumia/shared';
import type { Mode, Universe } from '@yumia/shared';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { useLocation } from '../../lib/useLocation';
import { fetchBoostedVenues, type Venue } from '../../lib/business-api';
import { YumiaLogo } from '../../components/YumiaLogo';
import { socialApi } from '../../lib/social-api';
import { useAuth } from '../../lib/auth-context';
import { SuggestionCard } from '../../components/SuggestionCard';
import { ExperienceCard } from '../../components/ExperienceCard';
import { PaywallModal } from '../../components/PaywallModal';
import { PremiumUpsellModal } from '../../components/PremiumUpsellModal';
import { useTop3 } from '../../lib/useTop3';
import { useExperience } from '../../lib/useExperience';
import { recordVisit } from '../../lib/passport-api';
import { useSaved } from '../../lib/useSaved';
import { useI18n } from '../../lib/useI18n';
import { placeStore } from '../../lib/place-store';
import { useWeather } from '../../lib/useWeather';
import { SkeletonCard } from '../../components/SkeletonCard';
import { useTrending } from '../../lib/useTrending';
import { usePlanLimits } from '../../lib/usePlanLimits';
import type { TrendingPlace, NearbyPlace } from '../../lib/places-api';
import { useNearbyUniverse } from '../../lib/useNearbyUniverse';

type SuggestedUser = { id: string; displayName: string; photoUrl?: string; bio?: string; level: number };

// Favoris et Surprise Me vivent déjà dans Home (FEATURE_SHORTCUTS) — pas de
// doublon entre onglets.
const QUICK_ACTIONS: { key: string; emoji: string; label: string; sub: string; route: string }[] = [
  { key: 'guides', emoji: '🧭', label: 'Guides locaux', sub: 'Experts certifiés', route: '/guides' },
  { key: 'sorties', emoji: '🎟️', label: 'Sorties & billets', sub: 'Événements près de toi', route: '/sorties' },
  { key: 'group', emoji: '👥', label: 'Sortie en groupe', sub: 'Décidez ensemble', route: '/group' },
  { key: 'leaderboard', emoji: '🏆', label: 'Classement', sub: 'Compare-toi', route: '/leaderboard' },
];

const ITINERARY_MODES: Mode[] = ['solo', 'surprise', 'date', 'family', 'group', 'travel'];

export default function ExplorerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const { t } = useI18n();
  const { coords, resolving, isFallback, city } = useLocation();
  const weather = useWeather(coords.lat, coords.lng);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  // Aucune sélection de mode dans Explorer (les boutons Date/Famille/Voyage
  // restent sur Home mais n'agissent plus sur cette section) : la section
  // Top 3 affiche donc toujours les suggestions générales, jamais l'itinéraire.
  const [selectedMode] = useState<Mode | null>(null);
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
      mode: (selectedMode ?? 'date') as Mode,
      locale: 'fr',
      ...prefs,
    },
    !resolving && isItinerary,
  );

  const sectionTitle = isItinerary
    ? `${MODE_META[selectedMode!].emoji} ${MODE_META[selectedMode!].labelFr}`
    : t('top3_title');

  useEffect(() => {
    if (resolving) return;
    fetchBoostedVenues({ lat: coords.lat, lng: coords.lng, radius: 50000 })
      .then((v) => setVenues(v.slice(0, 6)))
      .catch(() => {});
  }, [coords.lat, coords.lng, resolving]);

  useEffect(() => {
    if (!accessToken) return;
    socialApi.searchUsers(accessToken, '', 10)
      .then((users) => setSuggestedUsers(users.filter((u) => u.id !== user?.id).slice(0, 8)))
      .catch(() => {});
  }, [accessToken, user?.id]);

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
      {/* Logo Yumia — bien visible */}
      <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
        <YumiaLogo height={110} />
      </View>

      {/* Titre */}
      <View style={styles.section}>
        <Text style={styles.h1}>Explorer</Text>
        <Text style={styles.sub}>Parcours, cherche, et trouve l'expérience parfaite.</Text>
      </View>

      {/* Recherche */}
      <View style={styles.section}>
        <Pressable style={styles.search} onPress={() => router.push('/search')}>
          <Text style={styles.searchIcon}>🔍</Text>
          <Text style={styles.searchText}>Dis-moi ce que tu cherches…</Text>
        </Pressable>
      </View>

      {/* Accès rapides */}
      <View style={styles.section}>
        <View style={styles.grid}>
          {QUICK_ACTIONS.map((a) => (
            <Pressable key={a.key} style={styles.actionCard} onPress={() => router.push(a.route as never)}>
              <Text style={styles.actionEmoji}>{a.emoji}</Text>
              <Text style={styles.actionLabel}>{a.label}</Text>
              <Text style={styles.actionSub}>{a.sub}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Sorties à la une */}
      {venues.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>🎟️ Sorties à la une</Text>
            <Pressable onPress={() => router.push('/sorties' as never)}>
              <Text style={styles.seeAll}>Tout voir</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {venues.map((v) => (
              <Pressable key={v.id} style={styles.eventCard} onPress={() => router.push('/sorties' as never)}>
                <View style={styles.eventTop}>
                  {v.boostLevel >= 3 ? <Text style={styles.hot}>🔥</Text> : null}
                  <Text style={styles.eventVenue} numberOfLines={1}>{v.name}</Text>
                </View>
                <Text style={styles.eventName} numberOfLines={2}>{v.eventName}</Text>
                <Text style={styles.eventMeta}>{v.city} · {v.ticketPrice != null ? `${v.ticketPrice}€` : 'Gratuit'}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Personnes à suivre */}
      {suggestedUsers.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>👥 Personnes à suivre</Text>
            <Pressable onPress={() => router.push('/search' as never)}>
              <Text style={styles.seeAll}>Voir plus</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {suggestedUsers.map((u) => (
              <Pressable key={u.id} style={styles.peopleCard} onPress={() => router.push(`/user/${u.id}` as never)}>
                {u.photoUrl ? (
                  <RNImage source={{ uri: u.photoUrl }} style={styles.peopleAvatar} />
                ) : (
                  <View style={[styles.peopleAvatar, styles.peopleAvatarFallback]}>
                    <Text style={styles.peopleAvatarTxt}>{u.displayName[0]}</Text>
                  </View>
                )}
                <Text style={styles.peopleName} numberOfLines={1}>{u.displayName}</Text>
                {u.bio ? <Text style={styles.peopleBio} numberOfLines={2}>{u.bio}</Text> : null}
                <Text style={styles.peopleLevel}>Niv. {u.level}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Pipeline lieux : rangées horizontales par univers clé */}
      {(['restaurant', 'bar', 'nightclub'] as Universe[]).map((u) => (
        <UniverseRow
          key={u}
          universe={u}
          lat={coords.lat}
          lng={coords.lng}
          enabled={!resolving}
          onSeeAll={() => router.push((u === 'nightclub' ? '/nightclub' : `/universe?u=${u}`) as never)}
          onCardPress={(p) => {
            placeStore.set({
              place: {
                id: p.id, name: p.name, universe: p.universe,
                location: { lat: p.lat, lng: p.lng },
                city: p.city, countryCode: p.countryCode,
                rating: p.rating, priceTier: p.priceTier as 1 | 2 | 3 | 4,
                photoUrls: p.photoUrls, tags: p.tags,
              },
              compatibility: 0,
              distanceMeters: Math.round(p.distanceMeters),
              reason: `${UNIVERSE_META[p.universe]?.emoji ?? '📍'} ${UNIVERSE_META[p.universe]?.labelFr ?? p.universe}`,
              engine: 'mood',
            });
            router.push('/place');
          }}
        />
      ))}

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

function UniverseRow({
  universe, lat, lng, enabled, onSeeAll, onCardPress,
}: {
  universe: Universe;
  lat: number;
  lng: number;
  enabled: boolean;
  onSeeAll: () => void;
  onCardPress: (p: NearbyPlace) => void;
}) {
  const { places, loading } = useNearbyUniverse({ lat, lng, universe, radius: 5000, limit: 8, enabled });
  const meta = UNIVERSE_META[universe];
  if (!loading && places.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.rowHeader}>
        <Text style={styles.sectionTitle}>{meta.emoji}  {meta.labelFr}</Text>
        <Pressable onPress={onSeeAll}><Text style={styles.rowSeeAll}>Voir tout →</Text></Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendingRow}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <View key={i} style={styles.trendingSkeletonCard} />)
          : places.map((p) => <PlaceCard key={p.id} place={p} onPress={() => onCardPress(p)} />)
        }
      </ScrollView>
    </View>
  );
}

function PlaceCard({ place, onPress }: { place: NearbyPlace; onPress: () => void }) {
  const meta = UNIVERSE_META[place.universe];
  const distText = place.distanceMeters < 1000
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
      <View style={styles.trendingInfo}>
        <Text style={styles.trendingName} numberOfLines={1}>{place.name}</Text>
        <Text style={styles.trendingMeta}>{distText} · ⭐ {place.rating.toFixed(1)}</Text>
      </View>
    </Pressable>
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
  h1: { ...typography.display, color: colors.textPrimary },
  sub: { ...typography.body, color: colors.textSecondary, marginTop: 4 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.pill, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
  },
  searchIcon: { fontSize: 16 },
  searchText: { ...typography.body, color: colors.textMuted },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionCard: {
    width: '31.5%', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, gap: 2, minHeight: 96, justifyContent: 'center',
  },
  actionEmoji: { fontSize: 26 },
  actionLabel: { ...typography.caption, color: colors.textPrimary, fontWeight: '700', marginTop: 4 },
  actionSub: { ...typography.label, color: colors.textMuted, fontSize: 10 },

  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.md },
  seeAll: { ...typography.caption, color: colors.brandSoft },
  row: { gap: spacing.md, paddingRight: spacing.md },
  eventCard: {
    width: 180, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, gap: 4,
  },
  eventTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hot: { fontSize: 13 },
  eventVenue: { ...typography.label, color: colors.textMuted, flex: 1 },
  eventName: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  eventMeta: { ...typography.caption, color: colors.brandSoft, marginTop: 2 },

  peopleCard: {
    width: 120, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, alignItems: 'center', gap: 4,
  },
  peopleAvatar: { width: 52, height: 52, borderRadius: 26, marginBottom: 4 },
  peopleAvatarFallback: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  peopleAvatarTxt: { color: '#fff', fontWeight: '800', fontSize: 20 },
  peopleName: { ...typography.caption, color: colors.textPrimary, fontWeight: '700', textAlign: 'center' },
  peopleBio: { ...typography.label, color: colors.textMuted, fontSize: 10, textAlign: 'center' },
  peopleLevel: { ...typography.label, color: colors.brandSoft, fontSize: 10, fontWeight: '700' },

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
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  rowSeeAll: { ...typography.caption, color: colors.brand, fontWeight: '600' },
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
