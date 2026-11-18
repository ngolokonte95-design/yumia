/**
 * MON PROFIL SOCIAL — refonte premium (18/11/2026).
 *
 * En-tête fort : halo radial de marque derrière l'avatar (aucun voile linéaire),
 * anneau au dégradé quand une story est active, nom en grand avec le badge
 * d'abonnement à 22 px, compteurs réels qui montent, actions en pilules,
 * stories à la une, onglets en pastilles, mur de publications à coins arrondis
 * qui apparaît en cascade. Logique (chargement, actions, menus) inchangée.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Image, Modal, Pressable, RefreshControl,
  ScrollView, Share, StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../lib/auth-context';
import { colors, elevation, gradients, radius, spacing } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';
import { feedApi, type StoryHighlight } from '../lib/feed-api';
import { VideoThumb } from '../components/VideoThumb';
import { PlanBadgeIcon } from '../components/Avatar';
import { useI18n } from '../lib/useI18n';
import { PostViewer } from '../components/PostViewer';
import type { FeedPost } from '../lib/feed-api';
import { isVideoUrl } from '../lib/is-video-url';
import { PressableScale, Reveal } from '../components/ui';
import { GLASS } from '../components/profile/ProfileChrome';
import {
  ActionButton, AvatarHalo, BACK_ARROW, BrandBadge, BrandRing, GridTile, HighlightBubble,
  PillTabs, QuietRing, SheetMenu, StatCell, StatsBar, TileBadge, TopGlassButton,
  type PillTab,
} from '../components/p2b/ProfileVisuals';

const API = API_BASE_URL;
const { width: SCREEN_W } = Dimensions.get('window');
/** Mur de publications : marges et écarts, coins arrondis. */
const GRID_PAD = spacing.sm;
const GRID_GAP = 4;
const GRID_ITEM = Math.floor((SCREEN_W - GRID_PAD * 2 - GRID_GAP * 2) / 3);

type ProfileTab = 'grid' | 'reels' | 'reposts' | 'tagged';

/**
 * L'API renvoie la publication complète (`hydratePosts`) : j'aime de
 * l'utilisateur, enregistrements, nombre de commentaires. Ce fichier n'en
 * déclarait qu'une poignée de champs, ce qui empêchait de passer une
 * publication à la visionneuse plein écran.
 */
