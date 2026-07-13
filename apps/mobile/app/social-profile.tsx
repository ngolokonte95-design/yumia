import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Dimensions, FlatList, Image, Modal, Pressable,
  ScrollView, Share, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';
import { feedApi, type StoryHighlight } from '../lib/feed-api';

const API = API_BASE_URL;
const { width: SCREEN_W } = Dimensions.get('window');
const GRID_ITEM = (SCREEN_W - 3) / 3;

type ProfileTab = 'grid' | 'reels' | 'reposts' | 'tagged';

interface Post {
  id: string;
  mediaUrls: string[];
  likesCount: number;
  caption?: string;
  mediaType?: 'photo' | 'video';
}

interface SocialStats {
  followersCount: number;
  followingCount: number;
  visitCount: number;
  isPrivate?: boolean;
}

interface Suggestion {
  id: string;
  displayName: string;
  photoUrl?: string;
  bio?: string;
}

export default function SocialProfileScreen() {
  const { user, accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [socialStats, setSocialStats] = useState<SocialStats | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [highlights, setHighlights] = useState<StoryHighlight[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeHighlight, setActiveHighlight] = useState<StoryHighlight | null>(null);
  const [profileTab, setProfileTab] = useState<ProfileTab>('grid');
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  const photoUrl = user?.photoUrl
    ? (user.photoUrl.startsWith('http') ? user.photoUrl : `${API}${user.photoUrl}`)
    : null;
  const displayName = user?.displayName ?? 'Moi';
  const bio = user?.bio ?? '';

  const load = useCallback(async () => {
    if (!accessToken || !user?.id) return;
    const h = { Authorization: `Bearer ${accessToken}` };
    const [profileRes, postsRes, highlightsRes, suggestionsRes] = await Promise.allSettled([
      fetch(`${API}/social/users/${user.id}`, { headers: h }),
      fetch(`${API}/posts/user/${user.id}?limit=30`, { headers: h }),
      feedApi.getHighlights(accessToken, user.id),
      fetch(`${API}/social/users?limit=6`, { headers: h }),
    ]);
    if (profileRes.status === 'fulfilled' && profileRes.value.ok) {
      setSocialStats(await profileRes.value.json() as SocialStats);
    }
    if (postsRes.status === 'fulfilled' && postsRes.value.ok) {
      setPosts(await postsRes.value.json() as Post[]);
    }
    if (highlightsRes.status === 'fulfilled') {
      setHighlights(highlightsRes.value);
    }
    if (suggestionsRes.status === 'fulfilled' && suggestionsRes.value.ok) {
      const all = await suggestionsRes.value.json() as Suggestion[];
      setSuggestions(all.filter((u) => u.id !== user.id).slice(0, 5));
    }
    setLoading(false);
  }, [accessToken, user?.id, user?.id]);

  useEffect(() => { void load(); }, [load]);

  const followSuggestion = async (targetId: string) => {
    if (!accessToken) return;
    await fetch(`${API}/social/follow/${targetId}`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
    setFollowed((prev) => { const s = new Set(prev); s.add(targetId); return s; });
  };

  const shareProfile = () => {
    void Share.share({
      message: `Découvre mon profil Yumia : ${displayName} 🌍`,
    });
  };

  const videoPosts = posts.filter((p) => p.mediaType === 'video');
  const repostData: Post[] = [];
  const taggedData: Post[] = [];

  const gridData: Post[] =
    profileTab === 'grid' ? posts :
    profileTab === 'reels' ? videoPosts :
    profileTab === 'reposts' ? repostData :
    taggedData;

  if (loading) {
    return <View style={[styles.center, { paddingTop: insets.top }]}><ActivityIndicator color={colors.brand} /></View>;
  }

  const ListHeader = (
    <View>
      {/* Avatar + stats */}
      <View style={styles.profileTop}>
        {/* Avatar avec bulle + */}
        <Pressable style={styles.avatarWrap} onPress={() => router.push('/story/create' as never)}>
          <View style={styles.avatarRing}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarLetter}>{displayName[0]?.toUpperCase()}</Text>
              </View>
            )}
          </View>
          <View style={styles.storyPlusBadge}>
            <Text style={styles.storyPlusTxt}>+</Text>
          </View>
        </Pressable>

        {/* Stats */}
        <View style={styles.statsBlock}>
          <Pressable style={styles.statItem} onPress={() => router.push('/camera' as never)}>
            <Text style={styles.statNum}>{posts.length}</Text>
            <Text style={styles.statLbl}>Publications</Text>
          </Pressable>
          <Pressable style={styles.statItem} onPress={() => router.push({ pathname: '/user/follow-list', params: { userId: user?.id, type: 'followers' } } as never)}>
            <Text style={styles.statNum}>{socialStats?.followersCount ?? 0}</Text>
            <Text style={styles.statLbl}>Followers</Text>
          </Pressable>
          <Pressable style={styles.statItem} onPress={() => router.push({ pathname: '/user/follow-list', params: { userId: user?.id, type: 'following' } } as never)}>
            <Text style={styles.statNum}>{socialStats?.followingCount ?? 0}</Text>
            <Text style={styles.statLbl}>Suivi(e)s</Text>
          </Pressable>
        </View>
      </View>

      {/* Nom + bio */}
      <View style={styles.bioSection}>
        <Text style={styles.displayName}>{displayName}</Text>
        {bio ? <Text style={styles.bioText}>{bio}</Text> : null}
      </View>

      {/* Boutons action */}
      <View style={styles.actionRow}>
        <Pressable style={styles.actionBtn} onPress={() => router.push('/edit-social-profile' as never)}>
          <Text style={styles.actionBtnText}>Modifier le profil</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={shareProfile}>
          <Text style={styles.actionBtnText}>Partager le profil</Text>
        </Pressable>
        <Pressable style={styles.actionBtnIcon} onPress={() => router.push('/discover-people' as never)}>
          <Text style={{ fontSize: 16 }}>👤</Text>
        </Pressable>
      </View>

      {/* Stories à la une */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.highlightsRow}>
        {/* Nouvelle à la une */}
        <Pressable style={styles.hlItem} onPress={() => router.push('/story/create' as never)}>
          <View style={[styles.hlBubble, styles.hlAddBubble]}>
            <Text style={{ fontSize: 24, color: colors.textMuted }}>＋</Text>
          </View>
          <Text style={styles.hlLabel} numberOfLines={1}>Nouveau</Text>
        </Pressable>
        {highlights.map((hl) => (
          <Pressable key={hl.id} style={styles.hlItem} onPress={() => setActiveHighlight(hl)}>
            <View style={styles.hlBubble}>
              {hl.coverUrl ? (
                <Image source={{ uri: hl.coverUrl }} style={styles.hlCover} />
              ) : (
                <Text style={{ fontSize: 22 }}>✨</Text>
              )}
            </View>
            <Text style={styles.hlLabel} numberOfLines={1}>{hl.title}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Contacts à découvrir */}
      {showSuggestions && suggestions.length > 0 && (
        <View style={styles.suggestBox}>
          <View style={styles.suggestHeader}>
            <Text style={styles.suggestTitle}>Contacts à découvrir</Text>
            <Pressable onPress={() => setShowSuggestions(false)} hitSlop={12}>
              <Text style={styles.suggestClose}>✕</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestList}>
            {suggestions.map((s) => (
              <View key={s.id} style={styles.suggestCard}>
                <Pressable onPress={() => setShowSuggestions(false)} style={styles.suggestCardClose} hitSlop={8}>
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>✕</Text>
                </Pressable>
                <Pressable onPress={() => router.push(`/user/${s.id}` as never)}>
                  {s.photoUrl ? (
                    <Image source={{ uri: s.photoUrl }} style={styles.suggestAvatar} />
                  ) : (
                    <View style={[styles.suggestAvatar, styles.suggestAvatarFallback]}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>{s.displayName[0]}</Text>
                    </View>
                  )}
                  <Text style={styles.suggestName} numberOfLines={1}>{s.displayName}</Text>
                  {s.bio ? <Text style={styles.suggestBio} numberOfLines={2}>{s.bio}</Text> : null}
                </Pressable>
                <Pressable
                  style={[styles.followBtn, followed.has(s.id) && styles.followBtnActive]}
                  onPress={() => void followSuggestion(s.id)}
                >
                  <Text style={[styles.followBtnText, followed.has(s.id) && styles.followBtnTextActive]}>
                    {followed.has(s.id) ? 'Abonné ✓' : 'Suivre'}
                  </Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Tabs grille */}
      <View style={styles.tabBar}>
        {([
          { key: 'grid', icon: '⊞' },
          { key: 'reels', icon: '▷' },
          { key: 'reposts', icon: '↺' },
          { key: 'tagged', icon: '☺' },
        ] as { key: ProfileTab; icon: string }[]).map(({ key, icon }) => (
          <Pressable
            key={key}
            style={[styles.tabItem, profileTab === key && styles.tabItemActive]}
            onPress={() => setProfileTab(key)}
          >
            <Text style={[styles.tabIcon, profileTab === key && styles.tabIconActive]}>{icon}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top bar style Instagram */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.topBarIcon}>←</Text>
          </Pressable>
        </View>
        <Pressable style={styles.topBarCenter} onPress={() => {}}>
          <Text style={styles.topBarUsername}>{displayName} ▾</Text>
        </Pressable>
        <View style={styles.topBarRight}>
          <Pressable style={styles.topBarIconBtn} onPress={() => setShowPlusMenu(true)}>
            <Text style={styles.topBarIcon}>＋</Text>
          </Pressable>
          <Pressable style={styles.topBarIconBtn} onPress={() => router.push('/chat' as never)}>
            <Text style={styles.topBarIcon}>✉</Text>
          </Pressable>
          <Pressable style={styles.topBarIconBtn} onPress={() => setShowMenu(true)}>
            <Text style={styles.topBarIcon}>☰</Text>
          </Pressable>
        </View>
      </View>

      {/* Grille de posts */}
      <FlatList
        data={gridData}
        numColumns={3}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={ListHeader}
        renderItem={({ item }) => (
          <Pressable style={styles.gridItem} onPress={() => router.push(`/post/${item.id}` as never)}>
            {item.mediaUrls[0] ? (
              <Image source={{ uri: item.mediaUrls[0] }} style={styles.gridImg} />
            ) : (
              <View style={[styles.gridImg, styles.gridPlaceholder]}>
                <Text style={{ fontSize: 22 }}>📷</Text>
              </View>
            )}
            {item.mediaType === 'video' && (
              <View style={styles.videoIcon}>
                <Text style={{ fontSize: 13, color: '#fff' }}>▶</Text>
              </View>
            )}
            {item.likesCount > 0 && (
              <View style={styles.likesBadge}>
                <Text style={styles.likesBadgeTxt}>❤ {item.likesCount}</Text>
              </View>
            )}
          </Pressable>
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        ListEmptyComponent={
          <View style={styles.emptyGrid}>
            <Text style={styles.emptyGridIcon}>
              {profileTab === 'grid' ? '📷' : profileTab === 'reels' ? '🎬' : profileTab === 'reposts' ? '🔁' : '🏷️'}
            </Text>
            <Text style={styles.emptyGridText}>
              {profileTab === 'grid' ? 'Aucune publication' :
               profileTab === 'reels' ? 'Aucun reel' :
               profileTab === 'reposts' ? 'Aucun repost' :
               'Aucun tag'}
            </Text>
            {profileTab === 'grid' && (
              <Pressable style={styles.emptyGridBtn} onPress={() => router.push('/camera' as never)}>
                <Text style={styles.emptyGridBtnTxt}>Publier une photo</Text>
              </Pressable>
            )}
          </View>
        }
      />

      {/* Menu hamburger */}
      <Modal visible={showMenu} transparent animationType="slide" onRequestClose={() => setShowMenu(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setShowMenu(false)} />
        <View style={[styles.menuSheet, { paddingBottom: insets.bottom + 20 }]}>
          {[
            { icon: '⚙️', label: 'Paramètres & confidentialité', onPress: () => { setShowMenu(false); router.push('/settings' as never); } },
            { icon: '👥', label: 'Demandes d\'abonnement', onPress: () => { setShowMenu(false); router.push('/follow-requests' as never); } },
            { icon: '🔒', label: socialStats?.isPrivate ? 'Passer en public' : 'Passer en privé', onPress: () => { setShowMenu(false); router.push('/edit-social-profile' as never); } },
            { icon: '🔔', label: 'Notifications', onPress: () => { setShowMenu(false); router.push('/notifications' as never); } },
            { icon: '📤', label: 'Partager mon profil', onPress: () => { setShowMenu(false); shareProfile(); } },
          ].map(({ icon, label, onPress }) => (
            <Pressable key={label} style={styles.menuItem} onPress={onPress}>
              <Text style={styles.menuIcon}>{icon}</Text>
              <Text style={styles.menuLabel}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Modal>

      {/* Menu + (publication / reel / story) */}
      <Modal visible={showPlusMenu} transparent animationType="slide" onRequestClose={() => setShowPlusMenu(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setShowPlusMenu(false)} />
        <View style={[styles.menuSheet, { paddingBottom: insets.bottom + 20 }]}>
          {[
            { icon: '📸', label: 'Nouvelle publication', onPress: () => { setShowPlusMenu(false); router.push('/camera' as never); } },
            { icon: '🎬', label: 'Nouveau reel', onPress: () => { setShowPlusMenu(false); router.push('/camera?mode=reel' as never); } },
            { icon: '⭕', label: 'Nouvelle story', onPress: () => { setShowPlusMenu(false); router.push('/camera?mode=story' as never); } },
            { icon: '✨', label: 'Story à la une', onPress: () => { setShowPlusMenu(false); router.push('/story/create' as never); } },
          ].map(({ icon, label, onPress }) => (
            <Pressable key={label} style={styles.menuItem} onPress={onPress}>
              <Text style={styles.menuIcon}>{icon}</Text>
              <Text style={styles.menuLabel}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Modal>

      {/* Visionneuse highlight */}
      <Modal visible={!!activeHighlight} transparent={false} animationType="fade" onRequestClose={() => setActiveHighlight(null)}>
        <View style={styles.hlViewer}>
          <View style={[styles.hlViewerHeader, { paddingTop: insets.top + 8 }]}>
            <Text style={styles.hlViewerTitle}>{activeHighlight?.title}</Text>
            <Pressable onPress={() => setActiveHighlight(null)} hitSlop={12}>
              <Text style={styles.hlViewerClose}>✕</Text>
            </Pressable>
          </View>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {activeHighlight?.items.map((it) => (
              <View key={it.id} style={{ width: SCREEN_W, alignItems: 'center', justifyContent: 'center' }}>
                <Image source={{ uri: it.mediaUrl }} style={{ width: SCREEN_W, height: '80%' }} resizeMode="contain" />
                {it.caption ? <Text style={styles.hlCaption}>{it.caption}</Text> : null}
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  topBarLeft: { width: 44, alignItems: 'flex-start' },
  topBarCenter: { flex: 1, alignItems: 'center' },
  topBarRight: { width: 80, flexDirection: 'row', justifyContent: 'flex-end', gap: 4 },
  topBarUsername: { fontSize: 18, fontWeight: '700', color: colors.text },
  topBarIconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  topBarIcon: { fontSize: 22, color: colors.text },

  // Profile top
  profileTop: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 12, gap: spacing.md,
  },
  avatarWrap: { position: 'relative' },
  avatarRing: {
    width: 90, height: 90, borderRadius: 45,
    borderWidth: 2.5, borderColor: colors.brand,
    padding: 2,
  },
  avatar: { width: '100%', height: '100%', borderRadius: 100 },
  avatarFallback: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 34, color: '#fff', fontWeight: '700' },
  storyPlusBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: colors.background,
  },
  storyPlusTxt: { fontSize: 17, color: '#fff', fontWeight: '700', lineHeight: 20 },
  statsBlock: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: '700', color: colors.text },
  statLbl: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  // Bio
  bioSection: { paddingHorizontal: spacing.md, paddingBottom: 14 },
  displayName: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 4 },
  bioText: { fontSize: 14, color: colors.text, lineHeight: 19 },

  // Actions
  actionRow: { flexDirection: 'row', paddingHorizontal: spacing.md, gap: 8, marginBottom: 14 },
  actionBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 9,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  actionBtnText: { fontSize: 14, fontWeight: '600', color: colors.text },
  actionBtnIcon: {
    width: 42, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },

  // Highlights
  highlightsRow: { paddingHorizontal: spacing.md, paddingBottom: 8, gap: 16 },
  hlItem: { alignItems: 'center', width: 70 },
  hlBubble: {
    width: 62, height: 62, borderRadius: 31,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', backgroundColor: colors.surface, marginBottom: 5,
  },
  hlAddBubble: { borderStyle: 'dashed' },
  hlCover: { width: '100%', height: '100%' },
  hlLabel: { fontSize: 11, color: colors.textSecondary, textAlign: 'center' },

  // Suggestions
  suggestBox: {
    marginHorizontal: spacing.md, marginBottom: 12,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    paddingVertical: 12,
  },
  suggestHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, marginBottom: 10,
  },
  suggestTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  suggestClose: { fontSize: 16, color: colors.textMuted },
  suggestList: { paddingHorizontal: 14, gap: 12 },
  suggestCard: {
    width: 140, backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg, padding: 12,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  suggestCardClose: { position: 'absolute', top: 8, right: 8 },
  suggestAvatar: { width: 60, height: 60, borderRadius: 30, marginBottom: 8, marginTop: 4 },
  suggestAvatarFallback: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  suggestName: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 4, textAlign: 'center' },
  suggestBio: { fontSize: 11, color: colors.textMuted, textAlign: 'center', lineHeight: 15, marginBottom: 10 },
  followBtn: {
    width: '100%', paddingVertical: 8, borderRadius: radius.md,
    backgroundColor: colors.brand, alignItems: 'center',
  },
  followBtnActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  followBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  followBtnTextActive: { color: colors.text },

  // Tab bar
  tabBar: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: colors.text },
  tabIcon: { fontSize: 20, color: colors.textMuted },
  tabIconActive: { color: colors.text },

  // Grid
  gridItem: { width: GRID_ITEM, height: GRID_ITEM, margin: 0.5, position: 'relative' },
  gridImg: { width: '100%', height: '100%' },
  gridPlaceholder: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  videoIcon: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  likesBadge: {
    position: 'absolute', bottom: 5, left: 5,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  likesBadgeTxt: { fontSize: 10, color: '#fff', fontWeight: '700' },
  emptyGrid: { alignItems: 'center', paddingVertical: 48 },
  emptyGridIcon: { fontSize: 44, marginBottom: 10 },
  emptyGridText: { fontSize: 16, color: colors.textMuted, marginBottom: 16 },
  emptyGridBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 24, paddingVertical: 10 },
  emptyGridBtnTxt: { color: '#fff', fontWeight: '700' },

  // Menu
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  menuSheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 12,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: spacing.lg, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  menuIcon: { fontSize: 22, width: 28 },
  menuLabel: { fontSize: 15, color: colors.text },

  // Highlight viewer
  hlViewer: { flex: 1, backgroundColor: '#000' },
  hlViewerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingBottom: 12,
  },
  hlViewerTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  hlViewerClose: { color: '#fff', fontSize: 22, fontWeight: '700' },
  hlCaption: { color: '#fff', fontSize: 15, textAlign: 'center', marginTop: 16, paddingHorizontal: spacing.lg },
});
