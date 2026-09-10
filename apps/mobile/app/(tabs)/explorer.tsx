/**
 * EXPLORER — hub de découverte & catalogue. Distinct de Home (« quoi faire
 * maintenant ») : ici on parcourt, on cherche, on accède aux univers, aux
 * guides, aux sorties, au mode groupe et au classement. Contient aussi les
 * sections « Tendances » et « Top 3 / Itinéraire » (déménagées depuis Home,
 * qui ne montre plus que la grille d'univers).
 */
import { useEffect, useMemo, useState } from 'react';
import { Image as RNImage, Linking, ScrollView, View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MODE_META, UNIVERSE_META } from '@yumia/shared';
import type { Mode, Universe } from '@yumia/shared';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { universeLabel } from '../../lib/universeMeta';
import { modeLabel } from '../../lib/labelHelpers';
import { useLocation } from '../../lib/useLocation';
import { YumiaLogo } from '../../components/YumiaLogo';
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
import type { TranslationKey } from '../../lib/translations';
import { placeStore } from '../../lib/place-store';
import { useWeather } from '../../lib/useWeather';
import { SkeletonCard } from '../../components/SkeletonCard';
import { useTrending } from '../../lib/useTrending';
import { usePlanLimits } from '../../lib/usePlanLimits';
import type { TrendingPlace, NearbyPlace } from '../../lib/places-api';
import { useNearbyUniverse } from '../../lib/useNearbyUniverse';
import { universeSearchRadius } from '../../lib/universeRadius';
import { fetchGenericAffiliateLink, fetchGenericCategories } from '../../lib/affiliates-api';

// Favoris, Surprise Me et Classement vivent déjà dans Home
// (FEATURE_SHORTCUTS) — pas de doublon entre onglets.
// "Sorties & billets" retiré temporairement (paiement Stripe pas encore
// branché, back-office venue absent) — voir sorties.tsx, code conservé pour
// réactivation future, juste plus d'accès UI.
// "Sortie en groupe" déménagé dans Social, sur la ligne de raccourcis
// (mon profil / Tind / carte / meetups) — voir app/(tabs)/social.tsx.
const QUICK_ACTIONS: { key: string; emoji: string; labelKey: TranslationKey; subKey: TranslationKey; route: string }[] = [
  { key: 'guides', emoji: '🧭', labelKey: 'explorer_action_guides_label', subKey: 'explorer_action_guides_sub', route: '/guides' },
  { key: 'deals', emoji: '💰', labelKey: 'explorer_action_deals_label', subKey: 'explorer_action_deals_sub', route: '/deals' },
  { key: 'shop', emoji: '🛍️', labelKey: 'explorer_action_shop_label', subKey: 'explorer_action_shop_sub', route: '/shop' },
];

// Onglets génériques (liens trackés vers la page d'accueil/recherche d'un
// partenaire — pas de lieu précis, l'utilisateur cherche lui-même une fois
// sur place). `category` doit correspondre exactement à une clé de
// GENERIC_CATEGORIES côté API (affiliates.service.ts). Rendues en grille
// compacte façon Home (voir styles genericGrid/genericTile).
const GENERIC_DEAL_TABS: { category: string; emoji: string; labelKey: TranslationKey }[] = [
  { category: 'activities', emoji: '🎟️', labelKey: 'explorer_generic_activities' },
  { category: 'skip_the_line', emoji: '🎫', labelKey: 'explorer_generic_skip_the_line' },
  { category: 'food_tours', emoji: '🍽️', labelKey: 'explorer_generic_food_tours' },
  { category: 'hop_on_hop_off', emoji: '🚌', labelKey: 'explorer_generic_hop_on_hop_off' },
  { category: 'airport_transfer', emoji: '🚕', labelKey: 'explorer_generic_airport_transfer' },
  { category: 'adventure', emoji: '🏔️', labelKey: 'explorer_generic_adventure' },
  { category: 'shows', emoji: '🌙', labelKey: 'explorer_generic_shows' },
  // Booking.com — fonctionnels même sans identifiant d'affilié : le lien mène
  // à la bonne page, il n'est simplement pas rémunéré tant que l'inscription
  // CJ n'est pas validée (voir BookingProvider.generateGenericLink).
  { category: 'hotel', emoji: '🏨', labelKey: 'explorer_generic_hotel' },
  { category: 'car_rental', emoji: '🚗', labelKey: 'explorer_generic_car_rental' },
  { category: 'flights', emoji: '✈️', labelKey: 'explorer_generic_flights' },
];

