import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
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
import { PremiumUpsellModal } from '../../components/PremiumUpsellModal';

const MAP_DELTA = 0.025;
const MAX_MARKERS = 45;
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DRAWER_COLLAPSED = 72;
const DRAWER_EXPANDED = Math.round(SCREEN_HEIGHT * 0.62);

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const router = useRouter();
  const { coords, resolving } = useLocation();
  const [universe, setUniverse] = useState<Universe | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<NearbyPlace[] | null>(null);
  const [cityLoading, setCityLoading] = useState(false);
  const [citiesSearchedCount, setCitiesSearchedCount] = useState(0);
  const [tapResults, setTapResults] = useState<NearbyPlace[] | null>(null);
  const [tapLoading, setTapLoading] = useState(false);
  const [upsell, setUpsell] = useState<string | null>(null);
  const [tracking, setTracking] = useState(true);
  const { checkLimit, recordUsage } = usePlanLimits();

  // Bottom sheet state
  const drawerExpanded = useRef(false);
  const drawerAnim = useRef(new Animated.Value(DRAWER_COLLAPSED)).current;

  const toggleDrawer = useCallback((forceExpand?: boolean) => {
    const shouldExpand = forceExpand !== undefined ? forceExpand : !drawerExpanded.current;
    drawerExpanded.current = shouldExpand;
    Animated.spring(drawerAnim, {
      toValue: shouldExpand ? DRAWER_EXPANDED : DRAWER_COLLAPSED,
      useNativeDriver: false,
      tension: 80,
      friction: 12,
    }).start();
  }, [drawerAnim]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dy }) => Math.abs(dy) > 8,
      onPanResponderMove: (_, { dy }) => {
        const base = drawerExpanded.current ? DRAWER_EXPANDED : DRAWER_COLLAPSED;
        const next = Math.max(DRAWER_COLLAPSED, Math.min(DRAWER_EXPANDED, base - dy));
        drawerAnim.setValue(next);
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        const isExpanded = drawerExpanded.current;
        const shouldExpand = isExpanded
          ? !(dy > 60 || vy > 0.8)
          : dy < -60 || vy < -0.8;
        drawerExpanded.current = shouldExpand;
        Animated.spring(drawerAnim, {
          toValue: shouldExpand ? DRAWER_EXPANDED : DRAWER_COLLAPSED,
          useNativeDriver: false,
          tension: 80,
          friction: 12,
        }).start();
      },
    })
  ).current;

  const { places, loading, error } = useNearby({
    lat: coords.lat,
    lng: coords.lng,
    radius: 6000,
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
  }

  const handleMapTap = useCallback(async (e: MapPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setTapLoading(true);
    setCityResults(null);
    setCityQuery('');
    try {
      const results = await fetchNearby({ lat: latitude, lng: longitude, radius: 5000, universe: universe ?? undefined, limit: 80 });
      setTapResults(results);
      mapRef.current?.animateToRegion(
        { latitude, longitude, latitudeDelta: MAP_DELTA, longitudeDelta: MAP_DELTA },
        300,
      );
    } catch {
      // silent
    } finally {
      setTapLoading(false);
    }
  }, [universe]);

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
    const list = cityResults ?? tapResults ?? places;
    return [...list].sort(
      (a, b) => (a.universe === 'restaurant' ? 0 : 1) - (b.universe === 'restaurant' ? 0 : 1),
    );
  }, [cityResults, tapResults, places]);

  const markerPlaces = useMemo(() => displayPlaces.slice(0, MAX_MARKERS), [displayPlaces]);

  useEffect(() => {
    setTracking(true);
    const t = setTimeout(() => setTracking(false), 900);
    return () => clearTimeout(t);
  }, [cityResults, tapResults, places]);

  const drawerTitle = cityResults !== null
    ? `${cityResults.length} lieu${cityResults.length > 1 ? 'x' : ''} à « ${cityQuery} »`
    : tapResults !== null
    ? `${tapResults.length} lieu${tapResults.length > 1 ? 'x' : ''} autour de ce point`
    : `${places.length} lieu${places.length > 1 ? 'x' : ''} autour de toi`;

  return (
    <View style={styles.screen}>
      <PremiumUpsellModal visible={upsell !== null} message={upsell ?? ''} onClose={() => setUpsell(null)} />

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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}
        >
          <FilterChip label="Tous" active={universe === null} onPress={() => setUniverse(null)} />
          {UNIVERSES.map((u) => (
            <FilterChip
              key={u}
              label={`${UNIVERSE_META[u].emoji} ${UNIVERSE_META[u].labelFr}`}
              active={universe === u}
              onPress={() => setUniverse(u)}
            />
          ))}
        </ScrollView>
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
          customMapStyle={DARK_MAP_STYLE}
          onPress={handleMapTap}
        >
          {markerPlaces.map((place) => (
            <Marker
              key={place.id}
              coordinate={{ latitude: place.lat, longitude: place.lng }}
              title={place.name}
              description={`${safeMeta(place.universe).labelFr || place.universe} · ⭐ ${place.rating.toFixed(1)}`}
              tracksViewChanges={tracking}
              onPress={() => openDetail(place)}
            >
              <View style={[styles.markerBubble, place.id === selectedId && styles.markerSelected]}>
                <Text style={styles.markerEmoji}>{placeEmoji(place.universe, place.tags)}</Text>
              </View>
            </Marker>
          ))}
        </MapView>
      )}

      {(loading || tapLoading) && !resolving ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : null}

      {/* Bottom sheet swipeable */}
      <Animated.View
        style={[
          styles.drawer,
          { height: drawerAnim, paddingBottom: insets.bottom + spacing.md },
        ]}
      >
        {/* Handle + titre — zone de glissement */}
        <Pressable
          style={styles.drawerHeader}
          onPress={() => toggleDrawer()}
          {...panResponder.panHandlers}
        >
          <View style={styles.drawerHandle} />
          <View style={styles.drawerTitleRow}>
            <Text style={styles.drawerTitle}>{drawerTitle}</Text>
            <Text style={styles.drawerChevron}>
              {drawerExpanded.current ? '▼' : '▲'}
            </Text>
          </View>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <FlatList
          style={styles.list}
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
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.filterChip, active && styles.filterChipActive]} onPress={onPress}>
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
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
          <Text style={styles.rowEmoji}>{placeEmoji(place.universe, place.tags)}</Text>
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

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#17171F' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#A6A6B8' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0E0E12' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A2A38' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1F1F2A' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#1F1F2A' }] },
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
  filtersRow: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  filterChip: {
    backgroundColor: `${colors.surface}EE`,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    height: 38,
    justifyContent: 'center',
  },
  filterChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterText: { ...typography.caption, color: colors.textPrimary },
  filterTextActive: { color: '#fff' },
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

  // Bottom sheet
  drawer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  drawerHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  drawerHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
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
