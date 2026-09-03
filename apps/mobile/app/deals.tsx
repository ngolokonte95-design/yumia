/**
 * BONS PLANS — lieux proches réservables via un partenaire d'affiliation
 * (Booking.com, GetYourGuide, Viator...). Accessible depuis Explorer.
 * Alimenté par GET /affiliates/deals, qui ne renvoie que les univers ayant
 * au moins un partenaire réellement configuré (silencieux sinon, pas de
 * faux espoir affiché à l'utilisateur).
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Suggestion } from '@yumia/shared';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { useLocation } from '../lib/useLocation';
import { fetchNearbyDeals, type DealPlace } from '../lib/affiliates-api';
import { affiliateProviderLabel } from '../lib/affiliate-labels';
import { safeMeta, placeEmoji, universeLabel } from '../lib/universeMeta';
import { useI18n } from '../lib/useI18n';
import { placeStore } from '../lib/place-store';

function toSuggestion(place: DealPlace): Suggestion {
  return {
    place: {
      id: place.id,
      name: place.name,
      universe: place.universe,
      location: { lat: place.lat, lng: place.lng },
      city: place.city,
      countryCode: place.countryCode,
      rating: place.rating,
      priceTier: place.priceTier as 1 | 2 | 3 | 4,
      photoUrls: place.photoUrls ?? [],
      tags: place.tags ?? [],
    },
    compatibility: 0,
    distanceMeters: place.distanceMeters,
    reason: '💰 Bon plan partenaire',
    engine: 'mood',
  };
}

function fmtDistance(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function DealCard({ place, onPress }: { place: DealPlace; onPress: () => void }) {
  const { t } = useI18n();
  const meta = safeMeta(place.universe);
  const photo = place.photoUrls?.[0];

  return (
    <Pressable style={styles.card} onPress={onPress}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.cardImage} contentFit="cover" />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <Text style={{ fontSize: 36 }}>{placeEmoji(place.universe, place.tags)}</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>{place.name}</Text>
        <Text style={styles.cardMeta}>{universeLabel(t, place.universe)} · {fmtDistance(place.distanceMeters)}</Text>
        <View style={styles.badgeRow}>
          {place.affiliateProviders.map((key) => (
            <View key={key} style={styles.badge}>
              <Text style={styles.badgeText}>{affiliateProviderLabel(key)}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

export default function DealsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { coords, resolving } = useLocation();

  const [deals, setDeals] = useState<DealPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || resolving) return;
    setError(null);
    try {
      const data = await fetchNearbyDeals({ lat: coords.lat, lng: coords.lng, radius: 15_000 }, accessToken);
      setDeals(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de charger les bons plans.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, resolving, coords.lat, coords.lng]);

  useEffect(() => { void load(); }, [load]);

  function openPlace(place: DealPlace) {
    placeStore.set(toSuggestion(place));
    router.push('/place');
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>💰 Bons plans</Text>
          <Text style={styles.subtitle}>Réserve directement chez nos partenaires près de toi</Text>
        </View>
      </View>

      {loading || resolving ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => { setLoading(true); void load(); }}>
            <Text style={styles.retryText}>Réessayer</Text>
          </Pressable>
        </View>
      ) : deals.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🔍</Text>
          <Text style={styles.emptyText}>Pas encore de bon plan partenaire près de toi.</Text>
          <Text style={styles.emptySubtext}>De nouveaux partenaires arrivent bientôt — reviens vite !</Text>
        </View>
      ) : (
        <FlatList
          data={deals}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} />
          }
          renderItem={({ item }) => <DealCard place={item} onPress={() => openPlace(item)} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  backBtn: { paddingTop: 2 },
  backText: { ...typography.heading, color: colors.brandSoft, fontSize: 24 },
  title: { ...typography.h2, color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: 10 },
  errorText: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  retryBtn: { marginTop: 8, backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 24, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '700' },
  emptyEmoji: { fontSize: 44 },
  emptyText: { ...typography.h3, color: colors.text, textAlign: 'center' },
  emptySubtext: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  card: {
    flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: spacing.sm,
  },
  cardImage: { width: 96, height: 96 },
  cardImagePlaceholder: { backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, padding: spacing.sm, justifyContent: 'center', gap: 4 },
  cardName: { ...typography.body, fontWeight: '700', color: colors.text },
  cardMeta: { fontSize: 12, color: colors.textMuted },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  badge: { backgroundColor: `${colors.brand}18`, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '600', color: colors.brand },
});
