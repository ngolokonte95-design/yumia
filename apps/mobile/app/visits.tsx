/**
 * MES VISITES — historique paginé de tous les lieux visités.
 * Accessible depuis l'onglet Passeport.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { safeMeta } from '../lib/universeMeta';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { getVisitHistory, type VisitHistoryItem } from '../lib/passport-api';
import { placeStore } from '../lib/place-store';
import { fetchPlaceById } from '../lib/places-api';

const FEEDBACK_EMOJI: Record<string, string> = { loved: '❤️', neutral: '😐', disliked: '👎' };

export default function VisitsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();

  const [items, setItems] = useState<VisitHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextCursor = useRef<string | null>(null);
  const hasMore = useRef(true);

  const load = useCallback(
    async (cursor?: string) => {
      if (!accessToken) return;
      try {
        const page = await getVisitHistory(accessToken, 20, cursor);
        setItems((prev) => (cursor ? [...prev, ...page.items] : page.items));
        setTotal(page.total);
        nextCursor.current = page.nextCursor;
        hasMore.current = page.nextCursor !== null;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur de chargement.');
      }
    },
    [accessToken],
  );

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    nextCursor.current = null;
    hasMore.current = true;
    await load();
    setRefreshing(false);
  }

  async function loadMore() {
    if (!hasMore.current || loadingMore || !nextCursor.current) return;
    setLoadingMore(true);
    await load(nextCursor.current);
    setLoadingMore(false);
  }

  async function openPlace(item: VisitHistoryItem) {
    if (!accessToken) return;
    try {
      const raw = await fetchPlaceById(item.place.id);
      if (raw) {
        const { lat, lng, priceTier, ...rest } = raw;
        placeStore.set({ place: { ...rest, priceTier: (Math.min(4, Math.max(1, priceTier)) as 1 | 2 | 3 | 4), location: { lat, lng } }, compatibility: 0, distanceMeters: 0, reason: '', engine: 'mood' });
        router.push('/place');
      }
    } catch {
      // silently fail — the place may have been removed
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Mes visites</Text>
          {total > 0 ? (
            <Text style={styles.subtitle}>{total} lieu{total > 1 ? 'x' : ''} exploré{total > 1 ? 's' : ''}</Text>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>🗺️</Text>
          <Text style={styles.emptyTitle}>Aucune visite pour l'instant</Text>
          <Text style={styles.emptySub}>Dis « J'y suis allé » sur un lieu pour le voir ici.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing.md }} /> : null
          }
          renderItem={({ item }) => <VisitRow item={item} onPress={() => openPlace(item)} />}
        />
      )}
    </View>
  );
}

function VisitRow({ item, onPress }: { item: VisitHistoryItem; onPress: () => void }) {
  const meta = safeMeta(item.place.universe);
  const date = new Date(item.visitedAt);
  const dateStr = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowEmoji}>
        <Text style={styles.emojiText}>{meta?.emoji ?? '📍'}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.placeName} numberOfLines={1}>{item.place.name}</Text>
        <Text style={styles.placeMeta} numberOfLines={1}>
          {meta?.labelFr ?? item.place.universe}
          {item.place.city ? ` · ${item.place.city}` : ''}
          {item.place.countryCode ? ` · ${item.place.countryCode.toUpperCase()}` : ''}
        </Text>
        <Text style={styles.dateText}>{dateStr}</Text>
        {item.notes ? <Text style={styles.notes} numberOfLines={2}>{item.notes}</Text> : null}
      </View>
      <View style={styles.rowRight}>
        {item.feedback ? <Text style={styles.feedbackEmoji}>{FEEDBACK_EMOJI[item.feedback]}</Text> : null}
        <Text style={styles.xpText}>+{item.xpAwarded} XP</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  backBtn: { padding: spacing.xs },
  backText: { ...typography.title, color: colors.brandSoft },
  title: { ...typography.heading, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  errorText: { ...typography.body, color: colors.danger, textAlign: 'center' },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { ...typography.heading, color: colors.textPrimary, textAlign: 'center' },
  emptySub: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  list: { padding: spacing.md, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowEmoji: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: { fontSize: 24 },
  rowBody: { flex: 1, gap: 3 },
  placeName: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  placeMeta: { ...typography.caption, color: colors.textMuted },
  dateText: { ...typography.caption, color: colors.textMuted },
  notes: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic', marginTop: spacing.xs },
  rowRight: { alignItems: 'flex-end', gap: spacing.xs },
  feedbackEmoji: { fontSize: 18 },
  xpText: { ...typography.label, color: colors.brand },
});
