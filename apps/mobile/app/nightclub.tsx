/**
 * NIGHT-CLUBS — lieux de nuit avec filtre d'ambiance.
 */
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { UNIVERSE_META } from '@yumia/shared';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useLocation } from '../lib/useLocation';
import { fetchNearby, type NearbyPlace } from '../lib/places-api';
import { placeStore } from '../lib/place-store';
import { PlacePhoto } from '../components/PlacePhoto';

const AMBIANCES = [
  { key: 'all', label: 'Tous', emoji: '🎧' },
  { key: 'afro', label: 'Afro / Caribéen', emoji: '🌴' },
  { key: 'electro', label: 'Électro', emoji: '⚡' },
  { key: 'techno', label: 'Techno', emoji: '🔊' },
  { key: 'hiphop', label: 'Hip-Hop / Rap', emoji: '🎤' },
  { key: 'rnb', label: 'R&B / Soul', emoji: '🎵' },
  { key: 'latin', label: 'Latino', emoji: '🎺' },
  { key: 'variete', label: 'Variété', emoji: '🎶' },
];

export default function NightclubScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { coords, resolving } = useLocation();
  const [ambiance, setAmbiance] = useState('all');
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (resolving) return;
    setLoading(true);
    fetchNearby({ lat: coords.lat, lng: coords.lng, radius: 8000, universe: 'nightclub', limit: 30 })
      .then(setPlaces)
      .catch(() => setPlaces([]))
      .finally(() => setLoading(false));
  }, [coords.lat, coords.lng, resolving]);

  // Filtre côté client par tag d'ambiance
  const filtered = ambiance === 'all'
    ? places
    : places.filter((p) => p.tags.some((t) => t.toLowerCase().includes(ambiance)));

  function openDetail(place: NearbyPlace) {
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
      distanceMeters: place.distanceMeters,
      reason: '🎧 Night-club près de toi',
      engine: 'mood' as const,
    });
    router.push('/place');
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🎧 Night-clubs</Text>
          <Text style={styles.subtitle}>Les clubs près de toi — choisis ton ambiance.</Text>
        </View>
      </View>

      {/* Filtre ambiance */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ambianceRow}>
        {AMBIANCES.map((a) => (
          <Pressable
            key={a.key}
            style={[styles.ambianceChip, ambiance === a.key && styles.ambianceChipActive]}
            onPress={() => setAmbiance(a.key)}
          >
            <Text style={styles.ambianceEmoji}>{a.emoji}</Text>
            <Text style={[styles.ambianceLabel, ambiance === a.key && styles.ambianceLabelActive]}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading || resolving ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🎧</Text>
              <Text style={styles.emptyText}>Aucun club trouvé dans ce rayon.</Text>
              <Text style={styles.emptyHint}>Les clubs sont souvent actifs le soir — réessaie plus tard ou élargis la zone.</Text>
            </View>
          ) : (
            filtered.map((place) => (
              <Pressable key={place.id} style={styles.card} onPress={() => openDetail(place)}>
                <View style={styles.cardThumb}>
                  <PlacePhoto
                    photoUrls={place.photoUrls}
                    emoji={UNIVERSE_META[place.universe]?.emoji ?? '🎧'}
                    emojiSize={28}
                    scrim
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName} numberOfLines={1}>{place.name}</Text>
                  <Text style={styles.cardMeta}>
                    ⭐ {place.rating.toFixed(1)} · {place.city}
                    {place.distanceMeters > 0 ? ` · ${place.distanceMeters < 1000 ? `${Math.round(place.distanceMeters)} m` : `${(place.distanceMeters / 1000).toFixed(1)} km`}` : ''}
                  </Text>
                  {place.tags.length > 0 ? (
                    <Text style={styles.cardTags} numberOfLines={1}>
                      {place.tags.slice(0, 4).join(' · ')}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.cardArrow}>›</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { ...typography.title, color: colors.textPrimary, lineHeight: 20 },
  title: { ...typography.heading, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  ambianceRow: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  ambianceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    height: 40,
    paddingHorizontal: spacing.md,
  },
  ambianceChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  ambianceEmoji: { fontSize: 15, lineHeight: 20 },
  ambianceLabel: { ...typography.caption, lineHeight: 20, color: colors.textPrimary },
  ambianceLabelActive: { color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 80 },
  empty: { alignItems: 'center', paddingTop: 60, gap: spacing.md },
  emptyEmoji: { fontSize: 48 },
  emptyText: { ...typography.body, color: colors.textPrimary, textAlign: 'center' },
  emptyHint: { ...typography.caption, color: colors.textMuted, textAlign: 'center', maxWidth: 260 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  cardThumb: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: colors.surfaceElevated,
  },
  cardName: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  cardMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  cardTags: { ...typography.label, color: colors.textMuted, marginTop: 2, fontSize: 10 },
  cardArrow: { ...typography.title, color: colors.textMuted, lineHeight: 24, flexShrink: 0 },
});
