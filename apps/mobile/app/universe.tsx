/**
 * UNIVERSE EXPLORER — liste des lieux d'un univers donné autour de l'utilisateur.
 * L'univers est passé via le paramètre URL `?u=restaurant`.
 *
 * Mise en scène (17/11/2026, dans la suite de l'Accueil) : grand en-tête aux
 * couleurs de la catégorie de l'univers, icône qui flotte, parallaxe au
 * défilement ; barre du haut en verre qui se remplit quand l'en-tête disparaît ;
 * lieux en grandes cartes photo (UniversePlaceCard) qui apparaissent en cascade.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, Extrapolation, cancelAnimation, interpolate, useAnimatedScrollHandler,
  useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { UNIVERSE_META, isUniverse } from '@yumia/shared';
import type { Universe } from '@yumia/shared';
import { colors, gradients, radius, spacing, typography } from '../theme/tokens';
import { useLocation } from '../lib/useLocation';
import { useAuth } from '../lib/auth-context';
import { useI18n } from '../lib/useI18n';
import type { TranslationKey } from '../lib/translations';
import { useSaved } from '../lib/useSaved';
import { useNearbyUniverse } from '../lib/useNearbyUniverse';
import { usePlanLimits } from '../lib/usePlanLimits';
import { PremiumUpsellModal } from '../components/PremiumUpsellModal';
import { universeLabel } from '../lib/universeMeta';
import { placeStore } from '../lib/place-store';
import type { NearbyPlace } from '../lib/places-api';
import { universeSearchRadius } from '../lib/universeRadius';
import { CATEGORY_OF, universeGradient } from '../lib/universeTheme';
import { UniverseGlyph } from '../components/UniverseGlyph';
import { PressableScale, Reveal } from '../components/ui';
import { PLACE_CARD_HEIGHT, UniversePlaceCard } from '../components/universe/UniversePlaceCard';

/** Hauteur de l'en-tête coloré, hors encoche. */
const HERO_HEIGHT = 270;
/** Barre du haut (bouton retour + titre compact). */
const BAR_HEIGHT = 52;

