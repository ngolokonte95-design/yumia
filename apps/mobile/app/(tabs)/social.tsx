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

type Tab = 'posts' | 'activity' | 'encounters';

interface StoryGroup {
  user: { id: string; displayName: string; photoUrl?: string };
  stories: Array<{ id: string; mediaUrl: string; seen: boolean }>;
  hasUnseen: boolean;
}

interface Post {
  id: string;
  userId: string;
  caption?: string;
  mediaUrls: string[];
  likesCount: number;
  likedByMe: boolean;
  createdAt: string;
  user: { id: string; displayName: string; photoUrl?: string } | null;
  place?: { name: string; city?: string } | null;
}

interface FeedItem {
  id: string; userId: string;
  user: { displayName: string; photoUrl?: string };
  place: { id: string; name: string; universe: string; city?: string; photoUrls: string[] };
  visitedAt: string;
}

interface Encounter {
  id: string; seenAt: string;
  otherUser: { id: string; displayName: string; photoUrl?: string; bio?: string; level: number } | null;
  place: { id: string; name: string; universe: string; city?: string } | null;
}

function formatAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'À l\'instant';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}j`;
}

// ── Stories bar ────────────────────────────────────────────────────────────────

function StoriesBar({ stories, onPress }: { stories: StoryGroup[]; onPress: (g: StoryGroup) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }} contentContainerStyle={{ paddingHorizontal: spacing.md }}>
      {stories.map((group) => (
        <Pressable key={group.user.id} style={styles.storyItem} onPress={() => onPress(group)}>
          <View style={[styles.storyRing, group.hasUnseen && styles.storyRingActive]}>
            {group.user.photoUrl ? (
              <Image source={{ uri: group.user.photoUrl }} style={styles.storyAvatar} />
            ) : (
              <View style={[styles.storyAvatar, { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{group.user.displayName[0]}</Text>
              </View>
            )}
          </View>
          <Text style={styles.storyName} numberOfLines={1}>{group.user.displayName.split(' ')[0]}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// ── Post card (Instagram-style) ────────────────────────────────────────────────

function PostCard({ item, onLike, onPress, onUserPress }: {
  item: Post;
  onLike: (id: string) => void;
  onPress: (id: string) => void;
  onUserPress: (id: string) => void;
}) {
  return (
    <View style={styles.postCard}>
      {/* Author */}
      <Pressable style={styles.postAuthor} onPress={() => item.user && onUserPress(item.user.id)}>
        {item.user?.photoUrl ? (
          <Image source={{ uri: item.user.photoUrl }} style={styles.postAvatar} />
        ) : (
          <View style={[styles.postAvatar, { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{item.user?.displayName[0]}</Text>
          </View>
        )}
        <View>
          <Text style={styles.postAuthorName}>{item.user?.displayName}</Text>
          {item.place && <Text style={styles.postPlace}>📍 {item.place.name}</Text>}
        </View>
        <Text style={styles.postAgo}>{formatAgo(item.createdAt)}</Text>
      </Pressable>

      {/* Image */}
      {item.mediaUrls[0] && (
        <Pressable onPress={() => onPress(item.id)}>
          <Image source={{ uri: item.mediaUrls[0] }} style={styles.postImage} />
          {item.mediaUrls.length > 1 && (
            <View style={styles.multiIndicator}>
              <Text style={styles.multiIndicatorText}>1/{item.mediaUrls.length}</Text>
            </View>
          )}
        </Pressable>
      )}

      {/* Actions */}
      <View style={styles.postActions}>
        <Pressable style={styles.postLike} onPress={() => onLike(item.id)}>
          <Text style={{ fontSize: 22 }}>{item.likedByMe ? '❤️' : '🤍'}</Text>
          <Text style={styles.postLikeCount}>{item.likesCount}</Text>
        </Pressable>
        <Pressable onPress={() => onPress(item.id)}>
          <Text style={{ fontSize: 22 }}>💬</Text>
        </Pressable>
      </View>

      {item.caption ? (
        <Text style={styles.postCaption} numberOfLines={2}>
          <Text style={{ fontWeight: '700' }}>{item.user?.displayName} </Text>
          {item.caption}
        </Text>
      ) : null}
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function SocialTab() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('posts');
  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; displayName: string; photoUrl?: string; bio?: string }>>([]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const h = { Authorization: `Bearer ${accessToken}` };
    const [storiesRes, postsRes, feedRes, encountersRes] = await Promise.allSettled([
      fetch(`${API}/stories/feed`, { headers: h }),
      fetch(`${API}/posts/feed?limit=20`, { headers: h }),
      fetch(`${API}/social/feed`, { headers: h }),
      fetch(`${API}/discover/encounters`, { headers: h }),
    ]);
    if (storiesRes.status === 'fulfilled' && storiesRes.value.ok) setStories(await storiesRes.value.json());
    if (postsRes.status === 'fulfilled' && postsRes.value.ok) setPosts(await postsRes.value.json());
    if (feedRes.status === 'fulfilled' && feedRes.value.ok) setFeed(await feedRes.value.json());
    if (encountersRes.status === 'fulfilled' && encountersRes.value.ok) setEncounters(await encountersRes.value.json());
    setLoading(false);
    setRefreshing(false);
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!search.trim()) { setSearchResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      const res = await fetch(`${API}/social/users/search?q=${encodeURIComponent(search)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) setSearchResults(await res.json());
    }, 350);
  }, [search, accessToken]);

  const toggleLike = async (postId: string) => {
    const res = await fetch(`${API}/posts/${postId}/like`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) {
      const data = await res.json() as { liked: boolean; likesCount: number };
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, likedByMe: data.liked, likesCount: data.likesCount } : p));
    }
  };

  if (loading) return <View style={[styles.center, { paddingTop: insets.top }]}><ActivityIndicator color={colors.brand} /></View>;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Social</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push('/social-profile')} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>👤 Mon profil</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/discover-people')} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>🔍 Découvrir</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/nearby-users')} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>🗺️ Carte</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/meetup')} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>🌃 Meetups</Text>
          </Pressable>
        </View>
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
        {!search && (
          <Pressable style={styles.postCreateBtn} onPress={() => router.push('/post/create')}>
            <Text style={styles.postCreateTxt}>📷</Text>
          </Pressable>
        )}
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
        <>
          {/* Tabs */}
          <View style={styles.tabs}>
            {(['posts', 'activity', 'encounters'] as Tab[]).map((t) => (
              <Pressable key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)}>
                <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>
                  {t === 'posts' ? '📸 Posts' : t === 'activity' ? '🏃 Activité' : '⚡ Rencontres'}
                </Text>
              </Pressable>
            ))}
          </View>

          {tab === 'posts' && (
            <FlatList
              data={posts}
              keyExtractor={(p) => p.id}
              ListHeaderComponent={stories.length > 0 ? <StoriesBar stories={stories} onPress={(g) => router.push(`/story-viewer?userId=${g.user.id}`)} /> : null}
              renderItem={({ item }) => (
                <PostCard
                  item={item}
                  onLike={toggleLike}
                  onPress={(id) => router.push(`/post/${id}`)}
                  onUserPress={(id) => router.push(`/user/${id}`)}
                />
              )}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} />}
              contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyEmoji}>📸</Text>
                  <Text style={styles.emptyTitle}>Aucune publication</Text>
                  <Text style={styles.emptyText}>Suis des gens ou publie ta première photo !</Text>
                  <Pressable style={styles.emptyBtn} onPress={() => router.push('/post/create')}>
                    <Text style={styles.emptyBtnText}>Publier une photo</Text>
                  </Pressable>
                </View>
              }
            />
          )}

          {tab === 'activity' && (
            <FlatList
              data={feed}
              keyExtractor={(i) => i.id}
              ListHeaderComponent={stories.length > 0 ? <StoriesBar stories={stories} onPress={(g) => router.push(`/story-viewer?userId=${g.user.id}`)} /> : null}
              renderItem={({ item }) => (
                <Pressable style={styles.feedCard} onPress={() => router.push(`/place?id=${item.place.id}`)}>
                  {item.place.photoUrls?.[0] ? (
                    <Image source={{ uri: item.place.photoUrls[0] }} style={styles.feedThumb} />
                  ) : (
                    <View style={[styles.feedThumb, { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ fontSize: 28 }}>📍</Text>
                    </View>
                  )}
                  <View style={styles.feedBody}>
                    <Text style={styles.feedUser}>{item.user.displayName} · {formatAgo(item.visitedAt)}</Text>
                    <Text style={styles.feedPlace}>{item.place.name}</Text>
                    <Text style={styles.feedCity}>{item.place.city ?? ''}</Text>
                  </View>
                </Pressable>
              )}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} />}
              contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyEmoji}>🏃</Text>
                  <Text style={styles.emptyTitle}>Pas d'activité</Text>
                  <Text style={styles.emptyText}>Suis des utilisateurs pour voir ce qu'ils font.</Text>
                </View>
              }
            />
          )}

          {tab === 'encounters' && (
            <FlatList
              data={encounters}
              keyExtractor={(e) => e.id}
              contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 80 }}
              renderItem={({ item }) => (
                <Pressable style={styles.encounterCard} onPress={() => item.otherUser && router.push(`/user/${item.otherUser.id}`)}>
                  <View style={[styles.encounterAvatar, { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }]}>
                    {item.otherUser?.photoUrl ? (
                      <Image source={{ uri: item.otherUser.photoUrl }} style={styles.encounterAvatar} />
                    ) : (
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>{item.otherUser?.displayName[0]}</Text>
                    )}
                  </View>
                  <View style={styles.encounterInfo}>
                    <Text style={styles.encounterName}>{item.otherUser?.displayName}</Text>
                    <Text style={styles.encounterPlace}>📍 {item.place?.name ?? '?'}</Text>
                    <Text style={styles.encounterTime}>⚡ Croisé il y a {formatAgo(item.seenAt)}</Text>
                  </View>
                  <Text style={styles.encounterLevel}>Niv. {item.otherUser?.level}</Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyEmoji}>⚡</Text>
                  <Text style={styles.emptyTitle}>Aucune rencontre</Text>
                  <Text style={styles.emptyText}>Rends-toi dans des lieux pour croiser d'autres utilisateurs Yumia !</Text>
                </View>
              }
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: spacing.md, paddingTop: 4, paddingBottom: 8 },
  title: { ...typography.h2, color: colors.text, marginBottom: 8 },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: { backgroundColor: colors.surface, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  headerBtnText: { fontSize: 12, color: colors.text, fontWeight: '600' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.md, marginBottom: spacing.sm, gap: 8 },
  searchInput: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12, color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border },
  postCreateBtn: { backgroundColor: colors.brand, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  postCreateTxt: { fontSize: 20 },
  tabs: { flexDirection: 'row', marginHorizontal: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.md },
  tabBtnActive: { backgroundColor: colors.background },
  tabBtnText: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  tabBtnTextActive: { color: colors.brand, fontWeight: '700' },
  storyItem: { alignItems: 'center', marginRight: 14, width: 66 },
  storyRing: { width: 62, height: 62, borderRadius: 31, borderWidth: 2, borderColor: colors.border, padding: 2, marginBottom: 4 },
  storyRingActive: { borderColor: colors.brand },
  storyAvatar: { width: 54, height: 54, borderRadius: 27 },
  storyName: { fontSize: 11, color: colors.text, textAlign: 'center' },
  postCard: { backgroundColor: colors.surface, marginBottom: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  postAuthor: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, gap: 10 },
  postAvatar: { width: 36, height: 36, borderRadius: 18 },
  postAuthorName: { fontWeight: '700', color: colors.text, fontSize: 13 },
  postPlace: { fontSize: 11, color: colors.textMuted },
  postAgo: { marginLeft: 'auto', fontSize: 12, color: colors.textMuted },
  postImage: { width: '100%', aspectRatio: 1 },
  multiIndicator: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  multiIndicatorText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  postActions: { flexDirection: 'row', gap: 16, padding: spacing.sm, alignItems: 'center' },
  postLike: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  postLikeCount: { fontWeight: '700', color: colors.text, fontSize: 14 },
  postCaption: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, fontSize: 13, color: colors.text, lineHeight: 18 },
  feedCard: { flexDirection: 'row', marginHorizontal: spacing.md, marginBottom: 8, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  feedThumb: { width: 70, height: 70 },
  feedBody: { flex: 1, padding: spacing.sm, justifyContent: 'center' },
  feedUser: { fontSize: 12, color: colors.textMuted, marginBottom: 2 },
  feedPlace: { fontWeight: '700', color: colors.text, fontSize: 14 },
  feedCity: { fontSize: 12, color: colors.textMuted },
  encounterCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.xl, marginBottom: 10, padding: spacing.md, gap: 12, borderWidth: 1, borderColor: colors.border },
  encounterAvatar: { width: 52, height: 52, borderRadius: 26 },
  encounterInfo: { flex: 1 },
  encounterName: { fontWeight: '700', color: colors.text, fontSize: 15, marginBottom: 2 },
  encounterPlace: { fontSize: 13, color: colors.textMuted, marginBottom: 2 },
  encounterTime: { fontSize: 12, color: colors.brand },
  encounterLevel: { fontSize: 12, color: colors.textMuted },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 10 },
  userAvatar: { width: 44, height: 44, borderRadius: 22 },
  userName: { fontWeight: '700', color: colors.text, fontSize: 15 },
  userBio: { fontSize: 13, color: colors.textMuted, maxWidth: 240 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { ...typography.h3, color: colors.text, textAlign: 'center', marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  emptyBtn: { backgroundColor: colors.brand, borderRadius: radius.lg, paddingHorizontal: 24, paddingVertical: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