type Post = FeedPost;

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
  const { t } = useI18n();

  const [socialStats, setSocialStats] = useState<SocialStats | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [highlights, setHighlights] = useState<StoryHighlight[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeHighlight, setActiveHighlight] = useState<StoryHighlight | null>(null);

  /** Supprime la story à la une ouverte (ses fichiers sont effacés côté serveur). */
  const confirmDeleteHighlight = () => {
    const hl = activeHighlight;
    if (!hl || !accessToken) return;
    Alert.alert(t('sp_delete_highlight_title'), t('sp_delete_highlight_body'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('sp_delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await feedApi.deleteHighlight(accessToken, hl.id);
            if (!res.ok) throw new Error(String(res.status));
            setHighlights((prev) => prev.filter((h) => h.id !== hl.id));
            setActiveHighlight(null);
          } catch {
            Alert.alert(t('sp_impossible'), t('sp_delete_highlight_error'));
          }
        },
      },
    ]);
  };
  const [hasActiveStory, setHasActiveStory] = useState(false);
  const [profileTab, setProfileTab] = useState<ProfileTab>('grid');
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [postMenu, setPostMenu] = useState<Post | null>(null); // appui long sur un de mes posts
  /**
   * Photo ouverte en plein écran.
   *
   * Une vignette menait à la page de détail, où l'image s'affichait petite
   * au-dessus des commentaires — même défaut que dans le fil, corrigé de la
   * même façon. Les vidéos gardent leur destination : la page de détail, où
   * elles se lisent.
   */
  /**
   * Publication ouverte en plein écran — c'est un index dans `gridData`, pas
   * une publication isolée : depuis là on fait défiler tout le compte,
   * photos et vidéos confondues, dans l'ordre de la grille.
   */
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [followRequests, setFollowRequests] = useState(0);

  const photoUrl = user?.photoUrl
    ? (user.photoUrl.startsWith('http') ? user.photoUrl : `${API}${user.photoUrl}`)
    : null;
  const displayName = user?.displayName ?? t('sp_me_fallback');
  const bio = user?.bio ?? '';

  /**
   * Demandes d'abonnement en attente.
   *
   * L'API renvoie la liste, pas un compte : à ce volume, la longueur suffit et
   * évite d'ajouter un endpoint pour un seul nombre.
   */
  const loadFollowRequests = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${API}/social/follow-requests`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) setFollowRequests(((await res.json()) as unknown[]).length);
    } catch {
      // Pastille absente plutôt qu'un écran en erreur : ce n'est qu'un indicateur.
    }
  }, [accessToken]);

  // Accepter une demande se fait sur l'autre écran ; sans ce rafraîchissement,
  // la pastille resterait figée sur son ancienne valeur au retour.
  useFocusEffect(useCallback(() => { void loadFollowRequests(); }, [loadFollowRequests]));

  const load = useCallback(async () => {
    if (!accessToken || !user?.id) return;
    const h = { Authorization: `Bearer ${accessToken}` };
    const [profileRes, postsRes, highlightsRes, suggestionsRes, storiesRes] = await Promise.allSettled([
      fetch(`${API}/social/users/${user.id}`, { headers: h }),
      fetch(`${API}/posts/user/${user.id}?limit=30`, { headers: h }),
      feedApi.getHighlights(accessToken, user.id),
      fetch(`${API}/social/suggestions?limit=6`, { headers: h }),
      feedApi.globalStories(accessToken),
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
    if (storiesRes.status === 'fulfilled') {
      const mine = storiesRes.value.find((g) => g.user?.id === user.id);
      setHasActiveStory(!!mine && mine.stories.length > 0);
    }
    setLoading(false);
  }, [accessToken, user?.id, user?.id]);

  useEffect(() => { void load(); }, [load]);

  // Tirer pour rafraîchir : rejoue le chargement du profil (compteurs,
  // publications, stories à la une, suggestions, story active) et la pastille
  // des demandes d'abonnement.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await Promise.all([load(), loadFollowRequests()]); } finally { setRefreshing(false); }
  }, [load, loadFollowRequests]);

  const followSuggestion = async (targetId: string) => {
    if (!accessToken) return;
    await fetch(`${API}/social/follow/${targetId}`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
    setFollowed((prev) => { const s = new Set(prev); s.add(targetId); return s; });
  };

  const shareProfile = () => {
    void Share.share({
      message: t('sp_share_message').replace('{name}', displayName),
    });
  };

  // ── Actions sur mes posts (appui long) ──────────────────────────────────────
  const postAction = async (action: 'pin' | 'archive' | 'delete' | 'stats') => {
    const p = postMenu;
    setPostMenu(null);
    if (!p || !accessToken) return;
    const h = { Authorization: `Bearer ${accessToken}` };
    if (action === 'pin') {
      const res = await fetch(`${API}/posts/${p.id}/pin`, { method: 'POST', headers: h });
      if (!res.ok) { Alert.alert(t('sp_impossible'), t('sp_pin_limit')); return; }
      void load();
    } else if (action === 'archive') {
      await fetch(`${API}/posts/${p.id}/archive`, { method: 'POST', headers: h });
      void load();
    } else if (action === 'delete') {
      Alert.alert(t('sp_delete_confirm_title'), t('sp_delete_confirm_body'), [
        { text: t('sp_cancel'), style: 'cancel' },
        {
          text: t('sp_delete'), style: 'destructive',
          onPress: async () => { await fetch(`${API}/posts/${p.id}`, { method: 'DELETE', headers: h }); void load(); },
        },
      ]);
    } else if (action === 'stats') {
      const res = await fetch(`${API}/posts/${p.id}/stats`, { headers: h });
      if (res.ok) {
        const s = await res.json() as { views: number; likes: number; comments: number; saves: number; reposts: number };
        Alert.alert(
          t('sp_stats_title'),
          t('sp_stats_body')
            .replace('{views}', String(s.views))
            .replace('{likes}', String(s.likes))
            .replace('{comments}', String(s.comments))
            .replace('{saves}', String(s.saves))
            .replace('{reposts}', String(s.reposts)),
        );
      }
    }
  };

  const videoPosts = posts.filter((p) => isVideoUrl(p.mediaUrls[0]));
  const repostData: Post[] = [];
  const taggedData: Post[] = [];

  const gridData: Post[] =
    profileTab === 'grid' ? posts :
    profileTab === 'reels' ? videoPosts :
    profileTab === 'reposts' ? repostData :
    taggedData;

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  const tabs: PillTab<ProfileTab>[] = [
    { key: 'grid', icon: '⊞' },
    { key: 'reels', icon: '▷' },
    { key: 'reposts', icon: '↺' },
    { key: 'tagged', icon: '☺' },
  ];

  const avatarContent = photoUrl ? (
    <Image source={{ uri: photoUrl }} style={styles.avatarImg} />
  ) : (
    <View style={[styles.avatarImg, styles.avatarFallback]}>
      <Text style={styles.avatarLetter}>{displayName[0]?.toUpperCase()}</Text>
    </View>
  );

  const ListHeader = (
    <View>
      {/* ── En-tête : halo radial, avatar à anneau, nom, bio ─────────────── */}
      <Reveal index={0} style={styles.hero}>
        <View style={styles.avatarStage}>
          <AvatarHalo size={260} />
          <View>
            <PressableScale
              scaleTo={0.95}
              onPress={() => hasActiveStory
                ? router.push(`/story-viewer?userId=${user?.id}` as never)
                : router.push('/story/create' as never)}
            >
              {hasActiveStory ? (
                <BrandRing size={116} thickness={3.5}>{avatarContent}</BrandRing>
              ) : (
                <QuietRing size={116} dashed>{avatarContent}</QuietRing>
              )}
            </PressableScale>
            <BrandBadge label="+" size={32} style={styles.storyPlus} onPress={() => router.push('/story/create' as never)} />
          </View>
        </View>

        <View style={styles.nameRow}>
          <Text style={styles.displayName} numberOfLines={2}>{displayName}</Text>
          <PlanBadgeIcon plan={user?.plan} size={22} />
        </View>
        {bio ? <Text style={styles.bioText}>{bio}</Text> : null}
      </Reveal>

      {/* ── Compteurs ──────────────────────────────────────────────────── */}
      <Reveal index={1} style={styles.block}>
        <StatsBar>
          <StatCell value={posts.length} label={t('sp_publications')} onPress={() => router.push('/camera' as never)} />
          <StatCell
            value={socialStats?.followersCount ?? 0}
            label={t('sp_followers')}
            onPress={() => router.push({ pathname: '/user/follow-list', params: { userId: user?.id, type: 'followers' } } as never)}
          />
          <StatCell
            value={socialStats?.followingCount ?? 0}
            label={t('sp_following')}
            onPress={() => router.push({ pathname: '/user/follow-list', params: { userId: user?.id, type: 'following' } } as never)}
          />
        </StatsBar>
      </Reveal>

      {/* ── Actions ────────────────────────────────────────────────────── */}
      <Reveal index={2} style={[styles.block, styles.actionRow]}>
        <ActionButton primary label={t('sp_edit_profile')} onPress={() => router.push('/edit-social-profile' as never)} style={styles.flex1} />
        <ActionButton label={t('sp_share_profile')} onPress={shareProfile} style={styles.flex1} />
        <ActionButton
          icon="👤"
          badge={followRequests}
          onPress={() => router.push('/follow-requests' as never)}
          accessibilityLabel={t('sp_menu_follow_requests')}
          style={styles.actionSquare}
        />
      </Reveal>

      {/* ── Stories à la une ───────────────────────────────────────────── */}
      <Reveal index={3}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.highlightsRow}>
          <HighlightBubble add label={t('sp_new_highlight')} onPress={() => router.push('/story/create' as never)} />
          {highlights.map((hl) => (
            <HighlightBubble
              key={hl.id}
              label={hl.title}
              onPress={() => setActiveHighlight(hl)}
              onLongPress={() => setActiveHighlight(hl)}
              cover={hl.coverUrl ? <Image source={{ uri: hl.coverUrl }} style={styles.hlCover} /> : <Text style={{ fontSize: 22 }}>✨</Text>}
            />
          ))}
        </ScrollView>
      </Reveal>

      {/* ── Contacts à découvrir ───────────────────────────────────────── */}
      {showSuggestions && suggestions.length > 0 && (
        <Reveal index={4} style={[styles.suggestBox, GLASS]}>
          <View style={styles.suggestHeader}>
            <Text style={styles.suggestTitle}>{t('sp_discover_contacts')}</Text>
            <Pressable onPress={() => setShowSuggestions(false)} hitSlop={12} style={styles.suggestCloseBtn}>
              <Text style={styles.suggestClose}>✕</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestList}>
            {suggestions.map((s) => (
              <View key={s.id} style={styles.suggestCard}>
                <Pressable onPress={() => setShowSuggestions(false)} style={styles.suggestCardClose} hitSlop={8}>
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>✕</Text>
                </Pressable>
                <Pressable onPress={() => router.push(`/user/${s.id}` as never)} style={styles.suggestBody}>
                  <BrandRing size={66} thickness={2}>
                    {s.photoUrl ? (
                      <Image source={{ uri: s.photoUrl }} style={styles.suggestAvatar} />
                    ) : (
                      <View style={[styles.suggestAvatar, styles.avatarFallback]}>
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 20 }}>{s.displayName[0]}</Text>
                      </View>
                    )}
                  </BrandRing>
                  <Text style={styles.suggestName} numberOfLines={1}>{s.displayName}</Text>
                  {s.bio ? <Text style={styles.suggestBio} numberOfLines={2}>{s.bio}</Text> : null}
                </Pressable>
                <ActionButton
                  primary={!followed.has(s.id)}
                  label={followed.has(s.id) ? t('sp_followed_check') : t('sp_follow')}
                  onPress={() => void followSuggestion(s.id)}
                  style={styles.suggestFollow}
                  textStyle={{ fontSize: 13 }}
                />
              </View>
            ))}
          </ScrollView>
        </Reveal>
      )}

      {/* ── Onglets ────────────────────────────────────────────────────── */}
      <Reveal index={5} style={styles.tabsWrap}>
        <PillTabs tabs={tabs} active={profileTab} onChange={setProfileTab} />
      </Reveal>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Barre du haut ──────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <TopGlassButton label={BACK_ARROW} onPress={() => router.back()} />
        <Pressable style={styles.topBarCenter} onPress={() => {}}>
          <Text style={styles.topBarUsername} numberOfLines={1}>{displayName} ▾</Text>
        </Pressable>
        <View style={styles.topBarRight}>
          <TopGlassButton label="＋" onPress={() => setShowPlusMenu(true)} size={36} />
          <TopGlassButton label="✉" onPress={() => router.push('/chat' as never)} size={36} />
          {/* Favoris (lieux + publications enregistrées) : accessible d'un
              geste depuis le profil, comme le signet d'Instagram — il n'était
              atteignable que par le menu ☰. */}
          <TopGlassButton
            label="🔖"
            onPress={() => router.push('/favorites' as never)}
            accessibilityLabel={t('sp_menu_favorites_collections')}
            size={36}
          />
          <TopGlassButton label="☰" onPress={() => setShowMenu(true)} size={36} />
        </View>
      </View>

      {/* ── Mur de publications ────────────────────────────────────────── */}
      <FlatList
        data={gridData}
        numColumns={3}
        keyExtractor={(p) => p.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#fff" colors={[colors.brand]} />
        }
        ListHeaderComponent={ListHeader}
        columnWrapperStyle={styles.gridRow}
        ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
        renderItem={({ item, index }) => (
          <GridTile
            size={GRID_ITEM}
            index={index}
            onPress={() => setViewerIndex(gridData.findIndex((p) => p.id === item.id))}
            onLongPress={() => setPostMenu(item)}
          >
            {item.mediaUrls[0] ? (
              isVideoUrl(item.mediaUrls[0])
                ? <VideoThumb uri={item.mediaUrls[0]} style={styles.gridImg} />
                : <Image source={{ uri: item.mediaUrls[0] }} style={styles.gridImg} />
            ) : (
              <View style={[styles.gridImg, styles.gridPlaceholder]}>
                <Text style={{ fontSize: 22 }}>📷</Text>
              </View>
            )}
            {item.mediaUrls.length > 1 && !isVideoUrl(item.mediaUrls[0]) && (
              // Plusieurs photos : repère « carrousel », comme sur Instagram.
              <TileBadge corner="tr"><Text style={styles.tileBadgeTxt}>⧉</Text></TileBadge>
            )}
            {item.pinned && (
              <TileBadge corner="tl"><Text style={{ fontSize: 10 }}>📌</Text></TileBadge>
            )}
            {isVideoUrl(item.mediaUrls[0]) && (
              <TileBadge corner="tr"><Text style={styles.tileBadgeTxt}>▶</Text></TileBadge>
            )}
            {item.likesCount > 0 && (
              <TileBadge corner="bl"><Text style={styles.tileBadgeTxt}>❤ {item.likesCount}</Text></TileBadge>
            )}
          </GridTile>
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        ListEmptyComponent={
          <View style={styles.emptyGrid}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyMedal}>
              <Text style={styles.emptyGridIcon}>
                {profileTab === 'grid' ? '📷' : profileTab === 'reels' ? '🎬' : profileTab === 'reposts' ? '🔁' : '🏷️'}
              </Text>
            </LinearGradient>
            <Text style={styles.emptyGridText}>
              {profileTab === 'grid' ? t('sp_empty_posts') :
               profileTab === 'reels' ? t('sp_empty_reels') :
               profileTab === 'reposts' ? t('sp_empty_reposts') :
               t('sp_empty_tags')}
            </Text>
            {profileTab === 'grid' && (
              <ActionButton primary label={t('sp_publish_photo')} onPress={() => router.push('/camera' as never)} style={styles.emptyBtn} />
            )}
          </View>
        }
      />

      {/* ── Menu hamburger ─────────────────────────────────────────────── */}
      <SheetMenu
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        bottomInset={insets.bottom}
        items={[
          { icon: '⚙️', label: t('sp_menu_settings'), onPress: () => { setShowMenu(false); router.push('/settings' as never); } },
          { icon: '👥', label: t('sp_menu_follow_requests'), onPress: () => { setShowMenu(false); router.push('/follow-requests' as never); } },
          { icon: '📁', label: t('sp_menu_archive'), onPress: () => { setShowMenu(false); router.push('/archive' as never); } },
          { icon: '❤️', label: t('sp_menu_favorites_collections'), onPress: () => { setShowMenu(false); router.push('/favorites' as never); } },
          { icon: '🟢', label: t('sp_menu_close_friends'), onPress: () => { setShowMenu(false); router.push('/close-friends?type=close-friends' as never); } },
          { icon: '⭐', label: t('sp_menu_favorites'), onPress: () => { setShowMenu(false); router.push('/close-friends?type=favorites' as never); } },
          { icon: '🚫', label: t('sp_menu_blocked'), onPress: () => { setShowMenu(false); router.push('/blocked' as never); } },
          { icon: '🔒', label: socialStats?.isPrivate ? t('sp_menu_go_public') : t('sp_menu_go_private'), onPress: () => { setShowMenu(false); router.push('/edit-social-profile' as never); } },
          { icon: '🔔', label: t('sp_menu_notifications'), onPress: () => { setShowMenu(false); router.push('/notifications' as never); } },
          { icon: '📤', label: t('sp_menu_share_profile'), onPress: () => { setShowMenu(false); shareProfile(); } },
        ]}
      />

      {/* ── Menu + (publication / reel / story) ────────────────────────── */}
      <SheetMenu
        visible={showPlusMenu}
        onClose={() => setShowPlusMenu(false)}
        bottomInset={insets.bottom}
        items={[
          { icon: '📸', label: t('sp_menu_new_post'), onPress: () => { setShowPlusMenu(false); router.push('/camera' as never); } },
          { icon: '🎬', label: t('sp_menu_new_reel'), onPress: () => { setShowPlusMenu(false); router.push('/camera?mode=reel' as never); } },
          { icon: '⭕', label: t('sp_menu_new_story'), onPress: () => { setShowPlusMenu(false); router.push('/camera?mode=story' as never); } },
          { icon: '✨', label: t('sp_menu_highlight_story'), onPress: () => { setShowPlusMenu(false); router.push('/story/create' as never); } },
        ]}
      />

      {/* ── Menu appui long sur un post ────────────────────────────────── */}
      <SheetMenu
        visible={postMenu !== null}
        onClose={() => setPostMenu(null)}
        bottomInset={insets.bottom}
        items={[
          { icon: '📌', label: postMenu?.pinned ? t('sp_menu_unpin') : t('sp_menu_pin'), onPress: () => void postAction('pin') },
          { icon: '📊', label: t('sp_menu_view_stats'), onPress: () => void postAction('stats') },
          { icon: '✏️', label: t('sp_menu_edit'), onPress: () => { const id = postMenu?.id; setPostMenu(null); if (id) router.push(`/post/${id}?edit=1` as never); } },
          { icon: '📁', label: t('sp_menu_archive_post'), onPress: () => void postAction('archive') },
          { icon: '🗑️', label: t('sp_menu_delete'), onPress: () => void postAction('delete'), danger: true },
        ]}
      />

      {/* ── Visionneuse de story à la une ──────────────────────────────── */}
      <Modal visible={!!activeHighlight} transparent={false} animationType="fade" onRequestClose={() => setActiveHighlight(null)}>
        <View style={styles.hlViewer}>
          <View style={[styles.hlViewerHeader, { paddingTop: insets.top + 8 }]}>
            <Text style={styles.hlViewerTitle} numberOfLines={1}>{activeHighlight?.title}</Text>
            <View style={styles.hlViewerActions}>
              <TopGlassButton label="🗑" onPress={confirmDeleteHighlight} accessibilityLabel={t('sp_delete_highlight_title')} />
              <TopGlassButton label="✕" onPress={() => setActiveHighlight(null)} />
            </View>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  flex1: { flex: 1 },

  // Barre du haut
  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.sm,
  },
  topBarCenter: { flex: 1, minWidth: 0, alignItems: 'center' },
  topBarUsername: { fontSize: 17, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.3 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // En-tête
  hero: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  avatarStage: { width: 260, height: 150, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: '100%', height: '100%', borderRadius: 100 },
  avatarFallback: { backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 40, color: '#fff', fontWeight: '900' },
  storyPlus: { position: 'absolute', bottom: 2, end: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: spacing.sm },
  displayName: { flexShrink: 1, fontSize: 28, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.6, textAlign: 'center' },
  bioText: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, textAlign: 'center', marginTop: 6 },

  block: { paddingHorizontal: spacing.md, marginTop: spacing.lg },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionSquare: { width: 48, paddingHorizontal: 0 },

  // Stories à la une
  highlightsRow: { paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xs, gap: 14 },
  hlCover: { width: '100%', height: '100%' },

  // Suggestions
  suggestBox: { marginHorizontal: spacing.md, marginTop: spacing.lg, borderRadius: radius.lg, paddingVertical: spacing.md },
  suggestHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, marginBottom: spacing.md,
  },
  suggestTitle: { fontSize: 12, fontWeight: '800', color: colors.textPrimary, letterSpacing: 1.8, textTransform: 'uppercase' },
  suggestCloseBtn: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  suggestClose: { fontSize: 13, color: colors.textMuted, fontWeight: '800' },
  suggestList: { paddingHorizontal: spacing.md, gap: spacing.sm },
  suggestCard: {
    width: 150, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center',
    backgroundColor: 'rgba(14,14,18,0.55)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)',
  },
  suggestCardClose: { position: 'absolute', top: 8, end: 8, zIndex: 1 },
  suggestBody: { alignItems: 'center', width: '100%', marginBottom: spacing.sm },
  suggestAvatar: { width: '100%', height: '100%', borderRadius: 40 },
  suggestName: { fontSize: 14, fontWeight: '900', color: colors.textPrimary, marginTop: spacing.sm, textAlign: 'center' },
  suggestBio: { fontSize: 11, color: colors.textMuted, textAlign: 'center', lineHeight: 15, marginTop: 2 },
  suggestFollow: { alignSelf: 'stretch', height: 36 },

  // Onglets
  tabsWrap: { paddingHorizontal: spacing.md, marginTop: spacing.lg, marginBottom: spacing.md },

  // Grille
  gridRow: { gap: GRID_GAP, paddingHorizontal: GRID_PAD },
  gridImg: { width: '100%', height: '100%' },
  gridPlaceholder: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  tileBadgeTxt: { color: '#fff', fontSize: 10.5, fontWeight: '800' },

  emptyGrid: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: spacing.xl, gap: spacing.md },
  emptyMedal: {
    width: 80, height: 80, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    ...elevation.glowBrand,
  },
  emptyGridIcon: { fontSize: 36 },
  emptyGridText: { fontSize: 16, color: colors.textSecondary, fontWeight: '700', textAlign: 'center' },
  emptyBtn: { paddingHorizontal: spacing.xl, height: 48 },

  // Visionneuse
  hlViewer: { flex: 1, backgroundColor: '#000' },
  hlViewerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingBottom: 12, gap: spacing.md,
  },
  hlViewerTitle: { flex: 1, color: '#fff', fontWeight: '900', fontSize: 18 },
  hlViewerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hlCaption: { color: '#fff', fontSize: 15, textAlign: 'center', marginTop: 16, paddingHorizontal: spacing.lg },
});
