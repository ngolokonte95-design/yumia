/**
 * Comptes bloqués — liste les utilisateurs bloqués et permet de les débloquer.
 * Backend : GET /social/blocked, DELETE /social/block/:userId.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';

const API = API_BASE_URL;

interface BlockedUser {
  id: string;
  displayName: string;
  photoUrl?: string | null;
}

export default function BlockedScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${API}/social/blocked`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) setUsers(await res.json() as BlockedUser[]);
    } catch {
      // réseau — la liste reste vide, l'utilisateur peut revenir
    }
    setLoading(false);
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const unblock = async (userId: string) => {
    if (!accessToken) return;
    setProcessingId(userId);
    try {
      const res = await fetch(`${API}/social/block/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch {
      // best-effort
    }
    setProcessingId(null);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.title}>Comptes bloqués</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: insets.bottom + 40 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🚫</Text>
              <Text style={styles.emptyTitle}>Aucun compte bloqué</Text>
              <Text style={styles.emptyText}>Les comptes que vous bloquez apparaîtront ici.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              {item.photoUrl ? (
                <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarLetter}>{item.displayName[0]}</Text>
                </View>
              )}
              <Text style={styles.name}>{item.displayName}</Text>
              {processingId === item.id ? (
                <ActivityIndicator color={colors.brand} />
              ) : (
                <Pressable style={styles.unblockBtn} onPress={() => void unblock(item.id)}>
                  <Text style={styles.unblockTxt}>Débloquer</Text>
                </Pressable>
              )}
            </View>
          )}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#fff', fontWeight: '700', fontSize: 18 },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  unblockBtn: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  unblockTxt: { color: colors.text, fontWeight: '600', fontSize: 13 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 52, marginBottom: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 40 },
});
