/**
 * EXPLORER — hub de découverte & catalogue. Distinct de Home (« quoi faire
 * maintenant ») : ici on parcourt, on cherche, on réserve.
 *
 * Mise en scène (17/11/2026) : le haut de l'écran est le CIEL RÉEL de
 * l'endroit où l'on se trouve (pluie, soleil, étoiles — WeatherSky, le même
 * que l'écran Météo), qui glisse en parallaxe au défilement. Viennent ensuite
 * la grille « Réserver » (Guides, Boutique, Cadeaux, partenaires), les
 * Tendances, puis le Top 3 de l'IA en grand carrousel photo (ordre demandé
 * par l'utilisateur le 17/11 : la réservation partenaire d'abord).
 *
 * Les rangées Restaurants / Desserts / Lieux de culte ont été retirées : leur
 * choix était arbitraire, elles doublaient la grille d'univers de Home et
 * coûtaient trois recherches Google par nouveau quartier.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import Animated, {
  Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UNIVERSE_META, type Suggestion } from '@yumia/shared';
import { colors, gradients, radius, spacing, typography } from '../../theme/tokens';
import { universeLabel } from '../../lib/universeMeta';
import { useLocation } from '../../lib/useLocation';
import { YumiaLogo } from '../../components/YumiaLogo';
import { useAuth } from '../../lib/auth-context';
import { PremiumUpsellModal } from '../../components/PremiumUpsellModal';
import { PlacePhoto } from '../../components/PlacePhoto';
import { PressableScale, Reveal, GradientText } from '../../components/ui';
import { WeatherSky } from '../../components/weather/WeatherSky';
import { useTop3 } from '../../lib/useTop3';
import { useSaved } from '../../lib/useSaved';
import { useI18n } from '../../lib/useI18n';
import type { TranslationKey } from '../../lib/translations';
import { placeStore } from '../../lib/place-store';
import { useWeather } from '../../lib/useWeather';
import { useWeatherReport } from '../../lib/useWeatherReport';
import { dayMomentAt, kindEmoji } from '../../lib/services/weather';
import { useTrending } from '../../lib/useTrending';
import { usePlanLimits } from '../../lib/usePlanLimits';
import type { TrendingPlace } from '../../lib/places-api';
import { fetchGenericAffiliateLink, fetchGenericCategories } from '../../lib/affiliates-api';
import { ratingSuffix } from '../../lib/place-rating';
import { TOUR_THEME_KEYS } from '../../lib/tour-themes';
import { openExternalHttps } from '../../lib/external-link';
import { haptics } from '../../lib/useHaptics';
import { FeatureTip } from '../../components/FeatureTip';

// Favoris, Surprise Me et Classement vivent déjà dans Home
// (FEATURE_SHORTCUTS) — pas de doublon entre onglets.
// "Sorties & billets" retiré temporairement (paiement Stripe pas encore
// branché, back-office venue absent) — voir sorties.tsx, code conservé pour
// réactivation future, juste plus d'accès UI.
// "Sortie en groupe" déménagé dans Social, sur la ligne de raccourcis
// (mon profil / Tind / carte / meetups) — voir app/(tabs)/social.tsx.
// "Bons plans" retiré : la liste de lieux proches réservables faisait doublon
// avec la grille de partenaires juste en dessous, pour un intérêt moindre.
// L'affiliation elle-même est intacte — onglets génériques ci-dessous et
// bouton "Réserver" sur chaque fiche lieu. L'écran app/deals.tsx et la route
// GET /affiliates/deals restent en place, simplement sans accès depuis l'UI.

// Onglets génériques (liens trackés vers la page d'accueil/recherche d'un
// partenaire — pas de lieu précis, l'utilisateur cherche lui-même une fois
// sur place). `category` doit correspondre exactement à une clé de
// GENERIC_CATEGORIES côté API (affiliates.service.ts).
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

/** Hauteur du ciel, hors encoche. */
const HERO_HEIGHT = 300;
/** Écart entre deux cartes du carrousel Top 3. */
const CARD_GAP = 12;

