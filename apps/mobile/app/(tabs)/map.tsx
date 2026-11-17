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
  Keyboard,
  PixelRatio,
  BackHandler,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, {
  Easing, FadeInDown, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import { universeColor, universeGradient } from '../../lib/universeTheme';
import { UniverseGlyph } from '../../components/UniverseGlyph';
import { PressableScale } from '../../components/ui';
import { haptics } from '../../lib/useHaptics';
import MapView, { Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE, type Region, type MapPressEvent } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { UNIVERSES, UNIVERSE_META, type Universe } from '@yumia/shared';
import { safeMeta, placeEmoji, universeLabel } from '../../lib/universeMeta';
import { colors, elevation, radius, spacing, typography } from '../../theme/tokens';
import { useI18n } from '../../lib/useI18n';
import { useLocation } from '../../lib/useLocation';
import { useNearby } from '../../lib/useNearby';
import { placeStore } from '../../lib/place-store';
import { fetchByCity, fetchNearby } from '../../lib/places-api';
import type { NearbyPlace } from '../../lib/places-api';
import { usePlanLimits } from '../../lib/usePlanLimits';
import { useSearchRadius, RADIUS_PRESETS_KM } from '../../lib/useSearchRadius';
import { useCitySearch } from '../../lib/useCitySearch';
import type { CitySuggestion } from '../../lib/services/weather';
import { PremiumUpsellModal } from '../../components/PremiumUpsellModal';
import { universeIcon } from '../../components/icons/universeIcons';
import { ratingLabel, ratingSuffix } from '../../lib/place-rating';
import { FeatureTip } from '../../components/FeatureTip';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Mémorise que l'utilisateur a déjà touché la carte : l'indication disparaît alors. */
const MAP_TAP_HINT_KEY = 'yumia.map_tap_hint_seen';

const MAP_DELTA = 0.025;
// Android uniquement : react-native-maps doit convertir chaque marqueur
// personnalisé (bulle + emoji) en bitmap natif avant de l'afficher — une
// conversion coûteuse, faite marqueur par marqueur, alors qu'iOS dessine ses
// annotations nativement sans cette étape. Avec beaucoup de marqueurs
// simultanés, cette conversion séquentielle devient visible (les lieux
// apparaissent "petit à petit" au lieu de tous d'un coup). Moins de
// marqueurs = moins de travail de conversion = apparition plus rapide.
const MAX_MARKERS = Platform.OS === 'android' ? 25 : 45;
const MAX_DISPLAY_PLACES = 50;
const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_COLLAPSED = 56;
const DRAWER_EXPANDED = Math.round(SCREEN_HEIGHT * 0.62);
const DRAWER_MAX_TRANSLATE = DRAWER_EXPANDED - DRAWER_COLLAPSED;

// Carrousel de cartes photo au-dessus du tiroir replié, synchronisé avec les
// repères : glisser une carte centre la carte sur le lieu, toucher un repère
// amène sa carte.
const CARD_W = Math.min(SCREEN_WIDTH - 72, 300);
const CARD_H = 150;
const CARD_GAP = 12;
const CARD_STEP = CARD_W + CARD_GAP;
/** Hauteur réservée en bas de la carte (tiroir replié + carrousel). */
const BOTTOM_SPACE = DRAWER_COLLAPSED + CARD_H + spacing.sm * 2;


/** Univers du panneau de filtre, triés alphabétiquement (« Tous » reste à part, en tête). */
const SORTED_UNIVERSES = [...UNIVERSES].sort(
  (a, b) => UNIVERSE_META[a].labelFr.localeCompare(UNIVERSE_META[b].labelFr, 'fr'),
);

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const router = useRouter();
  const { t } = useI18n();
  const { coords, resolving } = useLocation();
  const [universe, setUniverse] = useState<Universe | null>(null);
  const { radiusKm, setRadiusKm } = useSearchRadius();
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [radiusPanelOpen, setRadiusPanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<NearbyPlace[] | null>(null);
  const [cityLoading, setCityLoading] = useState(false);
  // Suggestions de villes pendant la frappe. Fermé dès qu'une recherche part,
  // sinon la liste resterait ouverte par-dessus les résultats.
  const [suggestOpen, setSuggestOpen] = useState(false);
  const { results: citySuggestions } = useCitySearch(suggestOpen ? cityQuery : '');
  const [tapResults, setTapResults] = useState<NearbyPlace[] | null>(null);
  const [tapLoading, setTapLoading] = useState(false);
  const [tapPoint, setTapPoint] = useState<{ x: number; y: number } | null>(null);
  const [tapCoord, setTapCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [upsell, setUpsell] = useState<string | null>(null);
  const { consumePlaceLoad, displayCap, planTier } = usePlanLimits();
  // Le remplissage automatique au déplacement suit le palier, pas un quota.
  const unlimitedMapRefill = planTier !== 'free';


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
      // Android : un geste système (retour par le bord, volet de
      // notifications) interrompt le glissement ; sans re-calage, le tiroir
      // restait à mi-hauteur, désynchronisé de `drawerExpanded`.
      onPanResponderTerminate: () => {
        drawerAnim.flattenOffset();
        animateDrawer(drawerExpanded.current);
      },
    })
  ).current;

  // Bouton retour Android : ferme ce qui est ouvert sur la carte (suggestions,
  // panneaux, tiroir) avant de laisser le système quitter l'onglet. Sans ça,
  // le retour sautait à l'accueil en laissant ces états ouverts.
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (suggestOpen) { setSuggestOpen(false); return true; }
      if (filterPanelOpen) { setFilterPanelOpen(false); return true; }
      if (radiusPanelOpen) { setRadiusPanelOpen(false); return true; }
      if (expanded) { toggleDrawer(false); return true; }
      return false;
    });
    return () => sub.remove();
  }, [suggestOpen, filterPanelOpen, radiusPanelOpen, expanded, toggleDrawer]));

  // Fondu du contenu (liste) synchronisé au glissement du tiroir — évite qu'un
  // fragment de ligne dépasse visuellement sous le titre quand le tiroir est replié.
  const listOpacity = drawerAnim.interpolate({
    inputRange: [0, DRAWER_MAX_TRANSLATE - 40, DRAWER_MAX_TRANSLATE],
    outputRange: [1, 1, 0],
    extrapolate: 'clamp',
  });

  // Chaque chargement de la carte (ouverture, univers, rayon, point tapé) se
  // décompte du compteur commun aux univers et à la carte (placeLoadsPerDay).
  const [mapQuotaOk, setMapQuotaOk] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      const { allowed, message } = await consumePlaceLoad();
      if (!active) return;
      if (!allowed) { setMapQuotaOk(false); setUpsell(message); return; }
      setMapQuotaOk(true);
    })();
    return () => { active = false; };
    // Une seule fois par ouverture d'écran : les changements d'univers
    // passent par selectUniverse, qui compte de son côté.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { places, loading, error } = useNearby({
    lat: coords.lat,
    lng: coords.lng,
    radius: radiusKm * 1000,
    universe: universe ?? undefined,
    enabled: !resolving && mapQuotaOk === true,
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

    // Le rechargement automatique au déplacement est un CONFORT payant.
    // Le laisser ouvert vidait le quota de son sens : trois chargements
    // comptés d'un côté, et de l'autre un remplissage silencieux à chaque
    // glissement de doigt. Le forfait Gratuit garde la zone qu'il a chargée.
    if (!unlimitedMapRefill) return;

    // Rayon ≈ demi-diagonale visible (°→m), plafonné par le rayon choisi par l'utilisateur.
    const visibleRadiusM = Math.round((Math.max(r.latitudeDelta, r.longitudeDelta) * 111_000) / 2);
    const radiusM = Math.min(visibleRadiusM, radiusKm * 1000, 50_000);
    if (radiusM < 1_000) return; // très zoomé (ou rayon choisi très petit) → useNearby suffit
    const key = `${r.latitude.toFixed(2)}:${r.longitude.toFixed(2)}:${Math.round(radiusM / 1_000)}:${universe ?? 'all'}`;
    if (key === lastViewportKey.current) return;
    if (viewportFetchTimer.current) clearTimeout(viewportFetchTimer.current);
    viewportFetchTimer.current = setTimeout(async () => {
      try {
        const results = await fetchNearby({ lat: r.latitude, lng: r.longitude, radius: radiusM, universe: universe ?? undefined, limit: 50 });
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
  }, [universe, radiusKm, unlimitedMapRefill]);

  const runCitySearch = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    setSuggestOpen(false);
    Keyboard.dismiss();
    // Plus de quota sur la recherche de villes : chercher une ville ne coûte
    // rien de plus qu'un chargement de carte, lequel est déjà compté.
    setCityLoading(true);
    try {
      const results = await fetchByCity(q, universe ?? undefined, 20);
      setCityResults(results.map((p) => ({ ...p, distanceMeters: 0 })));
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
  }, [universe]);

  // `onSubmitEditing` passe un événement en argument : on ne le laisse pas
  // arriver jusqu'à `runCitySearch`, qui attend une chaîne.
  const handleCitySearch = useCallback(() => {
    void runCitySearch(cityQuery);
  }, [runCitySearch, cityQuery]);

  /**
   * Ville choisie dans les suggestions. On recentre la carte sur ses
   * coordonnées AVANT d'interroger l'API : l'utilisateur a désigné un endroit
   * précis, la carte doit y aller même si aucun lieu n'y est référencé.
   */
  const pickCity = useCallback((c: CitySuggestion) => {
    setCityQuery(c.name);
    mapRef.current?.animateToRegion(
      { latitude: c.lat, longitude: c.lng, latitudeDelta: 0.08, longitudeDelta: 0.08 },
      500,
    );
    void runCitySearch(c.name);
  }, [runCitySearch]);

  function clearCitySearch() {
    setCityQuery('');
    setCityResults(null);
    setTapResults(null);
    setTapCoord(null);
    setSuggestOpen(false);
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
      fetchNearby({ lat: region.latitude, lng: region.longitude, radius: nextRadiusM, universe: nextUniverse ?? undefined, limit: 50 })
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
        fetchNearby({ lat: region.latitude, lng: region.longitude, radius: radiusM, universe: nextUniverse ?? undefined, limit: 50 })
          .then((results) => {
            setViewportPlaces(results);
            lastViewportKey.current = `${region.latitude.toFixed(2)}:${region.longitude.toFixed(2)}:${Math.round(radiusM / 1_000)}:${nextUniverse ?? 'all'}`;
          })
          .catch(() => { /* silent */ });
      }
      // Le fetch GPS "autour de toi" (useNearby) se relance aussi tout seul (dépend de `universe`/`radiusKm`).
    }
  }, [tapResults, cityResults, cityQuery]);

  const selectUniverse = useCallback(async (u: Universe | null) => {
    const { allowed, message } = await consumePlaceLoad();
    if (!allowed) { setUpsell(message); setFilterPanelOpen(false); return; }
    setUniverse(u);
    setFilterPanelOpen(false);
    reload(u, radiusKm);
  }, [reload, radiusKm, consumePlaceLoad]);

  const selectRadius = useCallback(async (km: number) => {
    // Changer de rayon relance une recherche : c'est un chargement de plus.
    const { allowed, message } = await consumePlaceLoad();
    if (!allowed) { setUpsell(message); setRadiusPanelOpen(false); return; }
    setRadiusKm(km);
    setRadiusPanelOpen(false);
    reload(universe, km);
  }, [reload, universe, setRadiusKm, consumePlaceLoad]);

  // Indication « Touche la carte… » : on ne devinait pas qu'un tap sur la
  // carte cherche les lieux de cet endroit. Affichée jusqu'au premier tap.
  const [showTapHint, setShowTapHint] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(MAP_TAP_HINT_KEY).then((v) => setShowTapHint(v !== '1')).catch(() => {});
  }, []);

  const handleMapTap = useCallback(async (e: MapPressEvent) => {
    // L'événement est lu AVANT toute attente : React recycle les événements
    // synthétiques dès que la main lui revient, et `e.nativeEvent` serait nul
    // au retour du premier `await`.
    // Un toucher sur un repère remonte aussi jusqu'à la carte (iOS) : ce n'est
    // pas une recherche à cet endroit, et il ne doit pas coûter un chargement.
    if (e.nativeEvent.action === 'marker-press') return;
    const { latitude, longitude } = e.nativeEvent.coordinate;

    // ANDROID : la position du tap arrive en PIXELS PHYSIQUES — le natif la
    // calcule avec `projection.toScreenLocation()`, qui rend des pixels écran
    // — alors que les styles React Native se placent en points indépendants
    // de la densité. Sur un écran à 2,75x, l'indicateur de chargement
    // atterrissait donc à presque trois fois la distance du doigt, souvent
    // par-dessus un marqueur existant : on croyait que l'app avait sélectionné
    // un autre lieu au lieu de charger là où on avait tapé. iOS renvoie déjà
    // des points, d'où un écran parfaitement précis de ce côté.
    const raw = e.nativeEvent.position;
    const density = Platform.OS === 'android' ? PixelRatio.get() : 1;
    const position = raw ? { x: raw.x / density, y: raw.y / density } : null;

    // Chercher les lieux d'un point tapé est une recherche entière, pas un
    // détail d'affichage : elle se compte comme les autres.
    const { allowed, message } = await consumePlaceLoad();
    if (!allowed) { setUpsell(message); return; }

    setTapPoint(position);
    setShowTapHint(false);
    AsyncStorage.setItem(MAP_TAP_HINT_KEY, '1').catch(() => {});
    setTapCoord({ lat: latitude, lng: longitude });
    setTapLoading(true);
    setCityResults(null);
    setCityQuery('');
    try {
      const results = await fetchNearby({ lat: latitude, lng: longitude, radius: radiusKm * 1000, universe: universe ?? undefined, limit: 50 });
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
  }, [universe, radiusKm, consumePlaceLoad]);

  /**
   * Met un lieu en avant SANS changer le zoom : utilisé par le carrousel (on
   * glisse d'une carte à l'autre) et par le toucher d'un repère. `selectPlace`,
   * lui, zoome — réservé à la liste du tiroir.
   */
  const focusPlace = useCallback((place: NearbyPlace) => {
    setSelectedId(place.id);
    const { latitudeDelta, longitudeDelta } = regionRef.current;
    mapRef.current?.animateToRegion(
      { latitude: place.lat, longitude: place.lng, latitudeDelta, longitudeDelta },
      300,
    );
  }, []);

  const recenter = useCallback(() => {
    haptics.select();
    mapRef.current?.animateToRegion(
      { latitude: coords.lat, longitude: coords.lng, latitudeDelta: MAP_DELTA, longitudeDelta: MAP_DELTA },
      400,
    );
  }, [coords.lat, coords.lng]);

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
      reason: `${universeLabel(t, place.universe)} ${t('map_reason_at_distance')} ${formatDistance(place.distanceMeters)}.`,
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
    const cap = Math.min(MAX_DISPLAY_PLACES, displayCap('mapPlaces'));

    // Sans filtre d'univers, on prend un lieu de chaque univers à tour de
    // rôle. L'ancien tri mettait les restaurants devant — anodin sur cent
    // lieux, désastreux sur cinq : « Tous » ne montrait que des restaurants.
    // Avec un filtre, l'ordre d'origine (le plus proche d'abord) est le bon.
    if (universe !== null) return list.slice(0, cap);

    const byUniverse = new Map<string, NearbyPlace[]>();
    for (const p of list) {
      const bucket = byUniverse.get(p.universe);
      if (bucket) bucket.push(p); else byUniverse.set(p.universe, [p]);
    }
    const buckets = [...byUniverse.values()];
    const mixed: NearbyPlace[] = [];
    for (let round = 0; mixed.length < Math.min(cap, list.length); round++) {
      let tookOne = false;
      for (const bucket of buckets) {
        if (round >= bucket.length) continue;
        mixed.push(bucket[round]);
        tookOne = true;
        if (mixed.length >= cap) break;
      }
      if (!tookOne) break; // tous les univers épuisés
    }
    return mixed;
  }, [cityResults, tapResults, places, viewportPlaces, displayCap, universe]);

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
      // Android : la bulle est rasterisée quand le suivi repasse à false ; avec
      // 25 marqueurs montés d'un coup sur un appareil modeste, 200 ms ne
      // suffisaient pas toujours et une bulle pouvait se figer sans son icône.
    }, Platform.OS === 'android' ? 600 : 200);
    return () => clearTimeout(t);
  }, [markerIds]);

  // ANDROID : un marqueur « posé » est un bitmap figé. Sa sélection change son
  // style (bordure, fond, taille) mais rien ne se voit tant qu'on ne redemande
  // pas sa capture — sur iOS les marqueurs sont de vraies vues, d'où un bug
  // qui ne se manifestait que côté Android. On réactive donc brièvement le
  // suivi sur le lieu choisi ET sur celui qui vient de perdre la sélection,
  // sans quoi l'ancien garderait sa bordure de sélection indéfiniment.
  const prevSelectedId = useRef<string | null>(null);
  useEffect(() => {
    const affected = [selectedId, prevSelectedId.current].filter((id): id is string => !!id);
    prevSelectedId.current = selectedId;
    if (affected.length === 0) return;
    setTrackingIds((prev) => new Set([...prev, ...affected]));
    const t = setTimeout(() => {
      setTrackingIds((prev) => {
        const next = new Set(prev);
        affected.forEach((id) => next.delete(id));
        return next;
      });
    }, 200);
    return () => clearTimeout(t);
  }, [selectedId]);

  // Toujours `displayPlaces.length` : les listes brutes comptent des lieux que
  // le plafond du forfait ne montre pas, et le compteur annonçait vingt lieux
  // là où la carte en portait cinq.
  const drawerTitle = cityResults !== null
    ? t('map_places_city').replace('{n}', String(displayPlaces.length)).replace('{city}', cityQuery)
    : tapResults !== null
    ? t('map_places_point').replace('{n}', String(displayPlaces.length))
    : t('map_places_you').replace('{n}', String(displayPlaces.length));

  const carouselVisible = !resolving && !expanded && displayPlaces.length > 0;

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

      {/* Voile sombre en haut de la carte : la recherche et les pastilles s'en
          détachent, et la carte claire garde du relief. */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(14,14,18,0.62)', 'rgba(14,14,18,0.28)', 'transparent']}
        style={[styles.topScrim, { height: insets.top + 150 }]}
      />

      {/* Barre de recherche + filtre univers */}
      <View style={[styles.filtersContainer, { paddingTop: insets.top + spacing.xs }]}>
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder={t('map_search_placeholder')}
              placeholderTextColor={colors.textMuted}
              value={cityQuery}
              onChangeText={(v) => { setCityQuery(v); setSuggestOpen(true); }}
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

        {/* Suggestions pendant la frappe. Volontairement fermées seulement par
            une action explicite (choix, validation, croix) : masquer au blur
            ferait disparaître la liste avant que le doigt n'atteigne la ligne. */}
        {suggestOpen && citySuggestions.length > 0 && (
          <View style={styles.suggestBox}>
            {citySuggestions.slice(0, 6).map((c) => (
              <Pressable
                key={c.id}
                style={styles.suggestRow}
                onPress={() => pickCity(c)}
              >
                <Text style={styles.suggestPin}>📍</Text>
                <Text style={styles.suggestName} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.suggestMeta} numberOfLines={1}>
                  {[c.admin1, c.country].filter(Boolean).join(', ')}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Univers (ouvre la grille, prend la couleur de l'univers choisi) et
            rayon. Pas de rangée d'univers en accès direct : elle doublait la
            grille (retirée le 17/11 à la demande de l'utilisateur). */}
        <View style={styles.chipRow}>
          <PressableScale
            style={[styles.chip, styles.chipWide, universe !== null && { backgroundColor: universeColor(universe), borderColor: 'rgba(255,255,255,0.5)' }]}
            onPress={() => { setFilterPanelOpen((o) => !o); setRadiusPanelOpen(false); }}
          >
            {universe !== null ? (
              <>
                <UniverseGlyph u={universe} size={16} />
                <Text style={styles.chipText} numberOfLines={1}>{universeLabel(t, universe)}</Text>
              </>
            ) : (
              <Text style={styles.chipText} numberOfLines={1}>🗂️  {t('map_all_universes')}</Text>
            )}
            <Text style={styles.chipChevron}>{filterPanelOpen ? '▲' : '▾'}</Text>
          </PressableScale>

          <PressableScale
            style={styles.chip}
            onPress={() => { setRadiusPanelOpen((o) => !o); setFilterPanelOpen(false); }}
          >
            <Text style={styles.chipText} numberOfLines={1}>📏  {radiusKm} km</Text>
            <Text style={styles.chipChevron}>{radiusPanelOpen ? '▲' : '▾'}</Text>
          </PressableScale>
        </View>

        {/* Panneau grille — tous les univers, compact et scrollable */}
        {filterPanelOpen ? (
          <View style={styles.filterPanel}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.filterGrid}
              keyboardShouldPersistTaps="handled"
            >
              <FilterTile label={t('map_all_filter')} emoji="🗂️" active={universe === null} onPress={() => void selectUniverse(null)} />
              {SORTED_UNIVERSES.map((u) => (
                <FilterTile
                  key={u}
                  label={universeLabel(t, u)}
                  emoji={UNIVERSE_META[u].emoji}
                  icon={universeIcon(u, 14) ?? undefined}
                  color={universeColor(u)}
                  active={universe === u}
                  onPress={() => void selectUniverse(u)}
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
                  onPress={() => void selectRadius(km)}
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
          <Text style={styles.locatingText}>{t('map_locating')}</Text>
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
          // Carte claire quelle que soit l'apparence : sans ça, la carte suit
          // le thème de l'app (forcé en sombre dans app.json) et Google Maps
          // comme Apple Plans passent en mode nuit.
          userInterfaceStyle="light"
          // Android uniquement : sans ça, les icônes de commerces de Google
          // Maps sont cliquables et interceptent le tap (onPoiClick au lieu
          // de onPress) — le petit spinner de chargement ne se déclenchait
          // jamais en tapant dessus. On les masque juste (pas de couleurs
          // custom, contrairement à l'ancien style sombre retiré plus haut).
          {...(Platform.OS === 'android' ? { customMapStyle: ANDROID_HIDE_POI_STYLE } : {})}
          // Android uniquement (défauts Google) : le tap sur un marqueur
          // ouvrait notre fiche ET laissait Google recentrer la caméra puis
          // afficher sa barre « Itinéraire / Ouvrir dans Maps », qui emmène
          // hors de YUMIA ; on retrouvait les deux au retour de la fiche.
          // mapPadding : le tiroir replié couvrait le logo Google, que les
          // conditions Google Maps Platform imposent de laisser visible.
          {...(Platform.OS === 'android' ? { toolbarEnabled: false, moveOnMarkerPress: false } : {})}
          // Marge basse fixe (tiroir replié + carrousel) sur les deux
          // plateformes : le logo Google / la mention Apple restent visibles
          // au-dessus des cartes, et le lieu mis en avant se centre dans la
          // partie visible. Fixe et non liée à l'état : la changer en cours de
          // route ferait sauter la caméra.
          mapPadding={{ top: 0, right: 0, bottom: BOTTOM_SPACE, left: 0 }}
          onPress={handleMapTap}
          onRegionChangeComplete={onRegionChangeComplete}
        >
          {markerPlaces.map((place) => (
            <Marker
              key={place.id}
              coordinate={{ latitude: place.lat, longitude: place.lng }}
              // Pas de titre : il ferait apparaître l'info-bulle d'Apple ou de
              // Google par-dessus le carrousel, qui joue déjà ce rôle.
              tracksViewChanges={trackingIds.has(place.id)}
              // Toucher un repère amène sa carte photo (le carrousel suit
              // `selectedId`) ; c'est la carte qui ouvre la fiche. Un second
              // toucher sur le repère déjà choisi ouvre la fiche directement.
              onPress={(e) => {
                e.stopPropagation();
                if (place.id === selectedId) openDetail(place); else { haptics.select(); focusPlace(place); }
              }}
              // Android uniquement : notre bulle est ronde (pas une épingle
              // pointue), donc son ancre doit être son centre — pas le
              // bas-centre par défaut de react-native-maps. Sans ça, la bulle
              // s'affiche décalée de son vrai point GPS et un tap "à côté"
              // du lieu déclenche quand même sa sélection.
              // zIndex : la bulle sélectionnée grossit mais pouvait rester
              // dessinée sous ses voisines.
              {...(Platform.OS === 'android' ? { anchor: { x: 0.5, y: 0.5 }, zIndex: place.id === selectedId ? 1 : 0 } : {})}
            >
              {/* Repère à la couleur de la catégorie du lieu. Même structure
                  qu'avant (une vue + une icône) : pas un pixel de plus à
                  rasteriser, la mémoire de la carte ne bouge pas. */}
              <View
                style={[
                  styles.markerBubble,
                  { backgroundColor: universeColor(place.universe) },
                  place.id === selectedId && styles.markerSelected,
                ]}
              >
                {universeIcon(place.universe, place.id === selectedId ? 26 : 20) ?? (
                  <Text style={place.id === selectedId ? styles.markerEmojiSelected : styles.markerEmoji}>
                    {placeEmoji(place.universe, place.tags)}
                  </Text>
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
          pointerEvents="none"
          style={[
            styles.loadingOverlayAtPoint,
            tapPoint
              ? { left: tapPoint.x - PULSE_SIZE / 2, top: tapPoint.y - PULSE_SIZE / 2 }
              : { top: '50%', left: '50%', marginLeft: -PULSE_SIZE / 2, marginTop: -PULSE_SIZE / 2 },
          ]}
        >
          <SearchPulse />
        </View>
      ) : null}

      {/* Recentrer sur ma position */}
      {!resolving ? (
        <PressableScale
          style={[styles.recenter, { bottom: (carouselVisible ? BOTTOM_SPACE : DRAWER_COLLAPSED) + spacing.sm }]}
          onPress={recenter}
          scaleTo={0.9}
        >
          <Text style={styles.recenterIcon}>◎</Text>
        </PressableScale>
      ) : null}

      {/* Carrousel de cartes photo, synchronisé avec les repères. Masqué
          quand le tiroir est ouvert (la liste prend le relais). */}
      {carouselVisible ? (
        <PlaceCarousel
          places={displayPlaces}
          selectedId={selectedId}
          hideDist={cityResults !== null}
          onSnap={focusPlace}
          onOpen={openDetail}
        />
      ) : null}

      {showTapHint && !loading && !tapLoading && !resolving ? (
        // pointerEvents none : la bulle ne doit pas intercepter le tap qu'elle suggère.
        <View pointerEvents="none" style={[styles.tapHint, carouselVisible && { bottom: BOTTOM_SPACE + spacing.sm }]}>
          <Text style={styles.tapHintText}>{t('map_tap_hint')}</Text>
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
                    ? `${t('map_no_results_city')} (${cityQuery})`
                    : tapResults !== null
                      ? t('map_no_results_point')
                      : t('map_no_results_default')}
                </Text>
              )
            }
          />
        </Animated.View>
      </Animated.View>
      <FeatureTip feature="map" />
    </View>
  );
}

function FilterTile({
  label,
  emoji,
  icon,
  color,
  active,
  onPress,
}: {
  label: string;
  emoji: string;
  icon?: React.ReactNode;
  /** Couleur de la catégorie de l'univers — remplit la tuile active. */
  color?: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.filterTile,
        // Un liseré à la couleur de la catégorie : la grille se lit par familles.
        color ? { borderColor: `${color}88` } : null,
        active && (color ? { backgroundColor: color, borderColor: color } : styles.filterTileActive),
      ]}
      onPress={onPress}
    >
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

// ── Onde de recherche ────────────────────────────────────────────────────────

const PULSE_SIZE = 76;

/** Deux anneaux qui s'élargissent depuis le point touché, le temps de la recherche. */
function SearchPulse() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.out(Easing.quad) }), -1);
    return () => cancelAnimation(p);
  }, [p]);
  const ringA = useAnimatedStyle(() => ({
    opacity: 1 - p.value,
    transform: [{ scale: 0.2 + p.value * 0.8 }],
  }));
  const ringB = useAnimatedStyle(() => {
    const q = (p.value + 0.5) % 1;
    return { opacity: 1 - q, transform: [{ scale: 0.2 + q * 0.8 }] };
  });
  return (
    <View style={styles.pulseBox}>
      <Reanimated.View style={[styles.pulseRing, ringA]} />
      <Reanimated.View style={[styles.pulseRing, ringB]} />
      <View style={styles.pulseDot} />
    </View>
  );
}

// ── Carrousel de cartes photo ────────────────────────────────────────────────

function PlaceCarousel({
  places, selectedId, hideDist, onSnap, onOpen,
}: {
  places: NearbyPlace[];
  selectedId: string | null;
  hideDist: boolean;
  /** Carte amenée au centre par un glissement : la carte doit suivre. */
  onSnap: (place: NearbyPlace) => void;
  onOpen: (place: NearbyPlace) => void;
}) {
  const listRef = useRef<FlatList<NearbyPlace>>(null);
  // Carte actuellement centrée. Mise à jour AVANT tout défilement programmé :
  // la fin de ce défilement repasse par `onMomentumScrollEnd`, qui ne doit pas
  // renvoyer un `onSnap` en écho.
  // Au montage (retour du tiroir ouvert), le carrousel s'ouvre directement
  // sur le lieu déjà choisi.
  const [initialIdx] = useState(() => Math.max(0, selectedId ? places.findIndex((p) => p.id === selectedId) : 0));
  const currentIdx = useRef(initialIdx);

  // Un repère touché amène sa carte. Si le lieu choisi n'est plus dans la
  // liste (autre zone, autre univers), retour à la première carte.
  useEffect(() => {
    const idx = selectedId ? places.findIndex((p) => p.id === selectedId) : -1;
    const target = idx >= 0 ? idx : 0;
    if (target === currentIdx.current) return;
    currentIdx.current = target;
    listRef.current?.scrollToOffset({ offset: target * CARD_STEP, animated: idx >= 0 });
  }, [selectedId, places]);

  return (
    <Reanimated.View entering={FadeInDown.duration(260)} style={styles.carousel} pointerEvents="box-none">
      <FlatList
        ref={listRef}
        horizontal
        data={places}
        keyExtractor={(p) => p.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_STEP}
        decelerationRate="fast"
        contentContainerStyle={styles.carouselContent}
        getItemLayout={(_, index) => ({ length: CARD_STEP, offset: CARD_STEP * index, index })}
        initialScrollIndex={initialIdx}
        // Trois cartes montées au plus : les photos des autres ne sont pas en mémoire.
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={3}
        removeClippedSubviews={Platform.OS === 'android'}
        onMomentumScrollEnd={(e) => {
          const idx = Math.max(0, Math.min(places.length - 1, Math.round(e.nativeEvent.contentOffset.x / CARD_STEP)));
          if (idx === currentIdx.current) return;
          currentIdx.current = idx;
          haptics.select();
          onSnap(places[idx]);
        }}
        renderItem={({ item }) => (
          <MapCard place={item} selected={item.id === selectedId} hideDist={hideDist} onOpen={onOpen} />
        )}
      />
    </Reanimated.View>
  );
}

const MapCard = React.memo(function MapCard({
  place, selected, hideDist, onOpen,
}: {
  place: NearbyPlace;
  selected: boolean;
  hideDist: boolean;
  onOpen: (place: NearbyPlace) => void;
}) {
  const { t } = useI18n();
  const grad = universeGradient(place.universe);
  const photo = place.photoUrls?.[0];
  const closingTime = getClosingTime(place.openingHours);
  const meta = [
    ratingLabel(place.rating),
    !hideDist && place.distanceMeters > 0 ? formatDistance(place.distanceMeters) : '',
    closingTime ? t('map_closes_at').replace('{time}', closingTime) : '',
  ].filter(Boolean).join(' · ');

  return (
    <PressableScale
      style={[styles.card, selected && { borderColor: grad[1] }]}
      onPress={() => onOpen(place)}
      scaleTo={0.97}
    >
      {photo ? (
        <Image
          source={{ uri: photo }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={photo}
          transition={120}
        />
      ) : (
        <>
          <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={styles.cardGhost}>
            <UniverseGlyph u={place.universe} size={88} />
          </View>
        </>
      )}
      <LinearGradient
        colors={['rgba(14,14,18,0)', 'rgba(14,14,18,0.35)', 'rgba(14,14,18,0.92)']}
        locations={[0.15, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.cardTop}>
        <View style={[styles.cardPill, { backgroundColor: grad[1] }]}>
          <UniverseGlyph u={place.universe} size={13} />
          <Text style={styles.cardPillText} numberOfLines={1}>{universeLabel(t, place.universe)}</Text>
        </View>
        <View style={styles.cardGo}>
          <Text style={styles.cardGoText}>›</Text>
        </View>
      </View>
      <View>
        <Text style={styles.cardName} numberOfLines={1}>{place.name}</Text>
        {meta ? <Text style={styles.cardMeta} numberOfLines={1}>{meta}</Text> : null}
      </View>
    </PressableScale>
  );
});

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
  const { t } = useI18n();
  const meta = safeMeta(place.universe);
  const closingTime = getClosingTime(place.openingHours);
  return (
    <Pressable
      style={[styles.row, selected && styles.rowSelected, selected && { backgroundColor: `${universeColor(place.universe)}26` }]}
      onPress={onPress}
    >
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
        <View style={[styles.rowEmojiBg, { backgroundColor: universeColor(place.universe) }]}>
          {universeIcon(place.universe, 28) ?? (
            <Text style={styles.rowEmoji}>{placeEmoji(place.universe, place.tags)}</Text>
          )}
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>{place.name}</Text>
        <View style={styles.rowMetaLine}>
          <View style={[styles.rowDot, { backgroundColor: universeColor(place.universe) }]} />
          <Text style={[styles.rowMeta, { flex: 1, marginTop: 0 }]} numberOfLines={1}>
            {universeLabel(t, place.universe)}{ratingSuffix(place.rating)}
            {!hideDist && place.distanceMeters > 0 ? ` · ${formatDistance(place.distanceMeters)}` : ''}
          </Text>
        </View>
        {closingTime ? (
          <Text style={styles.rowHours}>{t('map_closes_at').replace('{time}', closingTime)}</Text>
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
  suggestBox: {
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  suggestPin: { fontSize: 13 },
  suggestName: { ...typography.body, color: colors.textPrimary, fontWeight: '700', flexShrink: 1 },
  // La région/le pays occupe la place restante : deux « Springfield » ne se
  // distinguent que par là.
  suggestMeta: { fontSize: 12, color: colors.textMuted, flex: 1, textAlign: 'right' },
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
    backgroundColor: 'rgba(14,14,18,0.86)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingLeft: spacing.md,
    height: 46,
    ...elevation.medium,
  },
  searchIcon: { fontSize: 15, marginRight: 8 },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    height: 46,
  },
  clearBtn: { ...typography.body, color: colors.textMuted, fontSize: 14 },
  searchGo: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.glowBrand,
  },
  searchGoText: { color: '#fff', fontSize: 18, fontWeight: '700' },

  // Pastilles sous la recherche (univers, rayon, accès directs)
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 8 },
  chipRow: { flexDirection: 'row', paddingHorizontal: spacing.md, gap: spacing.sm, paddingBottom: spacing.sm, paddingTop: 2 },
  chipWide: { flex: 1, justifyContent: 'space-between' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(14,14,18,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  chipText: { ...typography.caption, color: '#fff', fontWeight: '700' },
  chipChevron: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
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
    ...StyleSheet.absoluteFill,
    zIndex: 9,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  filterPanel: {
    marginHorizontal: spacing.md,
    maxHeight: Math.round(SCREEN_HEIGHT * 0.5),
    backgroundColor: 'rgba(14,14,18,0.94)',
    borderColor: 'rgba(255,255,255,0.14)',
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
    // Fond = couleur de la catégorie (posée en ligne) ; liseré blanc pour se
    // détacher de la carte claire.
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerSelected: {
    borderColor: colors.bg,
    borderWidth: 3,
    // Pas de `transform: scale` : Android dessine le marqueur dans un bitmap
    // à partir des dimensions de mise en page, et une transformation appliquée
    // à cette même vue n'y figure pas — le marqueur choisi ne grossissait donc
    // jamais. Un agrandissement par la taille, lui, traverse la capture, et
    // l'ancre centrée le garde sur son point GPS.
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  markerEmoji: { fontSize: 18 },
  markerEmojiSelected: { fontSize: 24 },

  // Onde de recherche au point touché
  pulseBox: { width: PULSE_SIZE, height: PULSE_SIZE, alignItems: 'center', justifyContent: 'center' },
  pulseRing: {
    position: 'absolute', width: PULSE_SIZE, height: PULSE_SIZE, borderRadius: PULSE_SIZE / 2,
    borderWidth: 3, borderColor: colors.brand, backgroundColor: `${colors.brand}22`,
  },
  pulseDot: {
    width: 14, height: 14, borderRadius: 7, backgroundColor: colors.brand,
    borderWidth: 2, borderColor: '#fff',
  },

  // Bouton « recentrer »
  recenter: {
    position: 'absolute', right: spacing.md, width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(14,14,18,0.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center', ...elevation.medium,
  },
  recenterIcon: { color: '#fff', fontSize: 22, fontWeight: '700', marginTop: -2 },

  // Carrousel de cartes photo
  carousel: { position: 'absolute', left: 0, right: 0, bottom: DRAWER_COLLAPSED + spacing.sm, height: CARD_H },
  carouselContent: { paddingHorizontal: (SCREEN_WIDTH - CARD_W) / 2 },
  card: {
    width: CARD_W, height: CARD_H, marginRight: CARD_GAP, borderRadius: radius.lg, overflow: 'hidden',
    backgroundColor: colors.surface, padding: spacing.md, justifyContent: 'space-between',
    // Liseré de largeur constante : la carte choisie change de couleur sans
    // bouger d'un pixel.
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.14)',
  },
  cardGhost: { position: 'absolute', right: -10, top: 10, opacity: 0.35 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1,
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill,
  },
  cardPillText: { color: '#fff', fontSize: 12, fontWeight: '800', flexShrink: 1 },
  cardGo: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(14,14,18,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  cardGoText: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: -3 },
  cardName: {
    color: '#fff', fontSize: 19, fontWeight: '900', letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 },
  },
  cardMeta: { color: 'rgba(255,255,255,0.88)', fontSize: 13, fontWeight: '600', marginTop: 2 },

  tapHint: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: DRAWER_COLLAPSED + spacing.md,
    alignItems: 'center',
  },
  tapHintText: {
    ...typography.caption,
    color: '#fff',
    fontWeight: '600',
    backgroundColor: 'rgba(14,14,18,0.82)',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    overflow: 'hidden',
    textAlign: 'center',
  },

  // Bottom sheet — hauteur fixe, positionné en absolu et animé en transform (voir plus haut)
  drawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
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
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.brand,
    marginBottom: spacing.xs,
  },
  drawerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drawerTitle: { ...typography.heading, color: colors.textPrimary, fontWeight: '900', letterSpacing: -0.3 },
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
    width: 60,
    height: 60,
    borderRadius: radius.md,
    flexShrink: 0,
  },
  rowEmojiBg: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowEmoji: { fontSize: 24 },
  rowName: { ...typography.body, color: colors.textPrimary, fontWeight: '800', fontSize: 16 },
  rowDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  rowMetaLine: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
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
