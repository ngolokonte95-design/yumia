import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';

const API = API_BASE_URL;

interface FollowRequest {
  id: string;
  requester: { id: string; displayName: string; photoUrl?: string; bio?: string };
  createdAt: string;
}

export default function FollowRequestsScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [requests, setRequests] = useState<FollowRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const res = await fetch(`${API}/social/follow-requests`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) setRequests(await res.json() as FollowRequest[]);
    setLoading(false);
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const respond = async (requestId: string, accept: boolean) => {
    if (!accessToken) return;
    setProcessingId(requestId);
    await fetch(`${API}/social/follow-requests/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ accept }),
    });
    setRequests((prev) => prev.filter((r) => r.id !== requestId));
    setProcessingId(null);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.title}>Demandes d'abonnement</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: insets.bottom + 40 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyTitle}>Aucune demande en attente</Text>
              <Text style={styles.emptyText}>Les demandes d'abonnement apparaîtront ici.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isProcessing = processingId === item.id;
            return (
              <View style={styles.requestRow}>
                <Pressable onPress={() => router.push(`/user/${item.requester.id}` as never)}>
                  {item.requester.photoUrl ? (
                    <Image source={{ uri: item.requester.photoUrl }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarLetter}>{item.requester.displayName[0]}</Text>
                    </View>
                  )}
                </Pressable>
                <Pressable style={{ flex: 1 }} onPress={() => router.push(`/user/${item.requester.id}` as never)}>
                  <Text style={styles.name}>{item.requester.displayName}</Text>
                  {item.requester.bio ? <Text style={styles.bio} numberOfLines={1}>{item.requester.bio}</Text> : null}
                </Pressable>
                {isProcessing ? (
                  <ActivityIndicator color={colors.brand} />
                ) : (
                  <View style={styles.btnGroup}>
                    <Pressable style={styles.acceptBtn} onPress={() => void respond(item.id, true)}>
                      <Text style={styles.acceptTxt}>Confirmer</Text>
                    </Pressable>
                    <Pressable style={styles.rejectBtn} onPress={() => void respond(item.id, false)}>
                      <Text style={styles.rejectTxt}>Supprimer</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          }}
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
  requestRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#fff', fontWeight: '700', fontSize: 20 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  bio: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  btnGroup: { flexDirection: 'column', gap: 8 },
  acceptBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
  acceptTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  rejectBtn: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  rejectTxt: { color: colors.text, fontWeight: '600', fontSize: 13 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 52, marginBottom: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 40 },
});