export default function UniverseScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { u, lat: latParam, lng: lngParam, place: placeParam, from } = useLocalSearchParams<{
    u: string; lat?: string; lng?: string; place?: string; from?: string;
  }>();
  const { coords: gpsCoords, resolving } = useLocation();

  // Un point précis (ville recherchée depuis la météo, par ex.) prime sur le
  // GPS — sinon l'écran ignorait toujours la ville consultée et retombait sur
  // « autour de moi », quel que soit l'endroit dont on venait.
  const fixedLat = latParam !== undefined ? Number(latParam) : undefined;
  const fixedLng = lngParam !== undefined ? Number(lngParam) : undefined;
  const hasFixedPoint = fixedLat !== undefined && fixedLng !== undefined && !Number.isNaN(fixedLat) && !Number.isNaN(fixedLng);
  const coords = hasFixedPoint ? { lat: fixedLat, lng: fixedLng } : gpsCoords;

  const { accessToken } = useAuth();
  const { t } = useI18n();
  const { savedIds, save, unsave } = useSaved(accessToken);

  const universe = (isUniverse(u) ? u : null) as Universe | null;
  const meta = universe ? UNIVERSE_META[universe] : null;

  const { consumePlaceLoad, displayCap } = usePlanLimits();
  const [upsell, setUpsell] = useState<string | null>(null);
  // `null` tant que le quota n'a pas été consulté : on ne lance aucune
  // requête avant d'avoir la réponse, sinon le chargement partirait quand
  // même et la limite ne servirait à rien.
  const [quotaOk, setQuotaOk] = useState<boolean | null>(null);

  // Un seul compteur de chargements de lieux, partagé par tous les univers
  // et la carte (plan-quotas.ts, placeLoadsPerDay).
  useEffect(() => {
    if (!universe) return;
    let active = true;
    void (async () => {
      try {
        const { allowed, message } = await consumePlaceLoad();
        if (!active) return;
        if (!allowed) { setQuotaOk(false); setUpsell(message); return; }
        setQuotaOk(true);
      } catch {
        // Compteur illisible (stockage du téléphone plein, par ex.) : on
        // laisse passer. Mieux vaut un chargement non compté qu'une page
        // qui reste vide pour toujours.
        if (active) setQuotaOk(true);
      }
    })();
    return () => { active = false; };
  }, [universe, consumePlaceLoad]);

  const { places: allPlaces, loading, error, reload } = useNearbyUniverse({
    lat: coords.lat,
    lng: coords.lng,
    universe,
    radius: universeSearchRadius(universe),
    limit: 60,
    enabled: (hasFixedPoint || !resolving) && quotaOk === true,
  });

  // Le serveur en renvoie jusqu'à 60 ; le forfait en montre 5. Couper ici
  // plutôt qu'à la requête garde le cache utilisable tel quel le jour d'un
  // passage à Plus.
  const places = allPlaces.slice(0, displayCap(from === 'weather' ? 'weatherUniversePlaces' : 'universePlaces'));

  // Tant que la position ou le quota ne sont pas connus, la recherche n'a pas
  // commencé : c'est « YUMIA cherche… », pas « Aucun lieu ». Sur Android, la
  // position met parfois plusieurs secondes, et la page affichait à tort
  // l'état vide pendant ce temps (24/11/2026).
  const waiting = (!hasFixedPoint && resolving) || quotaOk === null;
  const searching = (loading || waiting) && places.length === 0;

  /** Rafraîchir consomme un chargement de plus — c'en est un. */
  const reloadWithQuota = async () => {
    if (!universe) return;
    const { allowed, message } = await consumePlaceLoad();
    if (!allowed) { setUpsell(message); return; }
    reload();
  };

  function handleTap(p: NearbyPlace) {
    placeStore.set({
      place: {
        id: p.id,
        name: p.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        universe: p.universe as any,
        location: { lat: p.lat, lng: p.lng },
        city: p.city,
        countryCode: p.countryCode,
        rating: p.rating,
        priceTier: (Math.min(4, Math.max(1, p.priceTier))) as 1 | 2 | 3 | 4,
        photoUrls: p.photoUrls,
        tags: p.tags,
        openingHours: p.openingHours,
      },
      compatibility: 0,
      distanceMeters: p.distanceMeters,
      reason: t('uv_place_at_distance').replace('{universe}', universe ? universeLabel(t, universe) : String(universe)).replace('{dist}', formatDistance(p.distanceMeters)),
      engine: 'mood' as const,
    });
    router.push('/place');
  }

  // L'icône flotte tant que l'écran est affiché, s'arrête sinon (batterie).
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const float = useSharedValue(0);
  useEffect(() => {
    if (!focused) {
      cancelAnimation(float);
      return;
    }
    const ease = Easing.inOut(Easing.sin);
    float.value = withRepeat(
      withSequence(withTiming(-9, { duration: 1800, easing: ease }), withTiming(0, { duration: 1800, easing: ease })),
      -1,
    );
    return () => cancelAnimation(float);
  }, [focused, float]);
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: float.value }] }));

  // ── Parallaxe de l'en-tête ────────────────────────────────────────────────
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y; });
  const heroTotal = HERO_HEIGHT + insets.top;
  const backdropStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [-200, 0, heroTotal], [-100, 0, -heroTotal * 0.55], Extrapolation.CLAMP) },
      { scale: interpolate(scrollY.value, [-200, 0], [1.3, 1], Extrapolation.CLAMP) },
    ],
  }));
  const heroContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, heroTotal * 0.55], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [0, heroTotal], [0, -40], Extrapolation.CLAMP) }],
  }));
  // Barre du haut : transparente sur l'en-tête, pleine une fois qu'il a défilé.
  const barBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [heroTotal * 0.45, heroTotal * 0.75], [0, 1], Extrapolation.CLAMP),
  }));

  if (!universe || !meta) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.lg }]}>
        <PressableScale onPress={() => router.back()} style={styles.backBtnSolid}>
          <Text style={styles.backText}>←</Text>
        </PressableScale>
        <View style={styles.center}>
          <Text style={styles.stateEmoji}>🧭</Text>
          <Text style={styles.stateText}>{t('uv_unknown')}</Text>
        </View>
      </View>
    );
  }

  const grad = universeGradient(universe);
  const label = universeLabel(t, universe);
  const categoryKey = CATEGORY_OF[universe];
  const subtitle = placeParam
    ? `${t('uv_at')} ${placeParam}`
    : categoryKey ? t(`category_${categoryKey}` as TranslationKey) : '';
  const showCount = !searching && !error;

  const header = (
    <Animated.View style={[styles.hero, { height: heroTotal, paddingTop: insets.top + BAR_HEIGHT }, heroContentStyle]}>
      <Animated.View style={[styles.heroIcon, floatStyle]}>
        <UniverseGlyph u={universe} size={52} />
      </Animated.View>
      <View style={styles.heroText}>
        <Text style={styles.heroTitle} numberOfLines={2}>{label}</Text>
        <View style={styles.heroMetaRow}>
          {subtitle ? <Text style={styles.heroSub} numberOfLines={1}>{subtitle}</Text> : null}
          {showCount ? (
            <View style={styles.countPill}>
              <Text style={styles.countText}>
                {t('uv_count' as TranslationKey).replace('{n}', String(places.length))}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );

  const emptyState = searching ? (
    <View style={styles.stateBlock}>
      <View style={styles.searchingRow}>
        <ActivityIndicator color={grad[1]} />
        <Text style={styles.stateTextSmall}>
          {placeParam ? t('uv_searching_near_place').replace('{place}', placeParam) : t('uv_searching_near_you')}
        </Text>
      </View>
      {[0, 1, 2].map((i) => <SkeletonCard key={i} index={i} />)}
    </View>
  ) : error ? (
    <View style={[styles.stateBlock, styles.stateCentered]}>
      <Text style={styles.stateEmoji}>📡</Text>
      <Text style={styles.stateText}>{error}</Text>
      <PressableScale style={[styles.retryBtn, { backgroundColor: grad[1] }]} onPress={() => void reloadWithQuota()} haptic>
        <Text style={styles.retryText}>{t('retry')}</Text>
      </PressableScale>
    </View>
  ) : (
    <View style={[styles.stateBlock, styles.stateCentered]}>
      <View style={[styles.emptyIcon, { borderColor: `${grad[1]}66` }]}>
        <UniverseGlyph u={universe} size={44} />
      </View>
      <Text style={styles.stateText}>{t('uv_empty')}</Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <PremiumUpsellModal
        visible={upsell !== null}
        message={upsell ?? ''}
        onClose={() => setUpsell(null)}
        onDismiss={() => {
          // Quota refusé À L'OUVERTURE : l'écran n'a aucun lieu à montrer, et
          // le refermer laisserait devant une page vide sans rien à y faire.
          // On ramène donc à l'accueil. Un refus survenu sur un simple
          // rafraîchissement (`quotaOk === true`) n'y touche pas : les lieux
          // déjà chargés restent consultables.
          if (quotaOk === false) router.replace('/(tabs)');
        }}
      />

      {/* ── Fond coloré de l'univers, en parallaxe sous la liste ──────── */}
      <Animated.View style={[styles.backdrop, { height: heroTotal + 120 }, backdropStyle]} pointerEvents="none">
        <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={gradients.glassSheen} style={StyleSheet.absoluteFill} />
        <Text style={[styles.ghost, { top: insets.top + 20 }]}>{meta.emoji}</Text>
        <LinearGradient
          colors={['transparent', 'rgba(14,14,18,0.5)', colors.bg]}
          locations={[0.45, 0.8, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.FlatList
        data={places}
        keyExtractor={(p: NearbyPlace) => p.id}
        onScroll={onScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={header}
        ListEmptyComponent={emptyState}
        contentContainerStyle={{ paddingBottom: spacing.xxl + insets.bottom }}
        ItemSeparatorComponent={Separator}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading && places.length > 0}
            onRefresh={() => void reloadWithQuota()}
            tintColor="#fff"
            progressViewOffset={insets.top + BAR_HEIGHT}
          />
        }
        renderItem={({ item, index }: { item: NearbyPlace; index: number }) => {
          const todayHours = getTodayHours(item.openingHours, t);
          return (
            // Cascade limitée aux premières cartes : plus bas, un délai
            // croissant ferait attendre chaque carte recyclée au défilement.
            <Reveal index={Math.min(index, 5)} style={styles.cardWrap}>
              <UniversePlaceCard
                name={item.name}
                universe={item.universe}
                photoUrl={item.photoUrls?.[0]}
                distance={formatDistance(item.distanceMeters)}
                rating={item.rating}
                city={item.city}
                hours={todayHours}
                closed={todayHours === t('uv_closed')}
                saved={accessToken ? savedIds.has(item.id) : undefined}
                onToggleSave={accessToken
                  ? () => (savedIds.has(item.id) ? void unsave(item.id) : void save(item.id))
                  : undefined}
                onPress={() => handleTap(item)}
              />
            </Reveal>
          );
        }}
      />

      {/* ── Barre du haut : retour en verre + titre compact ───────────── */}
      <View style={[styles.bar, { paddingTop: insets.top, height: insets.top + BAR_HEIGHT }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, styles.barBg, barBgStyle]} pointerEvents="none">
          <LinearGradient colors={[grad[0], `${grad[0]}CC`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <PressableScale onPress={() => router.back()} style={styles.backBtn} scaleTo={0.88} hitSlop={8}>
          <Text style={styles.backText}>←</Text>
        </PressableScale>
        <Animated.View style={[styles.barTitleWrap, barBgStyle]} pointerEvents="none">
          <UniverseGlyph u={universe} size={20} />
          <Text style={styles.barTitle} numberOfLines={1}>{label}</Text>
        </Animated.View>
      </View>
    </View>
  );
}

function Separator() {
  return <View style={{ height: spacing.md }} />;
}

/** Carte fantôme qui pulse pendant la recherche. */
function SkeletonCard({ index }: { index: number }) {
  const pulse = useSharedValue(0.45);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.85, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Reveal index={index} from="fade">
      <Animated.View style={[styles.skeleton, style]} />
    </Reveal>
  );
}

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function getTodayHours(hours: string[] | undefined, t: (key: TranslationKey) => string): string | null {
  if (!hours || hours.length === 0) return null;
  const todayIdx = (new Date().getDay() + 6) % 7;
  const entry = hours[todayIdx];
  if (!entry) return null;
  const colonIdx = entry.indexOf(': ');
  const timeRange = colonIdx >= 0 ? entry.slice(colonIdx + 2) : entry;
  if (timeRange.toLowerCase().includes('fermé') || timeRange.toLowerCase().includes('closed')) return t('uv_closed');
  // Extrait l'heure de fermeture (après le tiret)
  const parts = timeRange.split(/\s[–\-]\s/);
  if (parts.length < 2) return timeRange;
  const closing = parts[parts.length - 1].trim();
  return t('uv_closes_at').replace('{time}', to24h(closing));
}

function to24h(time: string): string {
  const pmMatch = time.match(/^(\d{1,2}):(\d{2})\s*PM$/i);
  if (pmMatch) {
    const h = parseInt(pmMatch[1], 10);
    return `${h === 12 ? 12 : h + 12}h${pmMatch[2]}`;
  }
  const amMatch = time.match(/^(\d{1,2}):(\d{2})\s*AM$/i);
  if (amMatch) {
    const h = parseInt(amMatch[1], 10);
    return `${h === 12 ? '00' : String(h).padStart(2, '0')}h${amMatch[2]}`;
  }
  return time;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  ghost: { position: 'absolute', right: -24, fontSize: 190, opacity: 0.16 },

  // En-tête
  hero: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, justifyContent: 'flex-end', gap: spacing.md },
  heroIcon: {
    width: 88, height: 88, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.35)', borderWidth: 1,
  },
  heroText: { gap: 6 },
  heroTitle: {
    color: '#fff', fontSize: 36, fontWeight: '900', letterSpacing: -0.9,
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 2 },
  },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  heroSub: { ...typography.body, color: 'rgba(255,255,255,0.88)', flexShrink: 1 },
  countPill: {
    backgroundColor: 'rgba(0,0,0,0.30)', borderColor: 'rgba(255,255,255,0.25)', borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10,
  },
  countText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  // Barre du haut
  bar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: spacing.sm,
  },
  barBg: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.15)' },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.32)', borderColor: 'rgba(255,255,255,0.25)', borderWidth: StyleSheet.hairlineWidth,
  },
  backBtnSolid: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  backText: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: -2 },
  barTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  barTitle: { color: '#fff', fontSize: 17, fontWeight: '800', flexShrink: 1 },

  // Liste
  cardWrap: { paddingHorizontal: spacing.lg },

  // États
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  stateBlock: { paddingHorizontal: spacing.lg, gap: spacing.md },
  stateCentered: { alignItems: 'center', paddingTop: spacing.xl },
  searchingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'center' },
  stateEmoji: { fontSize: 52 },
  stateText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  stateTextSmall: { ...typography.caption, color: colors.textSecondary },
  emptyIcon: {
    width: 96, height: 96, borderRadius: 30, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1,
  },
  retryBtn: { borderRadius: radius.pill, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  retryText: { ...typography.caption, color: '#fff', fontWeight: '800' },
  skeleton: {
    height: PLACE_CARD_HEIGHT, borderRadius: radius.lg, backgroundColor: colors.surfaceElevated,
    borderWidth: 1, borderColor: colors.border,
  },
});

