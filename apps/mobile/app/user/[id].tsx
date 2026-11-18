/**
 * PROFIL D'UN AUTRE UTILISATEUR — refonte premium (18/11/2026).
 *
 * Même DA que « Mon profil » : halo radial de marque derrière l'avatar (aucun
 * voile linéaire), anneau au dégradé si l'utilisateur a des stories, nom en
 * grand avec le badge d'abonnement à 22 px, niveau en pastille vitrée,
 * compteurs réels qui montent, Suivre au dégradé / Message en verre, onglets
 * en pastilles, mur de publications à coins arrondis. Logique (chargement,
 * suivi, messages, modération, signalement) inchangée.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Image, Modal, ScrollView,
  Share, StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../lib/auth-context';
import { colors, elevation, gradients, spacing } from '../../theme/tokens';
import { API_BASE_URL } from '../../lib/config';
import { feedApi, type FeedPost, type StoryHighlight, type Plan } from '../../lib/feed-api';
import { VideoThumb } from '../../components/VideoThumb';
import { Avatar, PlanBadgeIcon } from '../../components/Avatar';
import { useI18n } from '../../lib/useI18n';
import { promptReport } from '../../lib/report-content';
import { PostViewer } from '../../components/PostViewer';
import { TranslatableText } from '../../components/TranslatableText';
import { PressableScale, Reveal } from '../../components/ui';
import {
  ActionButton, AvatarHalo, BACK_ARROW, BrandRing, GlassPill, GridTile, HighlightBubble,
  PillTabs, QuietRing, SheetMenu, StatCell, StatsBar, TileBadge, TopGlassButton,
  type PillTab,
} from '../../components/p2b/ProfileVisuals';

const API = API_BASE_URL;
const { width: SW } = Dimensions.get('window');
/** Mur de publications : marges et écarts, coins arrondis. */
const GRID_PAD = spacing.sm;
const GRID_GAP = 4;
const GRID_ITEM = Math.floor((SW - GRID_PAD * 2 - GRID_GAP * 2) / 3);

function isVideoUrl(url?: string | null): boolean {
  if (!url) return false;
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url) || url.includes('/video');
}

interface UserProfile {
  id: string; displayName: string; photoUrl?: string; bio?: string;
  totalXp: number; level: number; followersCount: number;
  followingCount: number; postsCount?: number; isFollowedByMe: boolean;
  isPrivate?: boolean; hasStories?: boolean; plan?: Plan | null;
}