function distanceText(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export default function ExplorerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { accessToken, user } = useAuth();
  const { t } = useI18n();
  const { coords, resolving, isFallback, city, refreshIfMoved } = useLocation();

  // Explorer reste monté quand on change d'onglet : sans relecture, ses lieux
  // restaient ceux du point de départ. Au retour sur l'onglet, on relit la
  // position, et les lieux ne se rechargent que si l'on a bougé de 1 km.
  // Le ciel animé ne tourne que tant que l'onglet est affiché (batterie).
  const explorerFocused = useRef(false);
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      if (explorerFocused.current) void refreshIfMoved(1000);
      explorerFocused.current = true;
      return () => setFocused(false);
    }, [refreshIfMoved]),
  );

  const weather = useWeather(coords.lat, coords.lng);
  const { report } = useWeatherReport(coords.lat, coords.lng);
  const moment = useMemo(
    () => (report ? dayMomentAt(new Date(), report.astro, report.coordinates.lat) : 'day'),
    [report],
  );

  const { savedIds, save, unsave, limitError, clearLimitError } = useSaved(accessToken);
  const { savedLimitMessage } = usePlanLimits();

  const [genericLinkLoading, setGenericLinkLoading] = useState<string | null>(null);

  /**
   * Catégories réellement ouvertes côté serveur. `null` tant que la réponse
   * n'est pas arrivée : on affiche alors la liste complète plutôt qu'une
   * grille vide qui clignoterait à chaque ouverture de l'écran.
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
    // Thèmes de visites : liste réelle dans l'app, comme Visites guidées.
    // Hôtel, location et vols (Booking.com) ouvrent toujours le partenaire :
    // son API de recherche est réservée aux affiliés validés.
    if (TOUR_THEME_KEYS.has(category)) {
      router.push(`/guides?theme=${category}` as never);
      return;
    }
    // Location de voiture (Discover Cars) : choix de la ville dans l'app,
    // puis page de cette ville chez le partenaire.
    if (category === 'car_rental') {
      router.push('/car-rental' as never);
      return;
    }
    if (!accessToken || genericLinkLoading) return;
    setGenericLinkLoading(category);
    try {
      const url = await fetchGenericAffiliateLink(category, accessToken);
      await openExternalHttps(url);
    } catch {
      // Ne devrait plus arriver : la grille ne montre que les catégories que
      // le serveur déclare ouvertes. Reste silencieux plutôt que d'alerter sur
      // une coupure réseau passagère — l'utilisateur réappuiera.
    } finally {
      setGenericLinkLoading(null);
    }
  }

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
      weather?.tempC,
      weather?.condition,
      city,
      user?.preferences?.favoriteUniverses,
      user?.preferences?.restrictions,
    ],
  );

  const top3 = useTop3(top3Params, !resolving);

  // ── Parallaxe du ciel ─────────────────────────────────────────────────────
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y; });
  const heroTotal = HERO_HEIGHT + insets.top;
  const skyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [-200, 0, heroTotal], [-100, 0, heroTotal * 0.45], Extrapolation.CLAMP) },
      { scale: interpolate(scrollY.value, [-200, 0], [1.35, 1], Extrapolation.CLAMP) },
    ],
  }));
  const heroContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, heroTotal * 0.6], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [0, heroTotal], [0, -30], Extrapolation.CLAMP) }],
  }));

  const openSuggestion = (s: Suggestion) => { placeStore.set(s); router.push('/place'); };
  const openTrending = (place: TrendingPlace) => {
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
  };

  const cardWidth = width - spacing.lg * 2;
  const current = report?.current;

  return (
    <View style={styles.screen}>
      <PremiumUpsellModal visible={limitError !== null} message={limitError !== null ? savedLimitMessage() : ''} onClose={clearLimitError} />

      {/* ── Ciel réel, en fond, sous le défilement ─────────────────────── */}
      <Animated.View style={[styles.sky, { height: heroTotal + 80 }, skyStyle]} pointerEvents="none">
        {current && focused ? (
          <WeatherSky kind={current.kind} moment={moment} />
        ) : (
          <LinearGradient colors={gradients.brand} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          colors={['transparent', 'rgba(14,14,18,0.55)', colors.bg]}
          locations={[0.35, 0.75, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={top3.loading && !resolving}
            onRefresh={() => top3.refetch()}
            tintColor="#fff"
            progressViewOffset={insets.top}
          />
        }
      >
        {/* ── En-tête sur le ciel ─────────────────────────────────────── */}
        <Animated.View style={[styles.hero, { height: heroTotal, paddingTop: insets.top + spacing.sm }, heroContentStyle]}>
          <View style={styles.heroTop}>
            <YumiaLogo height={44} />
            {current ? (
              <View style={styles.weatherChip}>
                <Text style={styles.weatherChipEmoji}>{kindEmoji(current.kind, current.isDay)}</Text>
                <Text style={styles.weatherChipTemp}>{Math.round(current.tempC)}°</Text>
                {city ? <Text style={styles.weatherChipCity} numberOfLines={1}>{city}</Text> : null}
              </View>
            ) : null}
          </View>

          <View style={styles.heroBottom}>
            <Text style={styles.heroTitle}>{t('explorer_title')}</Text>
            <Text style={styles.heroSub}>{t('explorer_sub')}</Text>
            <PressableScale style={styles.search} onPress={() => router.push('/search')} scaleTo={0.98}>
              <Text style={styles.searchIcon}>🔍</Text>
              <Text style={styles.searchText} numberOfLines={1}>{t('explorer_search_placeholder')}</Text>
              <View style={styles.searchGo}>
                <Text style={styles.searchGoText}>→</Text>
              </View>
            </PressableScale>
          </View>
        </Animated.View>

        {/* ── Réserver & découvrir : grille « bento » ─────────────────── */}
        <Reveal index={0} style={[styles.block, styles.padded]}>
          <Text style={[styles.sectionTitlePlain, styles.bentoTitle]}>{t('explorer_action_deals_sub')}</Text>

          <BentoTile
            colors={gradients.brand}
            emoji="🧭"
            label={t('explorer_action_guides_label')}
            sub={t('explorer_action_guides_sub')}
            big
            onPress={() => router.push('/guides' as never)}
          />
          <View style={styles.bentoRow}>
            <BentoTile
              colors={gradients.shop}
              emoji="🛍️"
              label={t('explorer_action_shop_label')}
              sub={t('explorer_action_shop_sub')}
              onPress={() => router.push('/shop' as never)}
            />
            <BentoTile
              colors={gradients.gift}
              emoji="🎁"
              label={t('explorer_action_gifts_label')}
              sub={t('explorer_action_gifts_sub')}
              onPress={() => router.push('/shop/gift-ideas' as never)}
            />
          </View>

          <View style={styles.partnerGrid}>
            {visibleDealTabs.map((d) => (
              <PressableScale
                key={d.category}
                style={styles.partnerTile}
                onPress={() => void openGenericDeal(d.category)}
                disabled={genericLinkLoading === d.category}
              >
                <View style={styles.partnerIcon}>
                  {genericLinkLoading === d.category ? (
                    <ActivityIndicator size="small" color={colors.brand} />
                  ) : (
                    <Text style={styles.partnerEmoji}>{d.emoji}</Text>
                  )}
                </View>
                <Text style={styles.partnerLabel} numberOfLines={2}>{t(d.labelKey)}</Text>
              </PressableScale>
            ))}
          </View>
        </Reveal>
        {/* ── Tendances près de toi ───────────────────────────────────── */}
        {(trending.places.length > 0 || trending.loading) && !resolving ? (
          <Reveal index={1} style={styles.block}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitlePlain}>{t('explorer_trending_near_you')}</Text>
            </View>
            <Animated.ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.trendingRow}
            >
              {trending.loading
                ? Array.from({ length: 4 }).map((_, i) => <View key={i} style={styles.trendingSkeleton} />)
                : trending.places.map((place, i) => (
                  <Reveal key={place.id} index={i} from="fade">
                    <TrendingCard place={place} rank={i + 1} onPress={() => openTrending(place)} />
                  </Reveal>
                ))}
            </Animated.ScrollView>
          </Reveal>
        ) : null}

        {/* ── Top 3 : carrousel photo plein cadre ─────────────────────── */}
        <Reveal index={2} style={styles.block}>
          <View style={styles.sectionHead}>
            <GradientText style={styles.sectionTitle}>{t('top3_title')}</GradientText>
            {top3.data?.reason ? <Text style={styles.sectionSub}>{top3.data.reason}</Text> : null}
            {isFallback && !resolving ? <Text style={styles.fallbackHint}>{t('location_fallback')}</Text> : null}
          </View>

          {resolving || top3.loading ? (
            <View style={[styles.top3Skeleton, { width: cardWidth }]}>
              <ActivityIndicator color={colors.brand} />
            </View>
          ) : top3.error ? (
            <StateBox text={top3.error} onRetry={top3.refetch} />
          ) : top3.data && top3.data.suggestions.length > 0 ? (
            <Top3Carousel
              suggestions={top3.data.suggestions}
              cardWidth={cardWidth}
              savedIds={savedIds}
              onOpen={openSuggestion}
              onToggleSave={accessToken ? (id, willSave) => (willSave ? save(id) : unsave(id)) : undefined}
            />
          ) : (
            <StateBox text={t('no_results')} />
          )}
        </Reveal>

      </Animated.ScrollView>
      <FeatureTip feature="explorer" />
    </View>
  );
}

