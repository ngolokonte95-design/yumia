/**
 * CENTRE DE NOTIFICATIONS — historique persistant côté serveur.
 * Chaque notification envoyée en push (like, commentaire, abonné, appel,
 * badge…) est aussi enregistrée par l'API — voir lib/notifications-api.ts.
 * Contrairement à l'ancienne version (SecureStore, par appareil), l'historique
 * est donc le même sur tous les appareils, et n'est pas perdu si une push a
 * été manquée hors-ligne.
 *
 * DA (18/11/2026) : en-tête au titre dégradé, cartes vitrées ; une
 * notification non lue a son icône dans un anneau au dégradé de marque, un
 * liseré lumineux et un point dégradé. Apparition en cascade des premières
 * lignes. Logique inchangée.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { notificationsApi, type ServerNotification } from '../lib/notifications-api';
import { notificationTarget } from '../lib/notificationRouting';
import { clearUnreadCountLocally, refreshUnreadCount } from '../lib/useNotifications';
import { useI18n } from '../lib/useI18n';
import { PressableScale, Reveal } from '../components/ui';
import { SocialEmpty, SocialHeader } from '../components/social/SocialChrome';
import { BACK_ICON, GLASS_CARD, IconMedal } from '../components/p2a/P2Chrome';

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
  const { t } = useI18n();

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
      <SocialHeader title={t('notif_title')} onBack={() => router.back()} backIcon={BACK_ICON} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <SocialEmpty emoji="🔔" title={t('notif_empty_title')} text={t('notif_empty_hint')} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.brand} />
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => void loadMore()}
          renderItem={({ item, index }) => (
            // Cascade sur les premières lignes seulement : au-delà, elles
            // apparaissent hors écran et un délai ralentirait le défilement.
            <Reveal index={Math.min(index, 8)} from="fade">
              <NotifRow item={item} onPress={() => router.push(notificationTarget(item) as never)} />
            </Reveal>
          )}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing.md }} /> : undefined
          }
        />
      )}
    </View>
  );
}

const INTL_LOCALE: Record<string, string> = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', pt: 'pt-PT', ar: 'ar-SA' };

function NotifRow({ item, onPress }: { item: ServerNotification; onPress: () => void }) {
  const { locale } = useI18n();
  const date = new Date(item.createdAt);
  const intlLocale = INTL_LOCALE[locale] ?? 'fr-FR';
  const timeStr = date.toLocaleTimeString(intlLocale, { hour: '2-digit', minute: '2-digit' });
  const dateStr = date.toLocaleDateString(intlLocale, { day: 'numeric', month: 'short' });
  const unread = !item.read;

  return (
    <PressableScale style={[styles.row, GLASS_CARD, unread && styles.rowUnread]} scaleTo={0.98} onPress={onPress}>
      <IconMedal icon={TYPE_ICON[item.type] ?? '🔔'} size={46} lit={unread} />
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, unread && styles.rowTitleUnread]} numberOfLines={2}>{item.title}</Text>
        {item.body ? <Text style={styles.rowText} numberOfLines={2}>{item.body}</Text> : null}
        <Text style={styles.rowTime}>{dateStr} · {timeStr}</Text>
      </View>
      {unread ? (
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.unreadDot} />
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list: { paddingHorizontal: spacing.md, paddingTop: spacing.xs, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  rowUnread: {
    backgroundColor: 'rgba(31,31,42,0.86)',
    borderColor: `${colors.brand}66`,
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  rowTitleUnread: { fontWeight: '900' },
  rowText: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  rowTime: { ...typography.label, color: colors.textMuted, marginTop: 3 },
  unreadDot: { width: 10, height: 10, borderRadius: 5 },
});
