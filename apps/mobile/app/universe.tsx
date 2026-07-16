/**
 * UNIVERSE EXPLORER — liste des lieux d'un univers donné autour de l'utilisateur.
 * L'univers est passé via le paramètre URL `?u=restaurant`.
 */
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { UNIVERSE_META, isUniverse } from '@yumia/shared';
import type { Universe } from '@yumia/shared';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useLocation } from '../lib/useLocation';
import { useAuth } from '../lib/auth-context';
import { useI18n } from '../lib/useI18n';
import { useSaved } from '../lib/useSaved';
import { useNearbyUniverse } from '../lib/useNearbyUniverse';
import { placeEmoji } from '../lib/universeMeta';
import { placeStore } from '../lib/place-store';
import { recordVisit } from '../lib/passport-api';
import type { NearbyPlace } from '../lib/places-api';

export default function UniverseScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { u } = useLocalSearchParams<{ u: string }>();
  const { coords, resolving } = useLocation();
  const { accessToken } = useAuth();
  const { t } = useI18n();
  const { savedIds, save, unsave } = useSaved(accessToken);

  const universe = (isUniverse(u) ? u : null) as Universe | null;
  const meta = universe ? UNIVERSE_META[universe] : null;

  const { places, loading, error, reload } = useNearbyUniverse({
    lat: coords.lat,
    lng: coords.lng,
    universe,
    radius: 10000,
    limit: 60,
    enabled: !resolving,
  });

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
      reason: `Lieu ${meta?.labelFr ?? universe} à ${formatDistance(p.distanceMeters)}.`,
      engine: 'mood' as const,
    });
    router.push('/place');
  }

  if (!universe || !meta) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Retour</Text>
        </Pressable>
        <Text style={styles.error}>Univers inconnu.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={styles.headerTitle}>
          <Text style={styles.headerEmoji}>{meta.emoji}</Text>
          <Text style={styles.headerLabel}>{meta.labelFr}</Text>
        </View>
        <Text style={styles.count}>{places.length}</Text>
      </View>

      {loading && places.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={styles.loadingText}>YUMIA cherche près de toi…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={reload}>
            <Text style={styles.retryText}>{t('retry')}</Text>
          </Pressable>
        </View>
      ) : places.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>{meta.emoji}</Text>
          <Text style={styles.emptyText}>Aucun lieu de ce type près de toi.</Text>
        </View>
      ) : (
        <FlatList
          data={places}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.brand} />
          }
          renderItem={({ item }) => {
            const isSaved = savedIds.has(item.id);
            const todayHours = getTodayHours(item.openingHours);
            return (
              <Pressable style={styles.card} onPress={() => handleTap(item)}>
                <View style={styles.cardLeft}>
                  {item.photoUrls && item.photoUrls.length > 0 ? (
                    <Image
                      source={{ uri: item.photoUrls[0] }}
                      style={styles.cardPhoto}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      recyclingKey={item.photoUrls[0]}
                      transition={150}
                    />
                  ) : (
                    <View style={styles.cardEmojiBg}>
                      <Text style={styles.cardEmoji}>{placeEmoji(item.universe, item.tags)}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.cardMeta}>
                      ⭐ {item.rating.toFixed(1)} · {'€'.repeat(item.priceTier)} · {formatDistance(item.distanceMeters)}
                    </Text>
                    {item.city ? <Text style={styles.cardCity}>{item.city}</Text> : null}
                    {todayHours ? (
                      <Text style={styles.cardHours} numberOfLines={1}>🕐 {todayHours}</Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.cardActions}>
                  {accessToken ? (
                    <Pressable
                      style={styles.heartBtn}
                      onPress={() => isSaved ? void unsave(item.id) : void save(item.id)}
                    >
                      <Text style={styles.heartText}>{isSaved ? '❤️' : '🤍'}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function getTodayHours(hours?: string[]): string | null {
  if (!hours || hours.length === 0) return null;
  const todayIdx = (new Date().getDay() + 6) % 7;
  const entry = hours[todayIdx];
  if (!entry) return null;
  const colonIdx = entry.indexOf(': ');
  const timeRange = colonIdx >= 0 ? entry.slice(colonIdx + 2) : entry;
  if (timeRange.toLowerCase().includes('fermé') || timeRange.toLowerCase().includes('closed')) return 'Fermé';
  // Extrait l'heure de fermeture (après le tiret)
  const parts = timeRange.split(/\s[–\-]\s/);
  if (parts.length < 2) return timeRange;
  const closing = parts[parts.length - 1].trim();
  return `Ferme à ${to24h(closing)}`;
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  backBtn: { padding: spacing.xs },
  backText: { ...typography.heading, color: colors.brandSoft, fontSize: 22 },
  headerTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerEmoji: { fontSize: 24 },
  headerLabel: { ...typography.title, color: colors.textPrimary },
  count: {
    ...typography.caption,
    color: colors.textMuted,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { ...typography.body, color: colors.textSecondary },
  error: { ...typography.body, color: colors.danger, padding: spacing.lg },
  errorText: { ...typography.body, color: colors.danger },
  retryBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  retryText: { ...typography.caption, color: '#fff' },
  emptyEmoji: { fontSize: 56 },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },

  list: { padding: spacing.md, gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardPhoto: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    flexShrink: 0,
  },
  cardEmojiBg: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardEmoji: { fontSize: 26 },
  cardName: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  cardMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  cardCity: { ...typography.label, color: colors.textMuted, marginTop: 1 },
  cardHours: { ...typography.label, color: colors.brand, marginTop: 2, fontSize: 11 },
  cardActions: { gap: spacing.sm },
  heartBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartText: { fontSize: 18 },
});
