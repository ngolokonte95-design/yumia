import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, radius, spacing, typography } from '../../theme/tokens';

const API = process.env.EXPO_PUBLIC_API_URL ?? '';

interface Conversation {
  id: string;
  otherUser: { id: string; displayName: string; photoUrl?: string } | null;
  lastMessage: { content: string; senderId: string; createdAt: string } | null;
  updatedAt: string;
}

function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'maintenant';
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}j`;
}

export default function ChatListScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const res = await fetch(`${API}/chat/conversations`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) setConversations(await res.json());
    setLoading(false);
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.title}>Messages</Text>
        <Pressable onPress={() => router.push('/(tabs)/social')}>
          <Text style={styles.newBtn}>+</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <Pressable style={styles.convRow} onPress={() => router.push(`/chat/${item.id}`)}>
              {item.otherUser?.photoUrl ? (
                <Image source={{ uri: item.otherUser.photoUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>
                    {(item.otherUser?.displayName ?? '?')[0]}
                  </Text>
                </View>
              )}
              <View style={styles.convBody}>
                <View style={styles.convTop}>
                  <Text style={styles.convName}>{item.otherUser?.displayName ?? 'Inconnu'}</Text>
                  <Text style={styles.convTime}>{formatAgo(item.updatedAt)}</Text>
                </View>
                <Text style={styles.convLast} numberOfLines={1}>
                  {item.lastMessage?.content ?? 'Nouvelle conversation'}
                </Text>
              </View>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>💬</Text>
              <Text style={styles.emptyTitle}>Aucun message</Text>
              <Text style={styles.emptyText}>Va sur un profil et envoie un message !</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { fontSize: 22, color: colors.brand },
  title: { ...typography.h2, color: colors.text },
  newBtn: { fontSize: 26, color: colors.brand, fontWeight: '300' },
  convRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  convBody: { flex: 1 },
  convTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  convName: { fontWeight: '700', color: colors.text, fontSize: 15 },
  convTime: { fontSize: 12, color: colors.textMuted },
  convLast: { fontSize: 14, color: colors.textMuted },
  separator: { height: 1, backgroundColor: colors.border, marginLeft: 76 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { ...typography.h3, color: colors.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted },
});
