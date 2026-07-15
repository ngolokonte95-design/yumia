/**
 * Amis proches / Favoris — deux listes gérées par le même écran (param `type`).
 *  - type=close-friends : GET /social/close-friends, POST/DELETE /social/close-friends/:userId
 *  - type=favorites     : GET /social/favorites,     POST/DELETE /social/favorites/:userId
 * L'ajout se fait depuis la liste des personnes que je suis (following).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';

const API = API_BASE_URL;

interface SimpleUser {
  id: string;
  displayName: string;
  photoUrl?: string | null;
  bio?: string | null;
}

export default function CloseFriendsScreen() {
  const { accessToken, user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { type } = useLocalSearchParams<{ type?: string }>();
  const isFavorites = type === 'favorites';

  const basePath = isFavorites ? 'favorites' : 'close-friends';
  const title = isFavorites ? 'Favoris' : 'Amis proches';
  const emptyIcon = isFavorites ? '⭐' : '🟢';
  const emptyText = isFavorites
    ? 'Les publications de vos favoris sont mises en avant dans votre fil.'
    : 'Vos amis proches voient vos stories réservées au cercle proche.';

  const [members, setMembers] = useState<SimpleUser[]>([]);
  const [following, setFollowing] = useState<SimpleUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);

  const load = useCallback(async () => {
    if (!accessToken || !user) return;
    try {
      const [listRes, followingRes] = await Promise.all([
        fetch(`${API}/social/${basePath}`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch(`${API}/social/users/${user.id}/following`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      ]);
      if (listRes.ok) setMembers(await listRes.json() as SimpleUser[]);
      if (followingRes.ok) setFollowing(await followingRes.json() as SimpleUser[]);
    } catch {
      // réseau — listes vides, retour possible
    }
    setLoading(false);
  }, [accessToken, user, basePath]);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (target: SimpleUser) => {
    if (!accessToken) return;
    const isMember = memberIds.has(target.id);
    setProcessingId(target.id);
    try {
      const res = await fetch(`${API}/social/${basePath}/${target.id}`, {
        method: isMember ? 'DELETE' : 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        setMembers((prev) => (isMember ? prev.filter((m) => m.id !== target.id) : [...prev, target]));
      }
    } catch {
      // best-effort
    }
    setProcessingId(null);
  };

  // Membres en tête, puis le reste des abonnements (candidats à l'ajout).
  const rows = useMemo(() => {
    const others = following.filter((f) => !memberIds.has(f.id));
    return [...members, ...others];
  }, [members, following, memberIds]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: insets.bottom + 40 }}
          ListHeaderComponent={
            members.length > 0 ? (
              <Text style={styles.count}>{members.length} {members.length > 1 ? 'personnes' : 'personne'}</Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>{emptyIcon}</Text>
              <Text style={styles.emptyTitle}>Personne pour l'instant</Text>
              <Text style={styles.emptyText}>{emptyText}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMember = memberIds.has(item.id);
            return (
              <View style={styles.row}>
                <Pressable onPress={() => router.push(`/user/${item.id}` as never)}>
                  {item.photoUrl ? (
                    <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarLetter}>{item.displayName[0]}</Text>
                    </View>
                  )}
                </Pressable>
                <Pressable style={{ flex: 1 }} onPress={() => router.push(`/user/${item.id}` as never)}>
                  <Text style={styles.name}>{item.displayName}</Text>
                  {item.bio ? <Text style={styles.bio} numberOfLines={1}>{item.bio}</Text> : null}
                </Pressable>
                {processingId === item.id ? (
                  <ActivityIndicator color={colors.brand} />
                ) : (
                  <Pressable
                    style={isMember ? styles.removeBtn : styles.addBtn}
                    onPress={() => void toggle(item)}
                  >
                    <Text style={isMember ? styles.removeTxt : styles.addTxt}>
                      {isMember ? 'Retirer' : 'Ajouter'}
                    </Text>
                  </Pressable>
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
  count: { fontSize: 13, color: colors.textMuted, paddingHorizontal: spacing.md, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#fff', fontWeight: '700', fontSize: 18 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  bio: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  addBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 },
  addTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  removeBtn: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  removeTxt: { color: colors.text, fontWeight: '600', fontSize: 13 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 52, marginBottom: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 40 },
});