// ── Top 3 ────────────────────────────────────────────────────────────────────

function Top3Carousel({
  suggestions, cardWidth, savedIds, onOpen, onToggleSave,
}: {
  suggestions: Suggestion[];
  cardWidth: number;
  savedIds: Set<string>;
  onOpen: (s: Suggestion) => void;
  onToggleSave?: (placeId: string, willSave: boolean) => Promise<void>;
}) {
  const scrollX = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { scrollX.value = e.contentOffset.x; });
  const step = cardWidth + CARD_GAP;

  return (
    <View>
      <Animated.ScrollView
        horizontal
        onScroll={onScroll}
        scrollEventThrottle={16}
        snapToInterval={step}
        decelerationRate="fast"
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: CARD_GAP }}
      >
        {suggestions.map((s, i) => (
          <Top3Card
            key={s.place.id}
            suggestion={s}
            rank={i + 1}
            index={i}
            width={cardWidth}
            step={step}
            scrollX={scrollX}
            saved={savedIds.has(s.place.id)}
            onPress={() => onOpen(s)}
            onToggleSave={onToggleSave}
          />
        ))}
      </Animated.ScrollView>
      <View style={styles.dots}>
        {suggestions.map((s, i) => <Dot key={s.place.id} index={i} step={step} scrollX={scrollX} />)}
      </View>
    </View>
  );
}