const ITINERARY_MODES: Mode[] = ['solo', 'surprise', 'date', 'family', 'group', 'travel'];

export default function ExplorerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const { t } = useI18n();
  const { coords, resolving, isFallback, city } = useLocation();
  const weather = useWeather(coords.lat, coords.lng);
  // Aucune sélection de mode dans Explorer (les boutons Date/Famille/Voyage
  // restent sur Home mais n'agissent plus sur cette section) : la section
  // Top 3 affiche donc toujours les suggestions générales, jamais l'itinéraire.
  const [selectedMode] = useState<Mode | null>(null);
  const [upsell, setUpsell] = useState<string | null>(null);
  const { savedIds, save, unsave, limitError, clearLimitError } = useSaved(accessToken);
  const { checkLimit, recordUsage } = usePlanLimits();

  const [genericLinkLoading, setGenericLinkLoading] = useState<string | null>(null);

  /**
   * Catégories réellement ouvertes côté serveur. `null` tant que la réponse
   * n'est pas arrivée : on affiche alors la liste complète plutôt qu'une
   * grille vide qui clignoterait à chaque ouverture de l'écran.
   *
   * Sans ce filtre, les onglets étaient codés en dur et affichés quoi qu'il
   * arrive : Hôtel, Location et Vols apparaissaient alors que l'API refusait
   * de générer leur lien, et l'appui ne faisait rien du tout.
   */
  const [openCategories, setOpenCategories] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    fetchGenericCategories(accessToken)
      .then((cats) => {
        if (cancelled) return;
        setOpenCategories(new Set(cats.filter((c) => c.configured).map((c) => c.category)));
      })
      // Réseau indisponible : on garde la liste complète, un onglet qui ne
      // répond pas reste préférable à une section qui disparaît.
      .catch(() => {});
    return () => { cancelled = true; };
  }, [accessToken]);

  const visibleDealTabs = openCategories
    ? GENERIC_DEAL_TABS.filter((d) => openCategories.has(d.category))
    : GENERIC_DEAL_TABS;

  async function openGenericDeal(category: string) {
    if (!accessToken || genericLinkLoading) return;
    setGenericLinkLoading(category);
    try {
      const url = await fetchGenericAffiliateLink(category, accessToken);
      void Linking.openURL(url);
    } catch {
      // Ne devrait plus arriver : la grille ne montre que les catégories que
      // le serveur déclare ouvertes. Reste silencieux plutôt que d'alerter sur
      // une coupure réseau passagère — l'utilisateur réappuiera.
    } finally {
      setGenericLinkLoading(null);
    }
  }

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
    ? `${MODE_META[selectedMode!].emoji} ${modeLabel(t, selectedMode!, MODE_META[selectedMode!].labelFr)}`
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
      {/* Logo Yumia — bien visible */}
      <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
        <YumiaLogo height={110} />
      </View>

      {/* Titre */}
      <View style={styles.section}>
        <Text style={styles.h1}>{t('explorer_title')}</Text>
        <Text style={styles.sub}>{t('explorer_sub')}</Text>
      </View>

      {/* Recherche */}
      <View style={styles.section}>
        <Pressable style={styles.search} onPress={() => router.push('/search')}>
          <Text style={styles.searchIcon}>🔍</Text>
          <Text style={styles.searchText}>{t('explorer_search_placeholder')}</Text>
        </Pressable>
      </View>

      {/* Accès rapides */}
      <View style={styles.section}>
        <View style={styles.grid}>
          {QUICK_ACTIONS.map((a) => (
            <Pressable key={a.key} style={styles.actionCard} onPress={() => router.push(a.route as never)}>
              <Text style={styles.actionEmoji}>{a.emoji}</Text>
              <Text style={styles.actionLabel}>{t(a.labelKey)}</Text>
              <Text style={styles.actionSub}>{t(a.subKey)}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Réservations partenaires — même grille compacte que les raccourcis
          de Home (Swipe/Assistant/Itinéraire...) : petites tuiles carrées,
          5 par ligne. Lien tracké générique, pas de lieu précis — voir
          GENERIC_DEAL_TABS et affiliates.service.ts côté API. */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('explorer_action_deals_sub')}</Text>
        <View style={styles.genericGrid}>
          {visibleDealTabs.map((d) => (
            <Pressable
              key={d.category}
              style={styles.genericTile}
              onPress={() => void openGenericDeal(d.category)}
              disabled={genericLinkLoading === d.category}
            >
              {genericLinkLoading === d.category ? (
                <ActivityIndicator size="small" color={colors.brand} />
              ) : (
                <Text style={styles.genericTileEmoji}>{d.emoji}</Text>
              )}
              <Text style={styles.genericTileLabel} numberOfLines={1}>{t(d.labelKey)}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* "Sorties à la une" retiré temporairement avec le reste de la
          fonctionnalité billetterie — voir sorties.tsx et le commentaire sur
          QUICK_ACTIONS plus haut. */}

      {/* "Personnes à suivre" retiré — déjà présent dans le mode Social
          (découverte de profils), doublon inutile ici. */}

      {/* Pipeline lieux : rangées horizontales par univers clé */}
      {(['restaurant', 'dessert', 'place_of_worship'] as Universe[]).map((u) => (
        <UniverseRow
          key={u}
          universe={u}
          lat={coords.lat}
          lng={coords.lng}
          enabled={!resolving}
          onSeeAll={() => router.push(`/universe?u=${u}` as never)}
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
              reason: `${UNIVERSE_META[p.universe]?.emoji ?? '📍'} ${universeLabel(t, p.universe)}`,
              engine: 'mood',
            });
            router.push('/place');
          }}
        />
      ))}

      {/* Tendances près de toi */}
      {(trending.places.length > 0 || trending.loading) && !resolving ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('explorer_trending_near_you')}</Text>
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
                      reason: t('explorer_trending_reason').replace('{n}', String(place.visitCount)),
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
  const { t } = useI18n();
  const { places, loading } = useNearbyUniverse({ lat, lng, universe, radius: universeSearchRadius(universe), limit: 8, enabled });
  const meta = UNIVERSE_META[universe];
  if (!loading && places.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.rowHeader}>
        <Text style={styles.sectionTitle}>{meta.emoji}  {universeLabel(t, universe)}</Text>
        <Pressable onPress={onSeeAll}><Text style={styles.rowSeeAll}>{t('explorer_see_all')}</Text></Pressable>
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
  const { t } = useI18n();
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
        <Text style={styles.trendingVisitText}>{t('explorer_visits_badge').replace('{n}', String(place.visitCount))}</Text>
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
  const { t } = useI18n();
  return (
    <View style={styles.stateBox}>
      {loading && <ActivityIndicator color={colors.brand} />}
      {text ? <Text style={styles.stateText}>{text}</Text> : null}
      {onRetry ? (
        <Pressable style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryText}>{t('explorer_retry')}</Text>
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

  // Même gabarit que les raccourcis de Home (Swipe/Assistant/Itinéraire...) —
  // grille 5 colonnes, tuiles carrées compactes, cf. app/(tabs)/index.tsx.
  genericGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  genericTile: {
    width: '18%', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.md, paddingVertical: 7, alignItems: 'center', gap: 3,
  },
  genericTileEmoji: { fontSize: 20 },
  genericTileLabel: { ...typography.label, color: colors.textSecondary, fontSize: 10 },

  sectionTitle: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.md },
  eventCard: {
    width: 180, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, gap: 4,
  },
  eventTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hot: { fontSize: 13 },
  eventVenue: { ...typography.label, color: colors.textMuted, flex: 1 },
  eventName: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  eventMeta: { ...typography.caption, color: colors.brandSoft, marginTop: 2 },


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
