/**
 * CENTRE DE NOTIFICATIONS — historique persistant côté serveur.
 * Chaque notification envoyée en push (like, commentaire, abonné, appel,
 * badge…) est aussi enregistrée par l'API — voir lib/notifications-api.ts.
 * Contrairement à l'ancienne version (SecureStore, par appareil), l'historique
 * est donc le même sur tous les appareils, et n'est pas perdu si une push a
 * été manquée hors-ligne.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { notificationsApi, type ServerNotification } from '../lib/notifications-api';
import { notificationTarget } from '../lib/notificationRouting';
import { clearUnreadCountLocally, refreshUnreadCount } from '../lib/useNotifications';

const TYPE_ICON: Record<string, string> = {
  post_like: '❤️',
  post_comment: '💬',
  new_follower: '👤',
  story_reply: '↩️',
  incoming_call: '📞',
  encounter: '⚡',
  badge_unlocked: '🏆',
  level_up: '🚀',
  streak_milestone: '🔥',
  streak_danger: '🔥',
  daily_digest: '🌅',
  closing_soon: '⏰',
  generic: '🔔',
};

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();

  const [items, setItems] = useState<ServerNotification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const page = await notificationsApi.list(accessToken);
    setItems(page.items);
    setNextCursor(page.nextCursor);
    setLoading(false);
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  // Tout marquer lu à l'ouverture (comme avant) — mais synchronisé côté
  // serveur désormais, donc valable sur tous les appareils.
  useEffect(() => {
    if (!accessToken) return;
    clearUnreadCountLocally();
    void notificationsApi.markAllRead(accessToken).then(() => refreshUnreadCount(accessToken));
  }, [accessToken]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!accessToken || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    const page = await notificationsApi.list(accessToken, nextCursor);
    setItems((prev) => [...prev, ...page.items]);
    setNextCursor(page.nextCursor);
    setLoadingMore(false);
  }, [accessToken, nextCursor, loadingMore]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🔔</Text>
          <Text style={styles.emptyText}>Aucune notification pour le moment.</Text>
          <Text style={styles.emptyHint}>YUMIA t'avertira quand de nouvelles adresses correspondent à tes envies.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.brand} />
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => void loadMore()}
          renderItem={({ item }) => (
            <NotifRow item={item} onPress={() => router.push(notificationTarget(item) as never)} />
          )}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing.md }} /> : null
          }
        />
      )}
    </View>
  );
}

function NotifRow({ item, onPress }: { item: ServerNotification; onPress: () => void }) {
  const date = new Date(item.createdAt);
  const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const dateStr = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

  return (
    <Pressable style={[styles.row, !item.read && styles.rowUnread]} onPress={onPress}>
      <View style={styles.iconBox}>
        <Text style={styles.icon}>{TYPE_ICON[item.type] ?? '🔔'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{item.title}</Text>
        {item.body ? <Text style={styles.rowBody} numberOfLines={2}>{item.body}</Text> : null}
        <Text style={styles.rowTime}>{dateStr} · {timeStr}</Text>
      </View>
      {!item.read ? <View style={styles.unreadDot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs },
  backText: { ...typography.heading, color: colors.brandSoft, fontSize: 22 },
  title: { ...typography.heading, color: colors.textPrimary },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  emptyEmoji: { fontSize: 56 },
  emptyText: { ...typography.heading, color: colors.textPrimary, textAlign: 'center' },
  emptyHint: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },

  list: { padding: spacing.md, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowUnread: { backgroundColor: `${colors.brand}0A`, borderColor: `${colors.brand}44` },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  icon: { fontSize: 20 },
  rowTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  rowBody: { ...typography.caption, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
  rowTime: { ...typography.label, color: colors.textMuted, marginTop: 4 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand,
    marginTop: 6,
    flexShrink: 0,
  },
});
