import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, Pressable,
  StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { API_BASE_URL } from '../../lib/config';

const API = API_BASE_URL;

interface UserProfile {
  id: string; displayName: string; photoUrl?: string; bio?: string;
  totalXp: number; level: number; followersCount: number;
  followingCount: number; visitCount: number; isFollowedByMe: boolean;
}

interface Post {
  id: string;
  mediaUrls: string[];
  likesCount: number;
  caption?: string;
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken, user: me } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [postsLoading, setPostsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    const h = { Authorization: `Bearer ${accessToken}` };
    const [profileRes, postsRes] = await Promise.allSettled([
      fetch(`${API}/social/users/${id}`, { headers: h }),
      fetch(`${API}/posts/user/${id}?limit=24`, { headers: h }),
    ]);
    if (profileRes.status === 'fulfilled' && profileRes.value.ok) {
      const data = await profileRes.value.json() as UserProfile;
      setProfile(data);
      setFollowing(data.isFollowedByMe);
    }
    if (postsRes.status === 'fulfilled' && postsRes.value.ok) {
      setPosts(await postsRes.value.json());
    }
    setLoading(false);
  }, [accessToken, id]);

  useEffect(() => { void load(); }, [load]);

  const toggleFollow = async () => {
    if (!accessToken || !id) return;
    const method = following ? 'DELETE' : 'POST';
    await fetch(`${API}/social/follow/${id}`, { method, headers: { Authorization: `Bearer ${accessToken}` } });
    setFollowing(!following);
    setProfile((p) => p ? { ...p, followersCount: p.followersCount + (following ? -1 : 1) } : p);
  };

  const openChat = async () => {
    if (!accessToken || !id) return;
    const res = await fetch(`${API}/chat/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ userId: id }),
    });
    if (res.ok) {
      const { id: convId } = await res.json() as { id: string };
      router.push(`/chat/${convId}`);
    }
  };

  if (loading) return <View style={[styles.center, { paddingTop: insets.top }]}><ActivityIndicator color={colors.brand} /></View>;
  if (!profile) return <View style={[styles.center, { paddingTop: insets.top }]}><Text style={{ color: colors.textMuted }}>Utilisateur introuvable</Text></View>;

  const isMe = me?.id === id;
  const GRID_SIZE = (370 - 4) / 3;

  const ListHeader = (
    <View>
      {/* Avatar + infos */}
      <View style={styles.profileTop}>
        {profile.photoUrl ? (
          <Image source={{ uri: profile.photoUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color: '#fff', fontSize: 32, fontWeight: '700' }}>{profile.displayName[0]}</Text>
          </View>
        )}
        <Text style={styles.name}>{profile.displayName}</Text>
        {profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{posts.length}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statVal}>{profile.followersCount}</Text>
            <Text style={styles.statLabel}>Abonnés</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statVal}>{profile.followingCount}</Text>
            <Text style={styles.statLabel}>Abonnements</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statVal}>{profile.visitCount}</Text>
            <Text style={styles.statLabel}>Visites</Text>
          </View>
        </View>

        <View style={styles.levelBadge}>
          <Text style={styles.levelText}>✨ Niveau {profile.level} · {profile.totalXp} XP</Text>
        </View>

        {/* Actions */}
        {!isMe && (
          <View style={styles.actions}>
            <Pressable style={[styles.followBtn, following && styles.followBtnActive]} onPress={toggleFollow}>
              <Text style={[styles.followBtnText, following && styles.followBtnTextActive]}>
                {following ? 'Abonné ✓' : 'Suivre'}
              </Text>
            </Pressable>
            <Pressable style={styles.chatBtn} onPress={openChat}>
              <Text style={styles.chatBtnText}>💬 Message</Text>
            </Pressable>
          </View>
        )}
        {isMe && (
          <Pressable style={styles.editBtn} onPress={() => router.push('/post/create')}>
            <Text style={styles.editBtnText}>📷 Nouvelle publication</Text>
          </Pressable>
        )}
      </View>

      {/* Grid title */}
      {posts.length > 0 && (
        <View style={styles.gridHeader}>
          <Text style={styles.gridTitle}>Publications</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>←</Text></Pressable>
      </View>

      <FlatList
        data={posts}
        numColumns={3}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={ListHeader}
        renderItem={({ item }) => (
          <Pressable style={[styles.gridItem, { width: GRID_SIZE, height: GRID_SIZE }]} onPress={() => router.push(`/post/${item.id}`)}>
            {item.mediaUrls[0] ? (
              <Image source={{ uri: item.mediaUrls[0] }} style={{ width: GRID_SIZE, height: GRID_SIZE }} />
            ) : (
              <View style={[{ width: GRID_SIZE, height: GRID_SIZE }, styles.gridPlaceholder]}>
                <Text style={{ fontSize: 20 }}>📷</Text>
              </View>
            )}
            {item.likesCount > 0 && (
              <View style={styles.gridOverlay}>
                <Text style={styles.gridOverlayText}>❤️ {item.likesCount}</Text>
              </View>
            )}
          </Pressable>
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📷</Text>
            <Text style={styles.emptyText}>Aucune publication</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: spacing.md, paddingVertical: 12 },
  back: { fontSize: 22, color: colors.brand },
  profileTop: { alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.md },
  avatar: { width: 90, height: 90, borderRadius: 45, marginBottom: 12 },
  name: { ...typography.h2, color: colors.text, marginBottom: 6 },
  bio: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 16, paddingHorizontal: spacing.lg },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  stat: { alignItems: 'center', paddingHorizontal: 14 },
  statVal: { ...typography.h2, color: colors.text },
  statLabel: { fontSize: 11, color: colors.textMuted },
  statDivider: { width: 1, height: 32, backgroundColor: colors.border },
  levelBadge: { backgroundColor: colors.brand + '22', borderRadius: radius.full, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 20 },
  levelText: { color: colors.brand, fontWeight: '700', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 12, width: '100%' },
  followBtn: { flex: 1, backgroundColor: colors.brand, borderRadius: radius.lg, paddingVertical: 12, alignItems: 'center' },
  followBtnActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  followBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  followBtnTextActive: { color: colors.text },
  chatBtn: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  chatBtnText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  editBtn: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: 24, borderWidth: 1, borderColor: colors.border },
  editBtnText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  gridHeader: { paddingHorizontal: spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  gridTitle: { ...typography.h3, color: colors.text },
  gridItem: { margin: 1, position: 'relative' },
  gridPlaceholder: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  gridOverlay: { position: 'absolute', bottom: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  gridOverlayText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyEmoji: { fontSize: 36, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted },
});
