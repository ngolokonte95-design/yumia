import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Dimensions, FlatList, Image, Modal, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { API_BASE_URL } from '../../lib/config';
import { feedApi, type FeedPost, type StoryHighlight } from '../../lib/feed-api';

const API = API_BASE_URL;
const { width: SW } = Dimensions.get('window');
const GRID_ITEM = (SW - 3) / 3;

interface UserProfile {
  id: string; displayName: string; photoUrl?: string; bio?: string;
  totalXp: number; level: number; followersCount: number;
  followingCount: number; postsCount?: number; isFollowedByMe: boolean;
  isPrivate?: boolean; hasStories?: boolean;
}

type ProfileTab = 'posts' | 'reels' | 'reposts' | 'tags';

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken, user: me } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [highlights, setHighlights] = useState<StoryHighlight[]>([]);
  const [activeHighlight, setActiveHighlight] = useState<StoryHighlight | null>(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [showMenu, setShowMenu] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    const h = { Authorization: `Bearer ${accessToken}` };
    const [profileRes, postsRes, hlRes] = await Promise.allSettled([
      fetch(`${API}/social/users/${id}`, { headers: h }),
      feedApi.globalFeed(accessToken).then((all) => all.filter((p) => p.userId === id || p.user?.id === id)),
      feedApi.getHighlights(accessToken, id),
    ]);
    if (profileRes.status === 'fulfilled' && profileRes.value.ok) {
      const data = await profileRes.value.json() as UserProfile;
      setProfile(data);
      setFollowing(data.isFollowedByMe);
    }
    if (postsRes.status === 'fulfilled') setPosts(postsRes.value);
    if (hlRes.status === 'fulfilled') setHighlights(hlRes.value);
    setLoading(false);
  }, [accessToken, id]);

  useEffect(() => { void load(); }, [load]);

  const toggleFollow = async () => {
    if (!accessToken || !id) return;
    const wasFollowing = following;
    setFollowing(!wasFollowing);
    setProfile((p) => p ? { ...p, followersCount: p.followersCount + (wasFollowing ? -1 : 1) } : p);
    await fetch(`${API}/social/follow/${id}`, {
      method: wasFollowing ? 'DELETE' : 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
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
      router.push(`/chat/${convId}` as never);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textMuted, fontSize: 15 }}>Utilisateur introuvable</Text>
      </View>
    );
  }

  const isMe = me?.id === id;

  // Filtres par onglet
  const tabPosts = posts.filter((p) => !p.isReel);
  const tabReels = posts.filter((p) => p.isReel);
  const gridData: FeedPost[] = activeTab === 'reels' ? tabReels : activeTab === 'posts' ? tabPosts : [];

  // ── Onglets du bas ─────────────────────────────────────────────────────────
  const TABS: { id: ProfileTab; icon: string }[] = [
    { id: 'posts',   icon: '⊞' },
    { id: 'reels',   icon: '▷' },
    { id: 'reposts', icon: '↺' },
    { id: 'tags',    icon: '☺' },
  ];

  const ListHeader = (
    <View>
      {/* ── Avatar + stats ─────────────────────────────────────────────────── */}
      <View style={styles.profileHead}>
        {/* Avatar */}
        <Pressable style={styles.avatarWrap} onPress={() => profile.hasStories && router.push(`/story-viewer?userId=${id}` as never)}>
          <View style={[styles.avatarRing, profile.hasStories ? styles.avatarRingActive : styles.avatarRingInactive]}>
            {profile.photoUrl ? (
              <Image source={{ uri: profile.photoUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{profile.displayName[0]?.toUpperCase()}</Text>
              </View>
            )}
          </View>
        </Pressable>

        {/* Stats */}
        <View style={styles.statsArea}>
          <Pressable style={styles.stat}>
            <Text style={styles.statNum}>{posts.filter((p) => !p.isReel).length}</Text>
            <Text style={styles.statLabel}>Publications</Text>
          </Pressable>
          <Pressable style={styles.stat} onPress={() => router.push({ pathname: '/user/follow-list', params: { userId: id, type: 'followers' } } as never)}>
            <Text style={styles.statNum}>{profile.followersCount}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </Pressable>
          <Pressable style={styles.stat} onPress={() => router.push({ pathname: '/user/follow-list', params: { userId: id, type: 'following' } } as never)}>
            <Text style={styles.statNum}>{profile.followingCount}</Text>
            <Text style={styles.statLabel}>Suivi(e)s</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Nom + bio ──────────────────────────────────────────────────────── */}
      <View style={styles.nameSection}>
        <Text style={styles.displayName}>{profile.displayName}</Text>
        {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
        <Text style={styles.levelBadge}>✨ Niv. {profile.level} · {profile.totalXp} XP</Text>
      </View>

      {/* ── Boutons d'action ──────────────────────────────────────────────── */}
      <View style={styles.actionRow}>
        {isMe ? (
          <>
            <Pressable style={styles.actionBtn} onPress={() => router.push('/edit-social-profile' as never)}>
              <Text style={styles.actionBtnTxt}>Modifier le profil</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => {}}>
              <Text style={styles.actionBtnTxt}>Partager le profil</Text>
            </Pressable>
            <Pressable style={styles.actionIconBtn}>
              <Text style={styles.actionIconTxt}>👤</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              style={[styles.actionBtn, following ? styles.actionBtnSecondary : styles.actionBtnPrimary]}
              onPress={toggleFollow}
            >
              <Text style={[styles.actionBtnTxt, following ? styles.actionBtnTxtSecondary : styles.actionBtnTxtPrimary]}>
                {following ? 'Abonné(e)' : 'Suivre'}
              </Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={openChat}>
              <Text style={[styles.actionBtnTxt, styles.actionBtnTxtSecondary]}>Message</Text>
            </Pressable>
            <Pressable style={styles.actionIconBtn} onPress={() => setShowMenu(true)}>
              <Text style={styles.actionIconTxt}>⋯</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* ── Stories à la une ──────────────────────────────────────────────── */}
      {(highlights.length > 0 || isMe) && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.highlightsRow}>
          {isMe && (
            <Pressable style={styles.hlItem} onPress={() => router.push('/story/create' as never)}>
              <View style={[styles.hlBubble, styles.hlBubbleAdd]}>
                <Text style={styles.hlAddIcon}>+</Text>
              </View>
              <Text style={styles.hlLabel} numberOfLines={1}>Nouveau</Text>
            </Pressable>
          )}
          {highlights.map((hl) => (
            <Pressable key={hl.id} style={styles.hlItem} onPress={() => setActiveHighlight(hl)}>
              <View style={styles.hlBubble}>
                {hl.coverUrl
                  ? <Image source={{ uri: hl.coverUrl }} style={styles.hlCover} />
                  : <Text style={{ fontSize: 22 }}>✨</Text>}
              </View>
              <Text style={styles.hlLabel} numberOfLines={1}>{hl.title}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* ── Onglets ────────────────────────────────────────────────────────── */}
      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <Pressable key={t.id} style={styles.tabBtn} onPress={() => setActiveTab(t.id)}>
            <Text style={[styles.tabIcon, activeTab === t.id && styles.tabIconActive]}>{t.icon}</Text>
            {activeTab === t.id && <View style={styles.tabUnderline} />}
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <Pressable style={styles.topBack} onPress={() => router.back()}>
          <Text style={styles.topBackTxt}>←</Text>
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>{profile.displayName}</Text>
        <View style={styles.topRight}>
          {!isMe && (
            <Pressable style={styles.topIconBtn} onPress={openChat}>
              <Text style={styles.topIconTxt}>✉️</Text>
            </Pressable>
          )}
          <Pressable style={styles.topIconBtn} onPress={() => setShowMenu(true)}>
            <Text style={styles.topIconTxt}>☰</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Grille de publications ─────────────────────────────────────────── */}
      <FlatList
        ref={listRef}
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
                <Text style={{ fontSize: 20 }}>📷</Text>
              </View>
            )}
            {item.isReel && (
              <View style={styles.gridReelBadge}>
                <Text style={{ color: '#fff', fontSize: 12 }}>▶</Text>
              </View>
            )}
            {item.likesCount > 0 && (
              <View style={styles.gridOverlay}>
                <Text style={styles.gridOverlayTxt}>❤️ {item.likesCount}</Text>
              </View>
            )}
          </Pressable>
        )}
        columnWrapperStyle={{ gap: 1.5 }}
        ItemSeparatorComponent={() => <View style={{ height: 1.5 }} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📷</Text>
            <Text style={styles.emptyTitle}>Aucune publication</Text>
            {isMe && (
              <Pressable style={styles.emptyBtn} onPress={() => router.push('/camera' as never)}>
                <Text style={styles.emptyBtnTxt}>Publier une photo</Text>
              </Pressable>
            )}
          </View>
        }
      />

      {/* ── Visionneuse highlight ──────────────────────────────────────────── */}
      <Modal visible={!!activeHighlight} animationType="fade" onRequestClose={() => setActiveHighlight(null)}>
        <View style={styles.hlViewer}>
          <View style={[styles.hlViewerTop, { paddingTop: insets.top + 8 }]}>
            <Text style={styles.hlViewerTitle}>{activeHighlight?.title}</Text>
            <Pressable onPress={() => setActiveHighlight(null)} hitSlop={12}>
              <Text style={styles.hlClose}>✕</Text>
            </Pressable>
          </View>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {activeHighlight?.items.map((it) => (
              <View key={it.id} style={{ width: SW, alignItems: 'center', justifyContent: 'center' }}>
                <Image source={{ uri: it.mediaUrl }} style={{ width: SW, height: '80%' }} resizeMode="contain" />
                {it.caption ? <Text style={styles.hlCaption}>{it.caption}</Text> : null}
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Menu contextuel ───────────────────────────────────────────────── */}
      <Modal visible={showMenu} transparent animationType="slide" onRequestClose={() => setShowMenu(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setShowMenu(false)}>
          <View style={[styles.menuSheet, { paddingBottom: insets.bottom + 8 }]}>
            {[
              { label: '🚫 Bloquer', onPress: () => setShowMenu(false) },
              { label: '⚠️ Signaler', onPress: () => setShowMenu(false) },
              { label: '🔗 Copier le lien du profil', onPress: () => setShowMenu(false) },
            ].map((item) => (
              <Pressable key={item.label} style={styles.menuItem} onPress={item.onPress}>
                <Text style={styles.menuItemTxt}>{item.label}</Text>
              </Pressable>
            ))}
            <Pressable style={[styles.menuItem, { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8 }]} onPress={() => setShowMenu(false)}>
              <Text style={[styles.menuItemTxt, { color: colors.textMuted }]}>Annuler</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Top bar
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  topBack: { paddingRight: 12 },
  topBackTxt: { fontSize: 22, color: colors.text },
  topTitle: { flex: 1, ...typography.h3, color: colors.text, textAlign: 'center' },
  topRight: { flexDirection: 'row', gap: 4 },
  topIconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  topIconTxt: { fontSize: 20 },

  // Profile header
  profileHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: 16 },
  avatarWrap: { position: 'relative' },
  avatarRing: { width: 94, height: 94, borderRadius: 47, padding: 2.5 },
  avatarRingActive: { backgroundColor: colors.brand },
  avatarRingInactive: { backgroundColor: colors.border },
  avatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: colors.background },
  avatarFallback: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 32, fontWeight: '800' },
  statsArea: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', gap: 3 },
  statNum: { fontSize: 20, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },

  // Name section
  nameSection: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: 4 },
  displayName: { ...typography.h3, color: colors.text },
  bio: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  levelBadge: { fontSize: 12, color: colors.brand, fontWeight: '600', marginTop: 4 },

  // Action buttons
  actionRow: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 8 },
  actionBtn: { flex: 1, height: 34, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  actionBtnPrimary: { backgroundColor: colors.brand, borderColor: colors.brand },
  actionBtnSecondary: { backgroundColor: colors.surface },
  actionBtnTxt: { fontSize: 13, fontWeight: '700', color: colors.text },
  actionBtnTxtPrimary: { color: '#fff' },
  actionBtnTxtSecondary: { color: colors.text },
  actionIconBtn: { width: 34, height: 34, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  actionIconTxt: { fontSize: 16, color: colors.text },

  // Highlights
  highlightsRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 16 },
  hlItem: { alignItems: 'center', width: 70, gap: 4 },
  hlBubble: { width: 62, height: 62, borderRadius: 31, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.surface },
  hlBubbleAdd: { borderStyle: 'dashed', borderColor: colors.textMuted },
  hlAddIcon: { fontSize: 22, color: colors.textMuted, fontWeight: '300' },
  hlCover: { width: '100%', height: '100%' },
  hlLabel: { fontSize: 11, color: colors.textSecondary, textAlign: 'center' },

  // Tabs
  tabRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, position: 'relative' },
  tabIcon: { fontSize: 20, color: colors.textMuted },
  tabIconActive: { color: colors.text },
  tabUnderline: { position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2, backgroundColor: colors.text, borderRadius: 1 },

  // Grid
  gridItem: { width: GRID_ITEM, height: GRID_ITEM, position: 'relative' },
  gridImg: { width: '100%', height: '100%' },
  gridPlaceholder: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  gridReelBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  gridOverlay: { position: 'absolute', bottom: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  gridOverlayTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 15, color: colors.textMuted, fontWeight: '600' },
  emptyBtn: { marginTop: 8, backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 28, paddingVertical: 13 },
  emptyBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Highlight viewer
  hlViewer: { flex: 1, backgroundColor: '#000' },
  hlViewerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingBottom: 12 },
  hlViewerTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  hlClose: { color: '#fff', fontSize: 22, fontWeight: '700' },
  hlCaption: { color: '#fff', fontSize: 15, textAlign: 'center', marginTop: 16, paddingHorizontal: spacing.lg },

  // Context menu
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: 12 },
  menuItem: { paddingVertical: 16, paddingHorizontal: spacing.lg },
  menuItemTxt: { fontSize: 16, color: colors.text, fontWeight: '500' },
});
