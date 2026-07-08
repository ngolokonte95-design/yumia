import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, radius, spacing, typography } from '../../theme/tokens';

const API = process.env.EXPO_PUBLIC_API_URL ?? '';

interface StoryGroup {
  user: { id: string; displayName: string; photoUrl?: string };
  stories: Array<{ id: string; mediaUrl: string; caption?: string; seen: boolean }>;
  hasUnseen: boolean;
}

interface FeedItem {
  id: string;
  userId: string;
  user: { displayName: string; photoUrl?: string };
  place: { id: string; name: string; universe: string; city?: string; photoUrls: string[] };
  visitedAt: string;
}

function StoriesBar({ stories, onPress }: { stories: StoryGroup[]; onPress: (group: StoryGroup) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storiesBar} contentContainerStyle={{ paddingHorizontal: spacing.md }}>
      {stories.map((group) => (
        <Pressable key={group.user.id} style={styles.storyItem} onPress={() => onPress(group)}>
          <View style={[styles.storyRing, group.hasUnseen && styles.storyRingActive]}>
            {group.user.photoUrl ? (
              <Image source={{ uri: group.user.photoUrl }} style={styles.storyAvatar} />
            ) : (
              <View style={[styles.storyAvatar, { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                  {group.user.displayName[0].toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.storyName} numberOfLines={1}>{group.user.displayName.split(' ')[0]}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function FeedCard({ item, onPress }: { item: FeedItem; onPress: () => void }) {
  const thumb = item.place.photoUrls?.[0];
  const ago = formatAgo(item.visitedAt);
  return (
    <Pressable style={styles.feedCard} onPress={onPress}>
      {thumb ? (
        <Image source={{ uri: thumb }} style={styles.feedThumb} />
      ) : (
        <View style={[styles.feedThumb, { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ fontSize: 32 }}>📍</Text>
        </View>
      )}
      <View style={styles.feedBody}>
        <View style={styles.feedUser}>
          {item.user.photoUrl ? (
            <Image source={{ uri: item.user.photoUrl }} style={styles.feedAvatar} />
          ) : (
            <View style={[styles.feedAvatar, { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{item.user.displayName[0]}</Text>
            </View>
          )}
          <View>
            <Text style={styles.feedUserName}>{item.user.displayName}</Text>
            <Text style={styles.feedMeta}>{ago}</Text>
          </View>
        </View>
        <Text style={styles.feedPlaceName}>{item.place.name}</Text>
        <Text style={styles.feedCity}>{item.place.city ?? ''} · {item.place.universe}</Text>
      </View>
    </Pressable>
  );
}

function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'À l\'instant';
  if (m < 60) return `Il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Il y a ${h}h`;
  return `Il y a ${Math.floor(h / 24)}j`;
}

export default function SocialTab() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; displayName: string; photoUrl?: string; bio?: string }>>([]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [storiesRes, feedRes] = await Promise.allSettled([
      fetch(`${API}/stories/feed`, { headers }),
      fetch(`${API}/social/feed`, { headers }),
    ]);
    if (storiesRes.status === 'fulfilled' && storiesRes.value.ok) {
      setStories(await storiesRes.value.json());
    }
    if (feedRes.status === 'fulfilled' && feedRes.value.ok) {
      setFeed(await feedRes.value.json());
    }
    setLoading(false);
    setRefreshing(false);
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!search.trim()) { setSearchResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      const res = await fetch(`${API}/social/users/search?q=${encodeURIComponent(search)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) setSearchResults(await res.json());
    }, 350);
  }, [search, accessToken]);

  if (loading) {
    return <View style={[styles.center, { paddingTop: insets.top }]}><ActivityIndicator color={colors.brand} /></View>;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Social</Text>
        <Pressable onPress={() => router.push('/nearby-users')} style={styles.nearbyBtn}>
          <Text style={styles.nearbyBtnText}>📍 Nearby</Text>
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher des utilisateurs..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {search.trim() ? (
        <FlatList
          data={searchResults}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => (
            <Pressable style={styles.userRow} onPress={() => router.push(`/user/${item.id}`)}>
              {item.photoUrl ? (
                <Image source={{ uri: item.photoUrl }} style={styles.userAvatar} />
              ) : (
                <View style={[styles.userAvatar, { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{item.displayName[0]}</Text>
                </View>
              )}
              <View>
                <Text style={styles.userName}>{item.displayName}</Text>
                {item.bio ? <Text style={styles.userBio} numberOfLines={1}>{item.bio}</Text> : null}
              </View>
            </Pressable>
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        />
      ) : (
        <FlatList
          data={feed}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            stories.length > 0 ? (
              <StoriesBar stories={stories} onPress={(g) => router.push(`/story-viewer?userId=${g.user.id}`)} />
            ) : null
          }
          renderItem={({ item }) => (
            <FeedCard item={item} onPress={() => router.push(`/place?id=${item.place.id}`)} />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>👥</Text>
              <Text style={styles.emptyTitle}>Suis des gens pour voir leur activité</Text>
              <Text style={styles.emptyText}>Recherche des utilisateurs ci-dessus ou explore les lieux proches.</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  title: { ...typography.h2, color: colors.text },
  nearbyBtn: { backgroundColor: colors.brand + '22', borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  nearbyBtnText: { color: colors.brand, fontWeight: '700', fontSize: 13 },
  searchWrap: { marginHorizontal: spacing.md, marginBottom: spacing.sm },
  searchInput: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12,
    color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border,
  },
  storiesBar: { marginBottom: spacing.sm },
  storyItem: { alignItems: 'center', marginRight: 14, width: 66 },
  storyRing: {
    width: 62, height: 62, borderRadius: 31,
    borderWidth: 2, borderColor: colors.border,
    padding: 2, marginBottom: 4,
  },
  storyRingActive: { borderColor: colors.brand },
  storyAvatar: { width: 54, height: 54, borderRadius: 27 },
  storyName: { fontSize: 11, color: colors.text, textAlign: 'center' },
  feedCard: { marginHorizontal: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  feedThumb: { width: '100%', height: 180 },
  feedBody: { padding: spacing.sm },
  feedUser: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  feedAvatar: { width: 32, height: 32, borderRadius: 16 },
  feedUserName: { fontWeight: '700', color: colors.text, fontSize: 14 },
  feedMeta: { fontSize: 12, color: colors.textMuted },
  feedPlaceName: { ...typography.h3, color: colors.text, marginBottom: 2 },
  feedCity: { fontSize: 13, color: colors.textMuted },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 10 },
  userAvatar: { width: 44, height: 44, borderRadius: 22 },
  userName: { fontWeight: '700', color: colors.text, fontSize: 15 },
  userBio: { fontSize: 13, color: colors.textMuted, maxWidth: 240 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { ...typography.h3, color: colors.text, textAlign: 'center', marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