function Dot({ index, step, scrollX }: { index: number; step: number; scrollX: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const d = Math.abs(scrollX.value / step - index);
    return {
      width: interpolate(d, [0, 1], [22, 7], Extrapolation.CLAMP),
      opacity: interpolate(d, [0, 1], [1, 0.35], Extrapolation.CLAMP),
    };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

function Top3Card({
  suggestion, rank, index, width, step, scrollX, saved, onPress, onToggleSave,
}: {
  suggestion: Suggestion;
  rank: number;
  index: number;
  width: number;
  step: number;
  scrollX: SharedValue<number>;
  saved: boolean;
  onPress: () => void;
  onToggleSave?: (placeId: string, willSave: boolean) => Promise<void>;
}) {
  const { t } = useI18n();
  const { place, compatibility, distanceMeters, reason } = suggestion;
  const meta = UNIVERSE_META[place.universe];
  const [isSaved, setIsSaved] = useState(saved);
  useEffect(() => setIsSaved(saved), [saved]);

  // La carte voisine recule un peu : profondeur pendant le glissement.
  const cardStyle = useAnimatedStyle(() => {
    const d = Math.abs(scrollX.value / step - index);
    return {
      transform: [{ scale: interpolate(d, [0, 1], [1, 0.92], Extrapolation.CLAMP) }],
      opacity: interpolate(d, [0, 1], [1, 0.7], Extrapolation.CLAMP),
    };
  });
  // La photo glisse moins vite que la carte : parallaxe dans le cadre.
  const photoStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(scrollX.value, [(index - 1) * step, index * step, (index + 1) * step], [-40, 0, 40]) }],
  }));

  async function toggleSave() {
    if (!onToggleSave) return;
    const next = !isSaved;
    haptics.light();
    setIsSaved(next);
    try { await onToggleSave(place.id, next); } catch { setIsSaved(!next); }
  }

  return (
    <Animated.View style={[{ width }, cardStyle]}>
      <PressableScale style={styles.top3Card} onPress={onPress} scaleTo={0.97}>
        <Animated.View style={[styles.top3Photo, photoStyle]}>
          <PlacePhoto photoUrls={place.photoUrls} emoji={meta?.emoji ?? '📍'} emojiSize={90} />
        </Animated.View>
        <LinearGradient
          colors={['rgba(0,0,0,0.35)', 'transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']}
          locations={[0, 0.3, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.top3Head}>
          <GradientText style={styles.top3Rank}>{String(rank)}</GradientText>
          <View style={styles.top3HeadRight}>
            {compatibility > 0 ? (
              <View style={[styles.compatPill, { backgroundColor: compatibility >= 85 ? colors.compatHigh : colors.compatMid }]}>
                <Text style={styles.compatText}>{Math.round(compatibility)}%</Text>
              </View>
            ) : null}
            {onToggleSave ? (
              <Pressable style={styles.heartBtn} onPress={toggleSave} hitSlop={10}>
                <Text style={styles.heartText}>{isSaved ? '❤️' : '🤍'}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.top3Body}>
          <View style={styles.universeChip}>
            <Text style={styles.universeChipText}>{meta?.emoji ?? '📍'} {universeLabel(t, place.universe)}</Text>
          </View>
          <Text style={styles.top3Name} numberOfLines={2}>{place.name}</Text>
          {reason ? <Text style={styles.top3Reason} numberOfLines={2}>{reason}</Text> : null}
          {typeof distanceMeters === 'number' ? (
            <Text style={styles.top3Meta}>📍 {distanceText(distanceMeters)}{ratingSuffix(place.rating)}</Text>
          ) : null}
        </View>
      </PressableScale>
    </Animated.View>
  );
}

// ── Tendances ────────────────────────────────────────────────────────────────

function TrendingCard({ place, rank, onPress }: { place: TrendingPlace; rank: number; onPress: () => void }) {
  const { t } = useI18n();
  const meta = UNIVERSE_META[place.universe];
  return (
    <PressableScale style={styles.trendingCard} onPress={onPress}>
      <PlacePhoto photoUrls={place.photoUrls} emoji={meta?.emoji ?? '📍'} emojiSize={40} />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        locations={[0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.trendingRank}>
        <Text style={styles.trendingRankText}>🔥 {rank}</Text>
      </View>
      <View style={styles.trendingInfo}>
        <Text style={styles.trendingName} numberOfLines={2}>{place.name}</Text>
        <Text style={styles.trendingMeta} numberOfLines={1}>
          {t('explorer_visits_badge').replace('{n}', String(place.visitCount))} · {distanceText(place.distanceMeters)}
        </Text>
      </View>
    </PressableScale>
  );
}

// ── Grille « Réserver » ──────────────────────────────────────────────────────

function BentoTile({
  colors: tileColors, emoji, label, sub, big = false, onPress,
}: {
  colors: readonly string[];
  emoji: string;
  label: string;
  sub: string;
  big?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale style={[styles.bentoTile, big ? styles.bentoBig : styles.bentoHalf]} onPress={onPress} haptic>
      <LinearGradient
        colors={tileColors as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Grand emoji en filigrane, débordant du coin : profondeur sans image. */}
      <Text style={[styles.bentoWatermark, big && styles.bentoWatermarkBig]}>{emoji}</Text>
      <Text style={styles.bentoEmoji}>{emoji}</Text>
      <View style={styles.bentoText}>
        <Text style={[styles.bentoLabel, big && styles.bentoLabelBig]} numberOfLines={1}>{label}</Text>
        <Text style={styles.bentoSub} numberOfLines={2}>{sub}</Text>
      </View>
    </PressableScale>
  );
}

function StateBox({ text, onRetry }: { text?: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <View style={[styles.stateBox, styles.padded]}>
      {text ? <Text style={styles.stateText}>{text}</Text> : null}
      {onRetry ? (
        <Pressable style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryText}>{t('explorer_retry')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const TEXT_SHADOW = {
  textShadowColor: 'rgba(0,0,0,0.45)',
  textShadowOffset: { width: 0, height: 2 },
  textShadowRadius: 10,
} as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  padded: { paddingHorizontal: spacing.lg },
  block: { marginBottom: spacing.xl },

  // Ciel
  sky: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  hero: { paddingHorizontal: spacing.lg, justifyContent: 'space-between', paddingBottom: spacing.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weatherChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '60%',
    backgroundColor: 'rgba(14,14,18,0.35)', borderColor: 'rgba(255,255,255,0.22)', borderWidth: 1,
    borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12,
  },
  weatherChipEmoji: { fontSize: 16 },
  weatherChipTemp: { color: '#fff', fontWeight: '800', fontSize: 15 },
  weatherChipCity: { color: 'rgba(255,255,255,0.85)', fontWeight: '600', fontSize: 13, flexShrink: 1 },
  heroBottom: { gap: 6 },
  heroTitle: { fontSize: 46, fontWeight: '900', color: '#fff', letterSpacing: -1.5, ...TEXT_SHADOW },
  heroSub: { ...typography.body, color: 'rgba(255,255,255,0.88)', marginBottom: spacing.sm, ...TEXT_SHADOW },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(14,14,18,0.6)', borderColor: 'rgba(255,255,255,0.2)', borderWidth: 1,
    borderRadius: radius.pill, paddingVertical: 6, paddingLeft: spacing.lg, paddingRight: 6,
  },
  searchIcon: { fontSize: 16 },
  searchText: { ...typography.body, color: 'rgba(255,255,255,0.7)', flex: 1 },
  searchGo: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  searchGoText: { color: '#fff', fontSize: 18, fontWeight: '800' },

  // Titres de section
  sectionHead: { paddingHorizontal: spacing.lg, marginBottom: spacing.md, gap: 4 },
  sectionTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  sectionTitlePlain: { fontSize: 22, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.4 },
  sectionSub: { ...typography.caption, color: colors.textSecondary },
  fallbackHint: { ...typography.caption, color: colors.textMuted },

  // Top 3
  top3Skeleton: {
    height: 420, alignSelf: 'center', borderRadius: radius.xl, backgroundColor: colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  top3Card: {
    height: 420, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.surfaceElevated,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  top3Photo: { position: 'absolute', top: 0, bottom: 0, left: -40, right: -40 },
  top3Head: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
  },
  top3Rank: { fontSize: 96, fontWeight: '900', lineHeight: 104, letterSpacing: -4 },
  top3HeadRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  compatPill: { borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 10 },
  compatText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  heartBtn: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(14,14,18,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  heartText: { fontSize: 18 },
  top3Body: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, gap: 6 },
  universeChip: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radius.pill,
    paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  universeChipText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  top3Name: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -0.6, ...TEXT_SHADOW },
  top3Reason: { ...typography.body, color: 'rgba(255,255,255,0.85)', lineHeight: 21 },
  top3Meta: { ...typography.caption, color: 'rgba(255,255,255,0.75)', fontWeight: '700' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: spacing.md },
  dot: { height: 7, borderRadius: 4, backgroundColor: colors.brand },

  // Tendances
  trendingRow: { gap: spacing.md, paddingHorizontal: spacing.lg },
  trendingCard: {
    width: 156, height: 210, borderRadius: radius.lg, overflow: 'hidden',
    backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  trendingSkeleton: { width: 156, height: 210, borderRadius: radius.lg, backgroundColor: colors.surfaceElevated },
  trendingRank: {
    position: 'absolute', top: spacing.sm, left: spacing.sm, borderRadius: radius.pill,
    backgroundColor: 'rgba(14,14,18,0.6)', paddingVertical: 3, paddingHorizontal: 9,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  trendingRankText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  trendingInfo: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.sm + 2, gap: 3 },
  trendingName: { color: '#fff', fontWeight: '800', fontSize: 15, lineHeight: 19 },
  trendingMeta: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600' },

  // Bento
  bentoTitle: { marginBottom: spacing.md },
  bentoRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  bentoTile: { borderRadius: radius.lg, overflow: 'hidden', padding: spacing.md, justifyContent: 'space-between' },
  bentoBig: { height: 132 },
  bentoHalf: { flex: 1, height: 150 },
  bentoWatermark: {
    position: 'absolute', right: -14, bottom: -18, fontSize: 96, opacity: 0.18,
    transform: [{ rotate: '-14deg' }],
  },
  bentoWatermarkBig: { fontSize: 130, right: -6, bottom: -30 },
  bentoEmoji: { fontSize: 28 },
  bentoText: { gap: 2 },
  bentoLabel: { color: '#fff', fontWeight: '900', fontSize: 17, letterSpacing: -0.3 },
  bentoLabelBig: { fontSize: 22 },
  bentoSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  partnerGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.lg, rowGap: spacing.md },
  partnerTile: { width: '20%', alignItems: 'center', gap: 6 },
  partnerIcon: {
    width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border,
  },
  partnerEmoji: { fontSize: 24 },
  partnerLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '600', textAlign: 'center', paddingHorizontal: 2 },

  // États
  stateBox: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  stateText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  retryText: { ...typography.caption, color: colors.textPrimary },
});
