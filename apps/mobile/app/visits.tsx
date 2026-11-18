/**
 * MES VISITES — historique paginé de tous les lieux visités.
 * Accessible depuis l'onglet Passeport.
 *
 * DA (18/11/2026) : titre dégradé avec le total, visites en FRISE verticale
 * (pastille au dégradé de marque reliée par un fil fin), chaque visite en
 * carte vitrée : icône de l'univers en médaillon, ressenti, XP en pastille
 * dégradée, notes en citation. Apparition en cascade. Logique inchangée.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { universeLabel } from '../lib/universeMeta';
import { useI18n } from '../lib/useI18n';
import { colors, gradients, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { getVisitHistory, type VisitHistoryItem } from '../lib/passport-api';
import { placeStore } from '../lib/place-store';
import { fetchPlaceById } from '../lib/places-api';
import { PressableScale, Reveal } from '../components/ui';
import { UniverseGlyph } from '../components/UniverseGlyph';
import { SocialEmpty, SocialHeader } from '../components/social/SocialChrome';
import { BACK_ICON, GLASS_CARD, IconMedal, InfoPill } from '../components/p2a/P2Chrome';

const FEEDBACK_EMOJI: Record<string, string> = { loved: '❤️', neutral: '😐', disliked: '👎' };

const INTL_LOCALE: Record<string, string> = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', pt: 'pt-PT', ar: 'ar-SA' };

export default function VisitsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { t } = useI18n();

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
        setError(e instanceof Error ? e.message : t('visits_load_error'));
      }
    },
    [accessToken, t],
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

  const subtitle = total > 0
    ? t('visits_count')
      .replace('{n}', String(total))
      .replace('{s2}', total > 1 ? 's' : '')
      .replace('{s}', total > 1 ? 's' : '')
    : undefined;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <SocialHeader title={t('visits_title')} subtitle={subtitle} onBack={() => router.back()} backIcon={BACK_ICON} />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <SocialEmpty emoji="📡" title={error} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <SocialEmpty emoji="🗺️" title={t('visits_empty_title')} text={t('visits_empty_sub')} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing.md }} /> : undefined
          }
          renderItem={({ item, index }) => (
            <Reveal index={Math.min(index, 8)} from="fade">
              <VisitRow
                item={item}
                first={index === 0}
                last={index === items.length - 1 && !hasMore.current}
                onPress={() => openPlace(item)}
              />
            </Reveal>
          )}
        />
      )}
    </View>
  );
}

function VisitRow({ item, first, last, onPress }: {
  item: VisitHistoryItem; first: boolean; last: boolean; onPress: () => void;
}) {
  const { t, locale } = useI18n();
  const date = new Date(item.visitedAt);
  const dateStr = date.toLocaleDateString(INTL_LOCALE[locale] ?? 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <View style={styles.rowWrap}>
      {/* Frise : fil fin + pastille au dégradé de marque */}
      <View style={styles.rail}>
        {first && last ? null : (
          <View style={[styles.railLine, first && styles.railLineFirst, last && styles.railLineLast]} />
        )}
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.railDot} />
      </View>

      <PressableScale style={[styles.card, GLASS_CARD]} scaleTo={0.98} onPress={onPress}>
        <View style={styles.cardTop}>
          <IconMedal icon={<UniverseGlyph u={item.place.universe} size={22} />} size={46} />
          <View style={styles.cardBody}>
            <Text style={styles.placeName} numberOfLines={1}>{item.place.name}</Text>
            <Text style={styles.placeMeta} numberOfLines={1}>
              {universeLabel(t, item.place.universe)}
              {item.place.city ? ` · ${item.place.city}` : ''}
              {item.place.countryCode ? ` · ${item.place.countryCode.toUpperCase()}` : ''}
            </Text>
          </View>
          {item.feedback ? <Text style={styles.feedbackEmoji}>{FEEDBACK_EMOJI[item.feedback]}</Text> : null}
        </View>

        <View style={styles.cardFoot}>
          <Text style={styles.dateText}>{dateStr}</Text>
          <InfoPill label={`+${item.xpAwarded} XP`} brand />
        </View>

        {item.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.notes} numberOfLines={2}>« {item.notes} »</Text>
          </View>
        ) : null}
      </PressableScale>
    </View>
  );
}

const RAIL = 22;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list: { paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  rowWrap: { flexDirection: 'row', gap: spacing.sm },
  rail: { width: RAIL, alignItems: 'center' },
  railLine: {
    position: 'absolute', top: 0, bottom: 0, width: 2, borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  railLineFirst: { top: 26 },
  railLineLast: { bottom: undefined, height: 26 },
  railDot: {
    marginTop: 20, width: 14, height: 14, borderRadius: 7,
    borderWidth: 2, borderColor: colors.bg,
  },

  card: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardBody: { flex: 1, gap: 2 },
  placeName: { color: colors.textPrimary, fontSize: 17, fontWeight: '900', letterSpacing: -0.2 },
  placeMeta: { ...typography.caption, color: colors.textSecondary },
  feedbackEmoji: { fontSize: 20 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateText: { ...typography.caption, color: colors.textMuted, fontWeight: '600' },
  notesBox: {
    borderStartWidth: 2, borderStartColor: `${colors.brand}88`,
    paddingStart: spacing.sm,
  },
  notes: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 18 },
});
