/**
 * NOTIFICATION CENTER — historique des notifications push reçues.
 * Les données sont stockées localement dans SecureStore par le listener
 * démarré dans _layout.tsx.
 */
import { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useNotificationHistory } from '../lib/useNotificationHistory';
import type { StoredNotification } from '../lib/useNotificationHistory';

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { items, markAllRead } = useNotificationHistory();

  useEffect(() => {
    void markAllRead();
  }, [markAllRead]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
      </View>

      {items.length === 0 ? (
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
          renderItem={({ item }) => <NotifRow item={item} />}
        />
      )}
    </View>
  );
}

function NotifRow({ item }: { item: StoredNotification }) {
  const date = new Date(item.receivedAt);
  const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const dateStr = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

  return (
    <View style={[styles.row, !item.read && styles.rowUnread]}>
      <View style={styles.iconBox}>
        <Text style={styles.icon}>🔔</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{item.title}</Text>
        {item.body ? <Text style={styles.rowBody} numberOfLines={2}>{item.body}</Text> : null}
        <Text style={styles.rowTime}>{dateStr} · {timeStr}</Text>
      </View>
      {!item.read ? <View style={styles.unreadDot} /> : null}
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
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs },
  backText: { ...typography.heading, color: colors.brandSoft, fontSize: 22 },
  title: { ...typography.heading, color: colors.textPrimary },

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
