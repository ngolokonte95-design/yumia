import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, Pressable,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { socialApi } from '../../lib/social-api';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type FollowUser = {
  id: string;
  displayName: string;
  photoUrl?: string | null;
  bio?: string | null;
  level: number;
};

export default function FollowListScreen() {
  const { userId, type } = useLocalSearchParams<{ userId: string; type: 'followers' | 'following' }>();
  const { accessToken, user: me } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [users, setUsers] = useState<FollowUser[]>([]);
  const [filtered, setFiltered] = useState<FollowUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState<Set<string>>(new Set());

  const isFollowers = type === 'followers';
  const title = isFollowers ? 'Abonnés' : 'Abonnements';

  const load = useCallback(async () => {
    if (!accessToken || !userId) return;
    const list = isFollowers
      ? await socialApi.getFollowers(accessToken, userId)
      : await socialApi.getFollowing(accessToken, userId);
    setUsers(list);
    setFiltered(list);

    // check qui on suit parmi la liste
    const myFollowing = await socialApi.getFollowing(accessToken, me?.id ?? '');
    setFollowing(new Set(myFollowing.map((u) => u.id)));
    setLoading(false);
  }, [accessToken, userId, isFollowers, me?.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!search.trim()) { setFiltered(users); return; }
    const q = search.toLowerCase();
    setFiltered(users.filter((u) => u.displayName.toLowerCase().includes(q)));
  }, [search, users]);

  const toggleFollow = async (targetId: string) => {
    if (!accessToken) return;
    if (following.has(targetId)) {
      await socialApi.unfollow(accessToken, targetId);
      setFollowing((prev) => { const s = new Set(prev); s.delete(targetId); return s; });
    } else {
      await socialApi.follow(accessToken, targetId);
      setFollowing((prev) => new Set([...prev, targetId]));
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher..."
          placeholderTextColor={colors.textMuted}
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.empty}>Aucun résultat</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMe = item.id === me?.id;
            const isFollowed = following.has(item.id);
            return (
              <Pressable
                style={styles.row}
                onPress={() => router.push(`/user/${item.id}` as never)}
              >
                {item.photoUrl ? (
                  <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarLetter}>{item.displayName[0]?.toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.info}>
                  <Text style={styles.name}>{item.displayName}</Text>
                  {item.bio ? (
                    <Text style={styles.bio} numberOfLines={1}>{item.bio}</Text>
                  ) : (
                    <Text style={styles.level}>✨ Niveau {item.level}</Text>
                  )}
                </View>
                {!isMe && (
                  <Pressable
                    style={[styles.followBtn, isFollowed && styles.followBtnActive]}
                    onPress={() => void toggleFollow(item.id)}
                  >
                    <Text style={[styles.followTxt, isFollowed && styles.followTxtActive]}>
                      {isFollowed ? 'Abonné' : 'Suivre'}
                    </Text>
                  </Pressable>
                )}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: { fontSize: 22, color: colors.brand, width: 32 },
  title: { ...typography.h2, color: colors.text },
  searchWrap: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  empty: { color: colors.textMuted, fontSize: 15 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
  avatarFallback: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#fff', fontSize: 20, fontWeight: '700' },
  info: { flex: 1 },
  name: { ...typography.body, color: colors.text, fontWeight: '700' },
  bio: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  level: { fontSize: 12, color: colors.brand, marginTop: 2 },
  followBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  followBtnActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  followTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  followTxtActive: { color: colors.text },
});