type ProfileTab = 'posts' | 'reels' | 'reposts' | 'tags';

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken, user: me } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  /**
   * Photo ouverte en plein écran.
   *
   * Une vignette menait à la page de détail, où l'image s'affichait petite
   * au-dessus des commentaires — même défaut que dans le fil, corrigé de la
   * même façon. Les vidéos gardent leur destination : la page de détail, où
   * elles se lisent.
   */
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
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

  // ── Modération ──────────────────────────────────────────────────────────────
  const moderate = async (action: 'block' | 'restrict' | 'mute') => {
    setShowMenu(false);
    if (!accessToken || !id) return;
    await fetch(`${API}/social/${action}/${id}`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
    if (action === 'block') {
      Alert.alert(t('up_blocked_title'), t('up_blocked_body'));
      router.back();
    } else if (action === 'restrict') {
      Alert.alert(t('up_restricted_title'), t('up_restricted_body'));
    } else {
      Alert.alert(t('up_muted_title'), t('up_muted_body'));
    }
  };

  const report = () => {
    setShowMenu(false);
    if (!id) return;
    promptReport({
      accessToken,
      targetType: 'user',
      targetId: String(id),
      t,
      titleKey: 'up_report_title',
      whyKey: 'up_report_why',
    });
  };

  const copyProfileLink = () => {
    setShowMenu(false);
    void Share.share({ message: t('up_share_profile_message').replace('{name}', profile?.displayName ?? t('up_this_profile')).replace('{id}', String(id)) });
  };

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
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <View style={[styles.notFoundBack, { top: insets.top + spacing.sm }]}>
          <TopGlassButton label={BACK_ARROW} onPress={() => router.back()} />
        </View>
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyMedal}>
          <Text style={styles.emptyEmoji}>👤</Text>
        </LinearGradient>
        <Text style={styles.notFoundText}>{t('up_user_not_found')}</Text>
      </View>
    );
  }

  const isMe = me?.id === id;

  // Filtres par onglet
  const tabPosts = posts.filter((p) => !p.isReel);
  const tabReels = posts.filter((p) => p.isReel);
  const gridData: FeedPost[] = activeTab === 'reels' ? tabReels : activeTab === 'posts' ? tabPosts : [];

  // ── Onglets du bas ─────────────────────────────────────────────────────────
  const TABS: PillTab<ProfileTab>[] = [
    { key: 'posts',   icon: '⊞' },
    { key: 'reels',   icon: '▷' },
    { key: 'reposts', icon: '↺' },
    { key: 'tags',    icon: '☺' },
  ];

  const avatar = (
    <Avatar
      uri={profile.photoUrl}
      size={104}
      placeholderColor={colors.surfaceElevated}
      fallback={<Text style={styles.avatarInitial}>{profile.displayName[0]?.toUpperCase()}</Text>}
    />
  );

  const ListHeader = (
    <View>
      {/* ── En-tête : halo radial, avatar à anneau, nom, bio, niveau ───────── */}
      <Reveal index={0} style={styles.hero}>
        <View style={styles.avatarStage}>
          <AvatarHalo size={260} />
          <PressableScale scaleTo={0.95} onPress={() => profile.hasStories && router.push(`/story-viewer?userId=${id}` as never)}>
            {profile.hasStories ? (
              <BrandRing size={116} thickness={3.5}>{avatar}</BrandRing>
            ) : (
              <QuietRing size={116}>{avatar}</QuietRing>
            )}
          </PressableScale>
        </View>

        <View style={styles.nameRow}>
          <Text style={styles.displayName} numberOfLines={2}>{profile.displayName}</Text>
          <PlanBadgeIcon plan={profile.plan} size={22} />
        </View>
        <GlassPill style={styles.levelPill}>
          <Text style={styles.levelText}>
            {t('up_level_xp').replace('{level}', String(profile.level)).replace('{xp}', String(profile.totalXp))}
          </Text>
        </GlassPill>
        {profile.bio ? <TranslatableText text={profile.bio} style={styles.bio} /> : null}
      </Reveal>

      {/* ── Compteurs ──────────────────────────────────────────────────────── */}
      <Reveal index={1} style={styles.block}>
        <StatsBar>
          <StatCell value={posts.filter((p) => !p.isReel).length} label={t('up_publications')} />
          <StatCell
            value={profile.followersCount}
            label={t('up_followers')}
            onPress={() => router.push({ pathname: '/user/follow-list', params: { userId: id, type: 'followers' } } as never)}
          />
          <StatCell
            value={profile.followingCount}
            label={t('up_following')}
            onPress={() => router.push({ pathname: '/user/follow-list', params: { userId: id, type: 'following' } } as never)}
          />
        </StatsBar>
      </Reveal>

      {/* ── Boutons d'action ──────────────────────────────────────────────── */}
      <Reveal index={2} style={[styles.block, styles.actionRow]}>
        {isMe ? (
          <>
            <ActionButton primary label={t('up_edit_profile')} onPress={() => router.push('/edit-social-profile' as never)} style={styles.flex1} />
            <ActionButton label={t('up_share_profile')} onPress={() => {}} style={styles.flex1} />
            <ActionButton icon="👤" onPress={() => {}} style={styles.actionSquare} />
          </>
        ) : (
          <>
            <ActionButton
              primary={!following}
              label={following ? t('up_followed') : t('up_follow')}
              onPress={toggleFollow}
              style={styles.flex1}
            />
            <ActionButton label={t('up_message')} onPress={openChat} style={styles.flex1} />
            <ActionButton icon="⋯" onPress={() => setShowMenu(true)} style={styles.actionSquare} />
          </>
        )}
      </Reveal>

      {/* ── Stories à la une ──────────────────────────────────────────────── */}
      {(highlights.length > 0 || isMe) && (
        <Reveal index={3}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.highlightsRow}>
            {isMe && (
              <HighlightBubble add label={t('up_new_highlight')} onPress={() => router.push('/story/create' as never)} />
            )}
            {highlights.map((hl) => (
              <HighlightBubble
                key={hl.id}
                label={hl.title}
                onPress={() => setActiveHighlight(hl)}
                cover={hl.coverUrl
                  ? <Image source={{ uri: hl.coverUrl }} style={styles.hlCover} />
                  : <Text style={{ fontSize: 22 }}>✨</Text>}
              />
            ))}
          </ScrollView>
        </Reveal>
      )}

      {/* ── Onglets ────────────────────────────────────────────────────────── */}
      <Reveal index={4} style={styles.tabsWrap}>
        <PillTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />
      </Reveal>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Barre du haut ──────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <TopGlassButton label={BACK_ARROW} onPress={() => router.back()} />
        <Text style={styles.topTitle} numberOfLines={1}>{profile.displayName}</Text>
        <View style={styles.topRight}>
          {!isMe && <TopGlassButton label="✉️" onPress={openChat} />}
          <TopGlassButton label="☰" onPress={() => setShowMenu(true)} />
        </View>
      </View>

      {/* ── Mur de publications ────────────────────────────────────────────── */}
      <FlatList
        ref={listRef}
        data={gridData}
        numColumns={3}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={ListHeader}
        renderItem={({ item, index }) => (
          <GridTile
            size={GRID_ITEM}
            index={index}
            onPress={() => setViewerIndex(gridData.findIndex((p) => p.id === item.id))}
          >
            {item.mediaUrls[0] ? (
              isVideoUrl(item.mediaUrls[0])
                ? <VideoThumb uri={item.mediaUrls[0]} style={styles.gridImg} />
                : <Image source={{ uri: item.mediaUrls[0] }} style={styles.gridImg} />
            ) : (
              <View style={[styles.gridImg, styles.gridPlaceholder]}>
                <Text style={{ fontSize: 20 }}>📷</Text>
              </View>
            )}
            {item.mediaUrls.length > 1 && !isVideoUrl(item.mediaUrls[0]) && (
              // Plusieurs photos : repère « carrousel », comme sur Instagram.
              <TileBadge corner="tr"><Text style={styles.tileBadgeTxt}>⧉</Text></TileBadge>
            )}
            {item.isReel && (
              <TileBadge corner="tr"><Text style={styles.tileBadgeTxt}>▶</Text></TileBadge>
            )}
            {item.likesCount > 0 && (
              <TileBadge corner="bl"><Text style={styles.tileBadgeTxt}>❤️ {item.likesCount}</Text></TileBadge>
            )}
          </GridTile>
        )}
        columnWrapperStyle={styles.gridRow}
        ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyMedal}>
              <Text style={styles.emptyEmoji}>📷</Text>
            </LinearGradient>
            <Text style={styles.emptyTitle}>{t('up_empty_posts')}</Text>
            {isMe && (
              <ActionButton primary label={t('up_publish_photo')} onPress={() => router.push('/camera' as never)} style={styles.emptyBtn} />
            )}
          </View>
        }
      />

      {/* ── Visionneuse de story à la une ──────────────────────────────────── */}
      <Modal visible={!!activeHighlight} animationType="fade" onRequestClose={() => setActiveHighlight(null)}>
        <View style={styles.hlViewer}>
          <View style={[styles.hlViewerTop, { paddingTop: insets.top + 8 }]}>
            <Text style={styles.hlViewerTitle} numberOfLines={1}>{activeHighlight?.title}</Text>
            <TopGlassButton label="✕" onPress={() => setActiveHighlight(null)} />
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
      <SheetMenu
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        bottomInset={insets.bottom}
        cancelLabel={t('up_cancel')}
        items={[
          { icon: '🔕', label: t('up_menu_mute'), onPress: () => void moderate('mute') },
          { icon: '🚧', label: t('up_menu_restrict'), onPress: () => void moderate('restrict') },
          { icon: '🚫', label: t('up_menu_block'), onPress: () => void moderate('block'), danger: true },
          { icon: '⚠️', label: t('up_menu_report'), onPress: report, danger: true },
          { icon: '📤', label: t('up_menu_share'), onPress: copyProfileLink },
        ]}
      />

      {viewerIndex !== null ? (
        <PostViewer
          posts={gridData}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.bg },
  flex1: { flex: 1 },

  // Barre du haut
  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.sm,
  },
  topTitle: { flex: 1, minWidth: 0, fontSize: 17, fontWeight: '900', color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.3 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // En-tête
  hero: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  avatarStage: { width: 260, height: 150, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 40, fontWeight: '900' },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: spacing.sm },
  displayName: { flexShrink: 1, fontSize: 28, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.6, textAlign: 'center' },
  levelPill: { marginTop: spacing.sm },
  levelText: { color: colors.brandSoft, fontSize: 12, fontWeight: '800' },
  bio: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, textAlign: 'center', marginTop: spacing.sm },

  block: { paddingHorizontal: spacing.md, marginTop: spacing.lg },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionSquare: { width: 48, paddingHorizontal: 0 },

  // Stories à la une
  highlightsRow: { paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xs, gap: 14 },
  hlCover: { width: '100%', height: '100%' },

  // Onglets
  tabsWrap: { paddingHorizontal: spacing.md, marginTop: spacing.lg, marginBottom: spacing.md },

  // Grille
  gridRow: { gap: GRID_GAP, paddingHorizontal: GRID_PAD },
  gridImg: { width: '100%', height: '100%' },
  gridPlaceholder: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  tileBadgeTxt: { color: '#fff', fontSize: 10.5, fontWeight: '800' },

  // États
  emptyState: { alignItems: 'center', paddingTop: 44, paddingHorizontal: spacing.xl, gap: spacing.md },
  emptyMedal: {
    width: 80, height: 80, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    ...elevation.glowBrand,
  },
  emptyEmoji: { fontSize: 36 },
  emptyTitle: { fontSize: 16, color: colors.textSecondary, fontWeight: '700', textAlign: 'center' },
  emptyBtn: { paddingHorizontal: spacing.xl, height: 48 },
  notFoundBack: { position: 'absolute', start: spacing.md },
  notFoundText: { color: colors.textSecondary, fontSize: 16, fontWeight: '700' },

  // Visionneuse
  hlViewer: { flex: 1, backgroundColor: '#000' },
  hlViewerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingBottom: 12, gap: spacing.md },
  hlViewerTitle: { flex: 1, color: '#fff', fontWeight: '900', fontSize: 18 },
  hlCaption: { color: '#fff', fontSize: 15, textAlign: 'center', marginTop: 16, paddingHorizontal: spacing.lg },
});
