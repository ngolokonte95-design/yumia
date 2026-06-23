import { useRef, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { UNIVERSES, UNIVERSE_META, type Universe } from '@yumia/shared';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { useLocation } from '../../lib/useLocation';
import { useNearby } from '../../lib/useNearby';
import { placeStore } from '../../lib/place-store';
import type { NearbyPlace } from '../../lib/places-api';

const MAP_DELTA = 0.025; // ~2.5 km de côté

/**
 * DISCOVERY MAP — tuiles réelles (Apple Maps iOS / Google Maps Android) via
 * react-native-maps. Marqueurs emoji par univers, drawer liste des lieux.
 * Sur Expo Go en mode dev, les tuiles Apple Maps s'affichent sans clé.
 * Pour Google Maps Android : renseigner googleMapsApiKey dans app.json > extra.
 */
export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const router = useRouter();
  const { coords, resolving } = useLocation();
  const [universe, setUniverse] = useState<Universe | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { places, loading, error } = useNearby({
    lat: coords.lat,
    lng: coords.lng,
    radius: 3000,
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
    selectPlace(place);
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
      },
      compatibility: 0,
      distanceMeters: place.distanceMeters,
      reason: `${UNIVERSE_META[place.universe].labelFr} à ${formatDistance(place.distanceMeters)}.`,
      engine: 'mood' as const,
    });
    router.push('/place');
  }

  const provider = Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;

  return (
    <View style={styles.screen}>
      {/* Filtre univers (flottant au-dessus de la carte) */}
      <View style={[styles.filtersContainer, { paddingTop: insets.top + spacing.xs }]}>
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

      {/* Carte réelle */}
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
        >
          {places.map((place) => (
            <Marker
              key={place.id}
              coordinate={{ latitude: place.lat, longitude: place.lng }}
              title={place.name}
              description={`${UNIVERSE_META[place.universe].labelFr} · ⭐ ${place.rating.toFixed(1)}`}
              onPress={() => selectPlace(place)}
            >
              <View style={[styles.markerBubble, place.id === selectedId && styles.markerSelected]}>
                <Text style={styles.markerEmoji}>{UNIVERSE_META[place.universe].emoji}</Text>
              </View>
            </Marker>
          ))}
        </MapView>
      )}

      {loading && !resolving ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : null}

      {/* Drawer */}
      <View style={[styles.drawer, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.drawerHandle} />
        <Text style={styles.drawerTitle}>
          {places.length} lieu{places.length > 1 ? 'x' : ''} autour de toi
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {places.map((place) => (
            <PlaceRow
              key={place.id}
              place={place}
              selected={place.id === selectedId}
              onPress={() => selectPlace(place)}
              onDetail={() => openDetail(place)}
            />
          ))}
          {!loading && places.length === 0 ? (
            <Text style={styles.empty}>Aucun lieu dans ce rayon. Élargis ou change de filtre.</Text>
          ) : null}
        </ScrollView>
      </View>
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
}: {
  place: NearbyPlace;
  selected: boolean;
  onPress: () => void;
  onDetail: () => void;
}) {
  const meta = UNIVERSE_META[place.universe];
  return (
    <Pressable style={[styles.row, selected && styles.rowSelected]} onPress={onPress}>
      <Text style={styles.rowEmoji}>{meta.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>{place.name}</Text>
        <Text style={styles.rowMeta}>
          {meta.labelFr} · ⭐ {place.rating.toFixed(1)} · {formatDistance(place.distanceMeters)}
        </Text>
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

/** Style sombre pour Google Maps (Android). Sur iOS Apple Maps s'adapte automatiquement. */
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
  drawer: {
    maxHeight: 260,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  drawerHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  drawerTitle: { ...typography.heading, color: colors.textPrimary, marginBottom: spacing.sm },
  error: { ...typography.caption, color: colors.danger, marginBottom: spacing.sm },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.lg },
  list: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  rowSelected: { backgroundColor: colors.surfaceElevated, borderRadius: radius.md, paddingHorizontal: spacing.sm },
  rowEmoji: { fontSize: 24 },
  rowName: { ...typography.body, color: colors.textPrimary },
  rowMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
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
