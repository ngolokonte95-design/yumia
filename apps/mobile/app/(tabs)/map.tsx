import React, { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
  TextInput,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import MapView, { Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE, type Region, type MapPressEvent } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { UNIVERSES, UNIVERSE_META, type Universe } from '@yumia/shared';
import { safeMeta, placeEmoji } from '../../lib/universeMeta';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { useLocation } from '../../lib/useLocation';
import { useNearby } from '../../lib/useNearby';
import { placeStore } from '../../lib/place-store';
import { fetchByCity, fetchNearby } from '../../lib/places-api';
import type { NearbyPlace } from '../../lib/places-api';
import { usePlanLimits } from '../../lib/usePlanLimits';
import { useSearchRadius, RADIUS_PRESETS_KM } from '../../lib/useSearchRadius';
import { PremiumUpsellModal } from '../../components/PremiumUpsellModal';
import { CannabisIcon } from '../../components/icons/CannabisIcon';

const MAP_DELTA = 0.025;
const MAX_MARKERS = 45;
const MAX_DISPLAY_PLACES = 80;
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DRAWER_COLLAPSED = 56;
const DRAWER_EXPANDED = Math.round(SCREEN_HEIGHT * 0.62);
const DRAWER_MAX_TRANSLATE = DRAWER_EXPANDED - DRAWER_COLLAPSED;

/** Univers du panneau de filtre, triés alphabétiquement (« Tous » reste à part, en tête). */
const SORTED_UNIVERSES = [...UNIVERSES].sort(
  (a, b) => UNIVERSE_META[a].labelFr.localeCompare(UNIVERSE_META[b].labelFr, 'fr'),
);

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const router = useRouter();
  const { coords, resolving } = useLocation();
  const [universe, setUniverse] = useState<Universe | null>(null);
  const { radiusKm, setRadiusKm } = useSearchRadius();
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [radiusPanelOpen, setRadiusPanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<NearbyPlace[] | null>(null);
  const [cityLoading, setCityLoading] = useState(false);
  const [citiesSearchedCount, setCitiesSearchedCount] = useState(0);
  const [tapResults, setTapResults] = useState<NearbyPlace[] | null>(null);
  const [tapLoading, setTapLoading] = useState(false);
  const [tapPoint, setTapPoint] = useState<{ x: number; y: number } | null>(null);
  const [tapCoord, setTapCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [upsell, setUpsell] = useState<string | null>(null);
  const { checkLimit, recordUsage } = usePlanLimits();

  // Bottom sheet state — animé via translateY (transform) plutôt que height, pour
  // pouvoir tourner sur le driver natif (60fps hors JS thread) et rester fluide
  // pendant le drag, au lieu de forcer un re-layout Yoga de la carte à chaque frame.
  const drawerExpanded = useRef(false);
  const [expanded, setExpanded] = useState(false);
  // 0 = tiroir ouvert (DRAWER_EXPANDED visible), DRAWER_MAX_TRANSLATE = replié (DRAWER_COLLAPSED visible).
  const drawerAnim = useRef(new Animated.Value(DRAWER_MAX_TRANSLATE)).current;
  const boundedTranslateY = drawerAnim.interpolate({
    inputRange: [0, DRAWER_MAX_TRANSLATE],
    outputRange: [0, DRAWER_MAX_TRANSLATE],
    extrapolate: 'clamp',
  });

  const animateDrawer = useCallback((shouldExpand: boolean) => {
    drawerExpanded.current = shouldExpand;
    setExpanded(shouldExpand);
    Animated.spring(drawerAnim, {
      toValue: shouldExpand ? 0 : DRAWER_MAX_TRANSLATE,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [drawerAnim]);

  const toggleDrawer = useCallback((forceExpand?: boolean) => {
    animateDrawer(forceExpand !== undefined ? forceExpand : !drawerExpanded.current);
  }, [animateDrawer]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dy }) => Math.abs(dy) > 8,
      onPanResponderGrant: () => {
        drawerAnim.stopAnimation((value: number) => {
          drawerAnim.setOffset(value);
          drawerAnim.setValue(0);
        });
      },
      // useNativeDriver: false ici — PanResponder appelle ce handler comme une
      // fonction JS classique à chaque frame, il ne peut pas recevoir l'AnimatedEvent
      // "natif" (qui n'est plus un objet appelable). Seul le spring d'ouverture/
      // fermeture ci-dessus tourne réellement sur le driver natif.
      onPanResponderMove: Animated.event([null, { dy: drawerAnim }], { useNativeDriver: false }),
      onPanResponderRelease: (_, { dy, vy }) => {
        drawerAnim.flattenOffset();
        const isExpanded = drawerExpanded.current;
        const shouldExpand = isExpanded
          ? !(dy > 60 || vy > 0.8)
          : dy < -60 || vy < -0.8;
        animateDrawer(shouldExpand);
      },
      onPanResponderTerminate: () => drawerAnim.flattenOffset(),
    })
  ).current;

  // Fondu du contenu (liste) synchronisé au glissement du tiroir — évite qu'un
  // fragment de ligne dépasse visuellement sous le titre quand le tiroir est replié.
  const listOpacity = drawerAnim.interpolate({
    inputRange: [0, DRAWER_MAX_TRANSLATE - 40, DRAWER_MAX_TRANSLATE],
    outputRange: [1, 1, 0],
    extrapolate: 'clamp',
  });

  const { places, loading, error } = useNearby({
    lat: coords.lat,
    lng: coords.lng,
    radius: radiusKm * 1000,
    universe: universe ?? undefined,
    enabled: !resolving,
  });

  const region: Region = useMemo(
    () => ({
      latitude: coords.lat,
      longitude: coords.lng,
      latitudeDelta: MAP_DELTA,
      longitudeDelta: MAP_DELTA,
    }),
    [coords.lat, coords.lng],
  );

  // Région courante suivie en continu : permet de recentrer au tap SANS
  // changer le niveau de zoom (évite le « zoom tout seul »).
  const regionRef = useRef<Region>(region);

  // Lieux chargés automatiquement pour le viewport (quand l'utilisateur zoome dehors).
  const [viewportPlaces, setViewportPlaces] = useState<NearbyPlace[]>([]);
  const viewportFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastViewportKey = useRef('');
  useEffect(() => () => { if (viewportFetchTimer.current) clearTimeout(viewportFetchTimer.current); }, []);

  const onRegionChangeComplete = useCallback((r: Region) => {
    regionRef.current = r;
    // Rayon ≈ demi-diagonale visible (°→m), plafonné par le rayon choisi par l'utilisateur.
    const visibleRadiusM = Math.round((Math.max(r.latitudeDelta, r.longitudeDelta) * 111_000) / 2);
    const radiusM = Math.min(visibleRadiusM, radiusKm * 1000, 50_000);
    if (radiusM < 1_000) return; // très zoomé (ou rayon choisi très petit) → useNearby suffit
    const key = `${r.latitude.toFixed(2)}:${r.longitude.toFixed(2)}:${Math.round(radiusM / 1_000)}:${universe ?? 'all'}`;
    if (key === lastViewportKey.current) return;
    if (viewportFetchTimer.current) clearTimeout(viewportFetchTimer.current);
    viewportFetchTimer.current = setTimeout(async () => {
      try {
        const results = await fetchNearby({ lat: r.latitude, lng: r.longitude, radius: radiusM, universe: universe ?? undefined, limit: 80 });
        // On FUSIONNE avec ce qui était déjà chargé plutôt que de remplacer : sinon un
        // lieu absent d'un fetch (limite/rayon légèrement différents d'un appel à
        // l'autre) disparaissait puis réapparaissait sans arrêt en se déplaçant.
        setViewportPlaces((prev) => {
          const merged = new Map(prev.map((p) => [p.id, p] as const));
          for (const p of results) merged.set(p.id, p);
          // Élagage géographique : sans ça, chaque déplacement empilait les lieux
          // des zones précédentes (jusqu'à 300 en mémoire), qui restaient affichés
          // à l'autre bout de la carte. Fait ici, dans le callback déjà différé de
          // 800ms (pas à chaque frame de geste) : contrairement à une tentative
          // précédente qui recalculait tout à chaque fin de geste via un nouveau
          // state, ça ne change pas le rythme des re-renders de la carte.
          const kept = Array.from(merged.values()).filter(
            (p) =>
              Math.abs(p.lat - r.latitude) <= r.latitudeDelta * 0.75 &&
              Math.abs(p.lng - r.longitude) <= r.longitudeDelta * 0.75,
          );
          return kept.length > 300 ? kept.slice(kept.length - 300) : kept;
        });
        lastViewportKey.current = key;
      } catch { /* silent */ }
    }, 800);
  }, [universe, radiusKm]);

  const handleCitySearch = useCallback(async () => {
    const q = cityQuery.trim();
    if (!q) return;
    const { allowed, message } = await checkLimit('travelCities', citiesSearchedCount);
    if (!allowed) { setUpsell(message); return; }
    setCityLoading(true);
    try {
      const results = await fetchByCity(q, universe ?? undefined, 20);
      setCityResults(results.map((p) => ({ ...p, distanceMeters: 0 })));
      setCitiesSearchedCount((n) => n + 1);
      await recordUsage('travelCities');
      if (results[0]) {
        mapRef.current?.animateToRegion(
          { latitude: results[0].lat, longitude: results[0].lng, latitudeDelta: 0.08, longitudeDelta: 0.08 },
          500,
        );
      }
    } catch {
      // silent
    } finally {
      setCityLoading(false);
    }
  }, [cityQuery, citiesSearchedCount, universe, checkLimit, recordUsage]);

  function clearCitySearch() {
    setCityQuery('');
    setCityResults(null);
    setTapResults(null);
    setTapCoord(null);
  }

  // Recharge la liste actuellement affichée (point tapé, ville, ou zone visible par
  // défaut) sur la zone ACTUELLEMENT visible (regionRef suit la carte en continu via
  // onRegionChangeComplete) — pas sur l'ancien point tapé/la position GPS d'origine,
  // sinon un changement d'univers ou de rayon ramène les résultats au mauvais endroit.
  // Partagé par `selectUniverse` et `selectRadius`, qui ne changent chacun qu'un seul
  // des deux paramètres.
  const reload = useCallback((nextUniverse: Universe | null, nextRadiusKm: number) => {
    lastViewportKey.current = '';
    const region = regionRef.current;
    const nextRadiusM = nextRadiusKm * 1000;

    if (tapResults !== null) {
      setTapPoint(null); // plus de position d'écran précise : le spinner se recentre
      setTapCoord({ lat: region.latitude, lng: region.longitude });
      setTapLoading(true);
      fetchNearby({ lat: region.latitude, lng: region.longitude, radius: nextRadiusM, universe: nextUniverse ?? undefined, limit: 80 })
        .then(setTapResults)
        .catch(() => { /* silent */ })
        .finally(() => setTapLoading(false));
    } else if (cityResults !== null && cityQuery.trim()) {
      setCityLoading(true);
      fetchByCity(cityQuery.trim(), nextUniverse ?? undefined, 20)
        .then((results) => setCityResults(results.map((p) => ({ ...p, distanceMeters: 0 }))))
        .catch(() => { /* silent */ })
        .finally(() => setCityLoading(false));
    } else {
      // Mode par défaut (GPS + viewport) : recharge tout de suite la zone visible à l'écran,
      // plafonnée par le rayon choisi.
      const visibleRadiusM = Math.round((Math.max(region.latitudeDelta, region.longitudeDelta) * 111_000) / 2);
      const radiusM = Math.min(visibleRadiusM, nextRadiusM, 50_000);
      setViewportPlaces([]);
      if (radiusM >= 1_000) {
        fetchNearby({ lat: region.latitude, lng: region.longitude, radius: radiusM, universe: nextUniverse ?? undefined, limit: 80 })
          .then((results) => {
            setViewportPlaces(results);
            lastViewportKey.current = `${region.latitude.toFixed(2)}:${region.longitude.toFixed(2)}:${Math.round(radiusM / 1_000)}:${nextUniverse ?? 'all'}`;
          })
          .catch(() => { /* silent */ });
      }
      // Le fetch GPS "autour de toi" (useNearby) se relance aussi tout seul (dépend de `universe`/`radiusKm`).
    }
  }, [tapResults, cityResults, cityQuery]);

  const selectUniverse = useCallback((u: Universe | null) => {
    setUniverse(u);
    setFilterPanelOpen(false);
    reload(u, radiusKm);
  }, [reload, radiusKm]);

  const selectRadius = useCallback((km: number) => {
    setRadiusKm(km);
    setRadiusPanelOpen(false);
    reload(universe, km);
  }, [reload, universe, setRadiusKm]);

  const handleMapTap = useCallback(async (e: MapPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setTapPoint(e.nativeEvent.position ?? null);
    setTapCoord({ lat: latitude, lng: longitude });
    setTapLoading(true);
    setCityResults(null);
    setCityQuery('');
    try {
      const results = await fetchNearby({ lat: latitude, lng: longitude, radius: radiusKm * 1000, universe: universe ?? undefined, limit: 80 });
      setTapResults(results);
      // Recentre sur le point tapé en conservant le zoom actuel (pas de re-zoom).
      const { latitudeDelta, longitudeDelta } = regionRef.current;
      mapRef.current?.animateToRegion(
        { latitude, longitude, latitudeDelta, longitudeDelta },
        250,
      );
    } catch {
      // silent
    } finally {
      setTapLoading(false);
    }
  }, [universe, radiusKm]);

  function selectPlace(place: NearbyPlace) {
    setSelectedId(place.id);
    mapRef.current?.animateToRegion(
      {
        latitude: place.lat,
        longitude: place.lng,
        latitudeDelta: MAP_DELTA / 3,
        longitudeDelta: MAP_DELTA / 3,
      },
      350,
    );
  }

  function openDetail(place: NearbyPlace) {
    setSelectedId(place.id);
    placeStore.set({
      place: {
        id: place.id,
        name: place.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        universe: place.universe as any,
        location: { lat: place.lat, lng: place.lng },
        city: place.city,
        countryCode: place.countryCode,
        rating: place.rating,
        priceTier: (Math.min(4, Math.max(1, place.priceTier))) as 1 | 2 | 3 | 4,
        photoUrls: place.photoUrls,
        tags: place.tags,
        openingHours: place.openingHours,
      },
      compatibility: 0,
      distanceMeters: place.distanceMeters,
      reason: `${safeMeta(place.universe).labelFr} à ${formatDistance(place.distanceMeters)}.`,
      engine: 'mood' as const,
    });
    router.push('/place');
  }

  const provider = Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;

  const displayPlaces = useMemo(() => {
    let list: NearbyPlace[];
    if (cityResults !== null) {
      list = cityResults;
    } else if (tapResults !== null) {
      list = tapResults;
    } else {
      // Fusion GPS nearby + viewport auto-fetch, dédupliqué par id.
      const seen = new Set<string>();
      list = [];
      for (const p of [...places, ...viewportPlaces]) {
        if (!seen.has(p.id)) { seen.add(p.id); list.push(p); }
      }
    }
    // Cap dur : GPS (80) + viewport (80) peuvent se cumuler jusqu'à 160 s'ils ne se
    // recouvrent pas (carte déplacée loin de la position GPS) — ça faisait planter
    // l'appli par moments. On garde toujours au plus MAX_DISPLAY_PLACES au final.
    return [...list]
      .sort((a, b) => (a.universe === 'restaurant' ? 0 : 1) - (b.universe === 'restaurant' ? 0 : 1))
      .slice(0, MAX_DISPLAY_PLACES);
  }, [cityResults, tapResults, places, viewportPlaces]);

  const markerPlaces = useMemo(() => displayPlaces.slice(0, MAX_MARKERS), [displayPlaces]);

  // tracksViewChanges est coûteux (re-rasterise le marker à chaque frame). On ne
  // l'active que brièvement, par marker, juste le temps qu'il apparaisse — jamais
  // pour ceux déjà affichés. Avant, un seul booléen global se remettait à `true`
  // pour TOUT le lot dès qu'un id changeait quelque part dans la liste (même un
  // seul lieu ajouté/retiré ailleurs sur la carte) : rien ne se figeait jamais et
  // des marqueurs déjà stables se remettaient à clignoter en boucle en se déplaçant.
  const markerIds = useMemo(() => markerPlaces.map((p) => p.id).join(','), [markerPlaces]);
  const settledMarkerIds = useRef<Set<string>>(new Set());
  const [trackingIds, setTrackingIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const freshIds = markerIds ? markerIds.split(',').filter((id) => !settledMarkerIds.current.has(id)) : [];
    if (freshIds.length === 0) return;
    setTrackingIds((prev) => new Set([...prev, ...freshIds]));
    const t = setTimeout(() => {
      freshIds.forEach((id) => settledMarkerIds.current.add(id));
      setTrackingIds((prev) => {
        const next = new Set(prev);
        freshIds.forEach((id) => next.delete(id));
        return next;
      });
    }, 200);
    return () => clearTimeout(t);
  }, [markerIds]);

  const drawerTitle = cityResults !== null
    ? `${cityResults.length} lieu${cityResults.length > 1 ? 'x' : ''} à « ${cityQuery} »`
    : tapResults !== null
    ? `${tapResults.length} lieu${tapResults.length > 1 ? 'x' : ''} autour de ce point`
    : `${displayPlaces.length} lieu${displayPlaces.length > 1 ? 'x' : ''} autour de toi`;

  return (
    <View style={styles.screen}>
      <PremiumUpsellModal visible={upsell !== null} message={upsell ?? ''} onClose={() => setUpsell(null)} />

      {/* Ferme le panneau ouvert (univers ou rayon) en tapant à côté */}
      {filterPanelOpen || radiusPanelOpen ? (
        <Pressable
          style={styles.filterBackdrop}
          onPress={() => { setFilterPanelOpen(false); setRadiusPanelOpen(false); }}
        />
      ) : null}

      {/* Barre de recherche + filtre univers */}
      <View style={[styles.filtersContainer, { paddingTop: insets.top + spacing.xs }]}>
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              placeholder="Cherche une ville…"
              placeholderTextColor={colors.textMuted}
              value={cityQuery}
              onChangeText={setCityQuery}
              returnKeyType="search"
              onSubmitEditing={handleCitySearch}
              autoCorrect={false}
            />
            {cityLoading ? (
              <ActivityIndicator size="small" color={colors.brand} style={{ marginRight: spacing.sm }} />
            ) : cityResults !== null ? (
              <Pressable onPress={clearCitySearch} hitSlop={8} style={{ paddingRight: spacing.sm }}>
                <Text style={styles.clearBtn}>✕</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable style={styles.searchGo} onPress={handleCitySearch}>
            <Text style={styles.searchGoText}>→</Text>
          </Pressable>
        </View>

        {/* Univers + rayon de recherche, côte à côte */}
        <View style={styles.filterRow}>
          <Pressable
            style={styles.filterButton}
            onPress={() => { setFilterPanelOpen((o) => !o); setRadiusPanelOpen(false); }}
          >
            {universe === 'cannabis' ? (
              <>
                <CannabisIcon size={16} />
                <Text style={[styles.filterButtonText, { marginLeft: 6 }]} numberOfLines={1}>Coffee shops</Text>
              </>
            ) : (
              <Text style={styles.filterButtonText} numberOfLines={1}>
                {universe === null ? '🗂️  Tous les univers' : `${UNIVERSE_META[universe].emoji}  ${UNIVERSE_META[universe].labelFr}`}
              </Text>
            )}
            <Text style={styles.filterButtonChevron}>{filterPanelOpen ? '▲' : '▾'}</Text>
          </Pressable>

          <Pressable
            style={styles.radiusButton}
            onPress={() => { setRadiusPanelOpen((o) => !o); setFilterPanelOpen(false); }}
          >
            <Text style={styles.radiusButtonText} numberOfLines={1}>{radiusKm} km</Text>
            <Text style={styles.filterButtonChevron}>{radiusPanelOpen ? '▲' : '▾'}</Text>
          </Pressable>
        </View>

        {/* Panneau grille — tous les univers, compact et scrollable */}
        {filterPanelOpen ? (
          <View style={styles.filterPanel}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.filterGrid}
              keyboardShouldPersistTaps="handled"
            >
              <FilterTile label="Tous" emoji="🗂️" active={universe === null} onPress={() => selectUniverse(null)} />
              {SORTED_UNIVERSES.map((u) => (
                <FilterTile
                  key={u}
                  label={UNIVERSE_META[u].labelFr}
                  emoji={UNIVERSE_META[u].emoji}
                  icon={u === 'cannabis' ? <CannabisIcon size={14} /> : undefined}
                  active={universe === u}
                  onPress={() => selectUniverse(u)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Panneau — choix du rayon de recherche autour du point/de toi */}
        {radiusPanelOpen ? (
          <View style={styles.filterPanel}>
            <View style={styles.radiusChipRow}>
              {RADIUS_PRESETS_KM.map((km) => (
                <Pressable
                  key={km}
                  style={[styles.radiusChip, radiusKm === km && styles.radiusChipActive]}
                  onPress={() => selectRadius(km)}
                >
                  <Text style={[styles.radiusChipText, radiusKm === km && styles.radiusChipTextActive]}>
                    {km} km
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </View>

      {/* Carte */}
      {resolving ? (
        <View style={styles.mapPlaceholder}>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={styles.locatingText}>Localisation en cours…</Text>
        </View>
      ) : (
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={provider}
          initialRegion={region}
          showsUserLocation
          showsMyLocationButton={false}
          mapType="standard"
          // Android uniquement : sans ça, les icônes de commerces de Google
          // Maps sont cliquables et interceptent le tap (onPoiClick au lieu
          // de onPress) — le petit spinner de chargement ne se déclenchait
          // jamais en tapant dessus. On les masque juste (pas de couleurs
          // custom, contrairement à l'ancien style sombre retiré plus haut).
          {...(Platform.OS === 'android' ? { customMapStyle: ANDROID_HIDE_POI_STYLE } : {})}
          onPress={handleMapTap}
          onRegionChangeComplete={onRegionChangeComplete}
        >
          {markerPlaces.map((place) => (
            <Marker
              key={place.id}
              coordinate={{ latitude: place.lat, longitude: place.lng }}
              title={place.name}
              description={`${safeMeta(place.universe).labelFr || place.universe} · ⭐ ${place.rating.toFixed(1)}`}
              tracksViewChanges={trackingIds.has(place.id)}
              onPress={() => openDetail(place)}
              // Android uniquement : notre bulle est ronde (pas une épingle
              // pointue), donc son ancre doit être son centre — pas le
              // bas-centre par défaut de react-native-maps. Sans ça, la bulle
              // s'affiche décalée de son vrai point GPS et un tap "à côté"
              // du lieu déclenche quand même sa sélection.
              {...(Platform.OS === 'android' ? { anchor: { x: 0.5, y: 0.5 } } : {})}
            >
              <View style={[styles.markerBubble, place.id === selectedId && styles.markerSelected]}>
                {place.universe === 'cannabis' ? (
                  <CannabisIcon size={22} />
                ) : (
                  <Text style={styles.markerEmoji}>{placeEmoji(place.universe, place.tags)}</Text>
                )}
              </View>
            </Marker>
          ))}
        </MapView>
      )}

      {loading && !tapLoading && !resolving ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : null}

      {tapLoading && !resolving ? (
        <View
          style={[
            styles.loadingOverlayAtPoint,
            tapPoint
              ? { left: tapPoint.x - 12, top: tapPoint.y - 12 }
              : { top: '50%', left: '50%', marginLeft: -12, marginTop: -12 },
          ]}
        >
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : null}

      {/* Bottom sheet swipeable — hauteur fixe, on l'anime en transform pour rester fluide (driver natif) */}
      <Animated.View
        style={[
          styles.drawer,
          { height: DRAWER_EXPANDED, transform: [{ translateY: boundedTranslateY }] },
        ]}
      >
        {/* Handle + titre — zone de glissement (tap OU swipe haut/bas) */}
        <View style={styles.drawerHeader} {...panResponder.panHandlers}>
          <Pressable style={styles.drawerHeaderInner} onPress={() => toggleDrawer()}>
            <View style={styles.drawerHandle} />
            <View style={styles.drawerTitleRow}>
              <Text style={styles.drawerTitle}>{drawerTitle}</Text>
              <Text style={styles.drawerChevron}>{expanded ? '▼' : '▲'}</Text>
            </View>
          </Pressable>
        </View>

        <Animated.View style={{ flex: 1, opacity: listOpacity }} pointerEvents={expanded ? 'auto' : 'none'}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <FlatList
            style={styles.list}
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing.md }}
            data={displayPlaces}
            keyExtractor={(place) => place.id}
            showsVerticalScrollIndicator={false}
            initialNumToRender={12}
            maxToRenderPerBatch={12}
            windowSize={7}
            removeClippedSubviews
            renderItem={({ item }) => (
              <PlaceRow
                place={item}
                selected={item.id === selectedId}
                onPress={() => selectPlace(item)}
                onDetail={() => openDetail(item)}
                hideDist={cityResults !== null}
              />
            )}
            ListEmptyComponent={
              loading ? null : (
                <Text style={styles.empty}>
                  {cityResults !== null
                    ? `Aucun lieu trouvé pour « ${cityQuery} ». Essaie une autre ville.`
                    : tapResults !== null
                      ? 'Aucun lieu trouvé autour de ce point.'
                      : 'Aucun lieu dans ce rayon. Élargis ou change de filtre.'}
                </Text>
              )
            }
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function FilterTile({
  label,
  emoji,
  icon,
  active,
  onPress,
}: {
  label: string;
  emoji: string;
  icon?: React.ReactNode;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.filterTile, active && styles.filterTileActive]} onPress={onPress}>
      {icon
        ? <View style={{ width: 15, height: 15, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
        : <Text style={styles.filterTileEmoji}>{emoji}</Text>
      }
      <Text style={[styles.filterTileText, active && styles.filterTileTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function PlaceRow({
  place,
  selected,
  onPress,
  onDetail,
  hideDist = false,
}: {
  place: NearbyPlace;
  selected: boolean;
  onPress: () => void;
  onDetail: () => void;
  hideDist?: boolean;
}) {
  const meta = safeMeta(place.universe);
  const closingTime = getClosingTime(place.openingHours);
  return (
    <Pressable style={[styles.row, selected && styles.rowSelected]} onPress={onPress}>
      {place.photoUrls && place.photoUrls.length > 0 ? (
        <Image
          source={{ uri: place.photoUrls[0] }}
          style={styles.rowPhoto}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={place.photoUrls[0]}
          transition={100}
        />
      ) : (
        <View style={styles.rowEmojiBg}>
          {place.universe === 'cannabis' ? (
            <CannabisIcon size={28} />
          ) : (
            <Text style={styles.rowEmoji}>{placeEmoji(place.universe, place.tags)}</Text>
          )}
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>{place.name}</Text>
        <Text style={styles.rowMeta}>
          {meta.labelFr} · ⭐ {place.rating.toFixed(1)}
          {!hideDist && place.distanceMeters > 0 ? ` · ${formatDistance(place.distanceMeters)}` : ''}
        </Text>
        {closingTime ? (
          <Text style={styles.rowHours}>🕐 Ferme à {closingTime}</Text>
        ) : null}
      </View>
      <Pressable style={styles.detailBtn} onPress={onDetail} hitSlop={8}>
        <Text style={styles.detailArrow}>›</Text>
      </Pressable>
    </Pressable>
  );
}

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/** Extrait l'heure de fermeture depuis les horaires du jour (ex. "10:30 – 22:30" → "22:30"). */
function getClosingTime(hours?: string[]): string | null {
  if (!hours || hours.length === 0) return null;
  const todayIdx = (new Date().getDay() + 6) % 7;
  const entry = hours[todayIdx];
  if (!entry) return null;
  // Retire le préfixe "Lundi: " si présent
  const colonIdx = entry.indexOf(': ');
  const timeRange = colonIdx >= 0 ? entry.slice(colonIdx + 2) : entry;
  if (timeRange.toLowerCase().includes('fermé') || timeRange.toLowerCase().includes('closed')) return null;
  // Extrait la partie après le tiret " – " ou " - "
  const parts = timeRange.split(/\s[–\-]\s/);
  if (parts.length < 2) return null;
  const closing = parts[parts.length - 1].trim();
  // Convertit "10:30 PM" → "22:30" si format 12h
  return to24h(closing);
}

function to24h(time: string): string {
  const pmMatch = time.match(/^(\d{1,2}):(\d{2})\s*PM$/i);
  if (pmMatch) {
    const h = parseInt(pmMatch[1], 10);
    return `${h === 12 ? 12 : h + 12}:${pmMatch[2]}`;
  }
  const amMatch = time.match(/^(\d{1,2}):(\d{2})\s*AM$/i);
  if (amMatch) {
    const h = parseInt(amMatch[1], 10);
    return `${h === 12 ? '00' : String(h).padStart(2, '0')}:${amMatch[2]}`;
  }
  return time;
}

const ANDROID_HIDE_POI_STYLE = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  filtersContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: 'transparent',
  },
  searchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.surface}F0`,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingLeft: spacing.md,
    height: 40,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    height: 40,
  },
  clearBtn: { ...typography.body, color: colors.textMuted, fontSize: 14 },
  searchGo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchGoText: { color: '#fff', fontSize: 18, fontWeight: '700' },

  // Univers + rayon, côte à côte + panneaux de filtres
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  filterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: `${colors.surface}F5`,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
    height: 40,
  },
  filterButtonText: { ...typography.body, color: colors.textPrimary, flex: 1, fontWeight: '600' },
  filterButtonChevron: { ...typography.caption, color: colors.textMuted, fontSize: 12 },
  radiusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${colors.surface}F5`,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
    height: 40,
  },
  radiusButtonText: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  radiusChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.md,
  },
  radiusChip: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  radiusChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  radiusChipText: { ...typography.caption, color: colors.textPrimary, fontWeight: '600' },
  radiusChipTextActive: { color: '#fff' },
  filterBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  filterPanel: {
    marginHorizontal: spacing.md,
    maxHeight: Math.round(SCREEN_HEIGHT * 0.5),
    backgroundColor: `${colors.surface}FA`,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.md,
  },
  filterTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  filterTileActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterTileEmoji: { fontSize: 15 },
  filterTileText: { ...typography.caption, color: colors.textPrimary },
  filterTileTextActive: { color: '#fff', fontWeight: '600' },
  map: { flex: 1 },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  locatingText: { ...typography.body, color: colors.textSecondary },
  loadingOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -12,
    marginTop: -12,
  },
  loadingOverlayAtPoint: {
    position: 'absolute',
  },
  markerBubble: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerSelected: {
    borderColor: colors.brand,
    borderWidth: 2.5,
    backgroundColor: colors.bg,
    transform: [{ scale: 1.2 }],
  },
  markerEmoji: { fontSize: 20 },

  // Bottom sheet — hauteur fixe, positionné en absolu et animé en transform (voir plus haut)
  drawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  drawerHeader: {
    minHeight: DRAWER_COLLAPSED,
    justifyContent: 'center',
  },
  drawerHeaderInner: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  drawerHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.xs,
  },
  drawerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drawerTitle: { ...typography.heading, color: colors.textPrimary },
  drawerChevron: { ...typography.caption, color: colors.textMuted },
  error: { ...typography.caption, color: colors.danger, marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.lg },
  list: { flex: 1, paddingHorizontal: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  rowSelected: { backgroundColor: `${colors.brand}14`, borderRadius: radius.md, paddingHorizontal: spacing.sm },
  rowPhoto: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    flexShrink: 0,
  },
  rowEmojiBg: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowEmoji: { fontSize: 24 },
  rowName: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  rowMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  rowHours: { ...typography.label, color: colors.brand, marginTop: 2, fontSize: 11 },
  detailBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  detailArrow: { ...typography.title, color: colors.brandSoft, lineHeight: 24 },
});
