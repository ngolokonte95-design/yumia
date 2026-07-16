import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Dimensions, FlatList, Image, Modal, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Audio } from 'expo-av';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { API_BASE_URL } from '../../lib/config';
import { feedApi, type FeedPost, type StoryGroup } from '../../lib/feed-api';
import { YumiaLogo } from '../../components/YumiaLogo';
import { PostVideo } from '../../components/PostVideo';

const API = API_BASE_URL;

/** Détecte une URL vidéo par son extension (les vidéos sont stockées dans mediaUrls). */
function isVideoUrl(url?: string | null): boolean {
  if (!url) return false;
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url) || url.includes('/video');
}

interface MusicMeta { title: string; artist?: string; artworkUrl?: string; previewUrl?: string }
function parseMusicTrack(raw?: string | null): MusicMeta | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as MusicMeta; } catch { return { title: raw }; }
}

type Tab = 'foryou' | 'following' | 'activity' | 'encounters' | 'people';

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

// ── Barre de stories (façon Instagram) ───────────────────────────────────────

function StoriesBar({
  groups, myId, myPhoto, myName, onCreate, onOpen,
}: {
  groups: StoryGroup[];
  myId?: string;
  myPhoto?: string;
  myName?: string;
  onCreate: () => void;
  onOpen: (userId: string) => void;
}) {
  const myGroup = groups.find((g) => g.user?.id === myId);
  const others = groups.filter((g) => g.user?.id !== myId);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginBottom: spacing.sm }}
      contentContainerStyle={{ paddingHorizontal: spacing.md, gap: 14 }}
    >
      {/* Votre story — toujours en 1er, à gauche, avec le + */}
      <Pressable style={styles.storyItem} onPress={() => (myGroup ? onOpen(myId!) : onCreate())}>
        <View style={styles.storyMineWrap}>
          <View style={[styles.storyRing, myGroup?.hasUnseen ? styles.storyRingActive : styles.storyRingMine]}>
            {myPhoto ? (
              <Image source={{ uri: myPhoto }} style={styles.storyAvatar} />
            ) : (
              <View style={[styles.storyAvatar, styles.storyAvatarFallback]}>
                <Text style={styles.storyAvatarLetter}>{(myName ?? 'M')[0].toUpperCase()}</Text>
              </View>
            )}
          </View>
          <Pressable style={styles.storyPlus} onPress={onCreate} hitSlop={8}>
            <Text style={styles.storyPlusTxt}>+</Text>
          </Pressable>
        </View>
        <Text style={styles.storyName} numberOfLines={1}>Votre story</Text>
      </Pressable>

      {/* Stories des autres utilisateurs Yumia */}
      {others.map((group) => (
        <Pressable key={group.user.id} style={styles.storyItem} onPress={() => onOpen(group.user.id)}>
          <View style={[styles.storyRing, group.hasUnseen && styles.storyRingActive]}>
            {group.user.photoUrl ? (
              <Image source={{ uri: group.user.photoUrl }} style={styles.storyAvatar} />
            ) : (
              <View style={[styles.storyAvatar, styles.storyAvatarFallback]}>
                <Text style={styles.storyAvatarLetter}>{group.user.displayName[0]?.toUpperCase()}</Text>
              </View>
            )}
          </View>
          <Text style={styles.storyName} numberOfLines={1}>{group.user.displayName.split(' ')[0]}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// ── Carrousel de médias swipeable (façon Instagram) ──────────────────────────

const SCREEN_W = Dimensions.get('window').width;

function MediaCarousel({ urls, onPress }: { urls: string[]; onPress: () => void }) {
  const [idx, setIdx] = useState(0);
  return (
    <View>
      <FlatList
        data={urls}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(u, i) => `${i}-${u}`}
        onMomentumScrollEnd={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))}
        renderItem={({ item: url }) => (
          <Pressable onPress={onPress}>
            {isVideoUrl(url) ? (
              <PostVideo uri={url} style={{ width: SCREEN_W, aspectRatio: 1 }} />
            ) : (
              <Image source={{ uri: url }} style={{ width: SCREEN_W, aspectRatio: 1 }} />
            )}
          </Pressable>
        )}
      />
      {/* Compteur en haut à droite */}
      <View style={styles.multiIndicator}>
        <Text style={styles.multiIndicatorText}>{idx + 1}/{urls.length}</Text>
      </View>
      {/* Points d'index en bas */}
      <View style={styles.carouselDots}>
        {urls.map((_, i) => (
          <View key={i} style={[styles.carouselDot, i === idx && styles.carouselDotActive]} />
        ))}
      </View>
    </View>
  );
}

// ── Carte de publication (façon Instagram) ───────────────────────────────────

function PostCard({ item, onLike, onSave, onRepost, onComment, onShare, onUserPress, isMusicPlaying, onMusicPress }: {
  item: FeedPost;
  onLike: (id: string) => void;
  onSave: (id: string) => void;
  onRepost: (id: string) => void;
  onComment: (id: string) => void;
  onShare: (item: FeedPost) => void;
  onUserPress: (id: string) => void;
  isMusicPlaying?: boolean;
  onMusicPress?: (postId: string, previewUrl: string) => void;
}) {
  return (
    <View style={styles.postCard}>
      {/* Auteur */}
      <Pressable style={styles.postAuthor} onPress={() => item.user && onUserPress(item.user.id)}>
        {item.user?.photoUrl ? (
          <Image source={{ uri: item.user.photoUrl }} style={styles.postAvatar} />
        ) : (
          <View style={[styles.postAvatar, styles.storyAvatarFallback]}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{item.user?.displayName[0]}</Text>
          </View>
        )}
        <View>
          <Text style={styles.postAuthorName}>{item.user?.displayName ?? 'Utilisateur'}</Text>
          {item.place && <Text style={styles.postPlace}>📍 {item.place.name}</Text>}
        </View>
        <Text style={styles.postAgo}>{formatAgo(item.createdAt)}</Text>
      </Pressable>

      {/* Média — carrousel swipeable si plusieurs, vidéo jouée inline, sinon photo */}
      {(() => {
        if (item.mediaUrls.length > 1) {
          return <MediaCarousel urls={item.mediaUrls} onPress={() => onComment(item.id)} />;
        }
        const media = item.mediaUrls[0];
        const videoSrc = isVideoUrl(media) ? media : (item.videoUrl ?? undefined);
        if (videoSrc) {
          return videoSrc.startsWith('http')
            ? <PostVideo uri={videoSrc} style={styles.postImage} />
            : (
              <View style={[styles.postImage, styles.videoPlaceholder]}>
                <Text style={{ fontSize: 48 }}>🎬</Text>
              </View>
            );
        }
        if (media) {
          return (
            <Pressable onPress={() => onComment(item.id)}>
              <Image source={{ uri: media }} style={styles.postImage} />
            </Pressable>
          );
        }
        return null;
      })()}

      {/* Musique */}
      {item.musicTrack && (() => {
        const music = parseMusicTrack(item.musicTrack);
        if (!music) return null;
        return (
          <Pressable
            style={styles.musicBadge}
            onPress={() => music.previewUrl && onMusicPress ? onMusicPress(item.id, music.previewUrl) : null}
          >
            {music.artworkUrl ? <Image source={{ uri: music.artworkUrl }} style={styles.musicArtwork} /> : <Text style={{ fontSize: 18 }}>🎵</Text>}
            <View style={{ flex: 1 }}>
              <Text style={styles.musicTitle} numberOfLines={1}>{music.title}</Text>
              {music.artist ? <Text style={styles.musicArtist} numberOfLines={1}>{music.artist}</Text> : null}
            </View>
            {music.previewUrl ? <Text style={{ fontSize: 16 }}>{isMusicPlaying ? '⏸' : '▶️'}</Text> : null}
          </Pressable>
        );
      })()}

      {/* Actions — like · commentaire · republier · message  (+ enregistrer à droite) */}
      <View style={styles.postActions}>
        <Pressable style={styles.actionBtn} onPress={() => onLike(item.id)}>
          <Text style={styles.actionIcon}>{item.likedByMe ? '❤️' : '🤍'}</Text>
          {!item.hideLikeCount && item.likesCount > 0 && <Text style={styles.actionCount}>{item.likesCount}</Text>}
        </Pressable>
        {!item.commentsDisabled && (
          <Pressable style={styles.actionBtn} onPress={() => onComment(item.id)}>
            <Text style={styles.actionIcon}>💬</Text>
            {item.commentsCount > 0 && <Text style={styles.actionCount}>{item.commentsCount}</Text>}
          </Pressable>
        )}
        <Pressable style={styles.actionBtn} onPress={() => onRepost(item.id)}>
          <Text style={[styles.actionIcon, item.repostedByMe && styles.actionIconActive]}>🔁</Text>
          {item.repostsCount > 0 && <Text style={styles.actionCount}>{item.repostsCount}</Text>}
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={() => onShare(item)}>
          <Text style={styles.actionIcon}>✈️</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable style={styles.actionBtn} onPress={() => onSave(item.id)}>
          <Text style={styles.actionIcon}>{item.savedByMe ? '🔖' : '📑'}</Text>
        </Pressable>
      </View>

      {item.caption ? (
        <Text style={styles.postCaption} numberOfLines={3}>
          <Text style={{ fontWeight: '700' }}>{item.user?.displayName} </Text>
          {item.caption}
        </Text>
      ) : null}
      {item.commentsCount > 0 ? (
        <Pressable onPress={() => onComment(item.id)}>
          <Text style={styles.postComments}>Voir les {item.commentsCount} commentaires</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Écran principal ──────────────────────────────────────────────────────────

export default function SocialTab() {
  const { accessToken, user: me } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('foryou');
  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [globalPosts, setGlobalPosts] = useState<FeedPost[]>([]);
  const [followingPosts, setFollowingPosts] = useState<FeedPost[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; displayName: string; photoUrl?: string; bio?: string }>>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<Array<{ id: string; displayName: string; photoUrl?: string; bio?: string }>>([]);

  // Music playback in feed
  const [playingMusicId, setPlayingMusicId] = useState<string | null>(null);
  const musicSoundRef = useRef<Audio.Sound | null>(null);

  const stopMusic = useCallback(async () => {
    if (musicSoundRef.current) {
      await musicSoundRef.current.stopAsync().catch(() => null);
      await musicSoundRef.current.unloadAsync().catch(() => null);
      musicSoundRef.current = null;
    }
    setPlayingMusicId(null);
  }, []);

  const handleMusicPress = useCallback(async (postId: string, previewUrl: string) => {
    if (playingMusicId === postId) { await stopMusic(); return; }
    await stopMusic();
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: previewUrl }, { shouldPlay: true });
      musicSoundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((st) => { if (st.isLoaded && !st.isPlaying) setPlayingMusicId(null); });
      setPlayingMusicId(postId);
    } catch { setPlayingMusicId(null); }
  }, [playingMusicId, stopMusic]);

  useEffect(() => () => { void stopMusic(); }, [stopMusic]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const h = { Authorization: `Bearer ${accessToken}` };
    const [storiesRes, globalRes, followRes, actRes, encRes, followingRes, suggestionsRes] = await Promise.allSettled([
      feedApi.globalStories(accessToken),
      feedApi.globalFeed(accessToken),
      feedApi.followingFeed(accessToken),
      fetch(`${API}/social/feed`, { headers: h }),
      fetch(`${API}/discover/encounters`, { headers: h }),
      me?.id ? fetch(`${API}/social/users/${me.id}/following`, { headers: h }) : Promise.resolve(null as unknown as Response),
      me?.id ? fetch(`${API}/social/users/search?q=&limit=20`, { headers: h }) : Promise.resolve(null as unknown as Response),
    ]);
    if (storiesRes.status === 'fulfilled') setStories(storiesRes.value);
    if (globalRes.status === 'fulfilled') setGlobalPosts(globalRes.value);
    if (followRes.status === 'fulfilled') setFollowingPosts(followRes.value);
    if (actRes.status === 'fulfilled' && actRes.value?.ok) setFeed(await actRes.value.json());
    if (encRes.status === 'fulfilled' && encRes.value?.ok) setEncounters(await encRes.value.json());
    if (followingRes.status === 'fulfilled' && followingRes.value?.ok) {
      const list = await followingRes.value.json() as Array<{ id: string }>;
      setFollowing(new Set(list.map((u) => u.id)));
    }
    if (suggestionsRes.status === 'fulfilled' && suggestionsRes.value?.ok) {
      setSuggestions(await suggestionsRes.value.json());
    }
    setLoading(false);
    setRefreshing(false);
  }, [accessToken, me?.id]);

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

  // ── Mutations optimistes ───────────────────────────────────────────────────
  const patchPost = (id: string, patch: Partial<FeedPost>) => {
    const apply = (list: FeedPost[]) => list.map((p) => p.id === id ? { ...p, ...patch } : p);
    setGlobalPosts(apply);
    setFollowingPosts(apply);
  };

  const toggleLike = async (postId: string) => {
    if (!accessToken) return;
    const cur = [...globalPosts, ...followingPosts].find((p) => p.id === postId);
    patchPost(postId, { likedByMe: !cur?.likedByMe, likesCount: (cur?.likesCount ?? 0) + (cur?.likedByMe ? -1 : 1) });
    const res = await feedApi.toggleLike(accessToken, postId);
    patchPost(postId, { likedByMe: res.liked, likesCount: res.likesCount });
  };

  const toggleSave = async (postId: string) => {
    if (!accessToken) return;
    const cur = [...globalPosts, ...followingPosts].find((p) => p.id === postId);
    patchPost(postId, { savedByMe: !cur?.savedByMe });
    const res = await feedApi.toggleSave(accessToken, postId);
    patchPost(postId, { savedByMe: res.saved });
  };

  const toggleRepost = async (postId: string) => {
    if (!accessToken) return;
    const cur = [...globalPosts, ...followingPosts].find((p) => p.id === postId);
    patchPost(postId, { repostedByMe: !cur?.repostedByMe, repostsCount: (cur?.repostsCount ?? 0) + (cur?.repostedByMe ? -1 : 1) });
    const res = await feedApi.toggleRepost(accessToken, postId);
    patchPost(postId, { repostedByMe: res.reposted, repostsCount: res.repostsCount });
  };

  const toggleFollow = async (targetId: string) => {
    if (!accessToken) return;
    const isFollowing = following.has(targetId);
    const res = await fetch(`${API}/social/follow/${targetId}`, { method: isFollowing ? 'DELETE' : 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) {
      setFollowing((prev) => { const s = new Set(prev); if (isFollowing) s.delete(targetId); else s.add(targetId); return s; });
    }
  };

  const openComments = (postId: string) => router.push(`/post/${postId}` as never);

  // ── Partage d'un post en DM : sélecteur de conversation ─────────────────────
  const [sharePost, setSharePost] = useState<FeedPost | null>(null);
  const [shareConvs, setShareConvs] = useState<Array<{ id: string; isGroup?: boolean; title?: string | null; otherUser: { id: string; displayName: string; photoUrl?: string } | null }>>([]);
  const [shareSending, setShareSending] = useState<string | null>(null);

  const shareToDM = async (item: FeedPost) => {
    if (!accessToken) return;
    setSharePost(item);
    const res = await fetch(`${API}/chat/conversations`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) setShareConvs(await res.json());
  };

  const sendShare = async (convId: string) => {
    if (!accessToken || !sharePost) return;
    setShareSending(convId);
    await fetch(`${API}/chat/conversations/${convId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ content: '📤 A partagé une publication', type: 'post_share', postId: sharePost.id }),
    }).catch(() => {});
    setShareSending(null);
    setSharePost(null);
  };

  if (loading) return <View style={[styles.center, { paddingTop: insets.top }]}><ActivityIndicator color={colors.brand} /></View>;

  const renderPostList = (data: FeedPost[], emptyEmoji: string, emptyTitle: string, emptyText: string, withStories: boolean) => (
    <FlatList
      data={data}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={withStories ? (
        <StoriesBar
          groups={stories}
          myId={me?.id}
          myPhoto={me?.photoUrl ?? undefined}
          myName={me?.displayName}
          onCreate={() => router.push('/camera?mode=story' as never)}
          onOpen={(userId) => router.push(`/story-viewer?userId=${userId}` as never)}
        />
      ) : null}
      renderItem={({ item }) => (
        <PostCard
          item={item}
          onLike={toggleLike}
          onSave={toggleSave}
          onRepost={toggleRepost}
          onComment={openComments}
          onShare={shareToDM}
          onUserPress={(id) => router.push(`/user/${id}` as never)}
          isMusicPlaying={playingMusicId === item.id}
          onMusicPress={handleMusicPress}
        />
      )}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} />}
      contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>{emptyEmoji}</Text>
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          <Text style={styles.emptyText}>{emptyText}</Text>
          <Pressable style={styles.emptyBtn} onPress={() => router.push('/post/create' as never)}>
            <Text style={styles.emptyBtnText}>📷 Photo · 🎬 Vidéo</Text>
          </Pressable>
        </View>
      }
    />
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header : Reels + logo Yumia bien visible + Créer + Messages */}
      <View style={styles.topBar}>
        <View style={styles.leftBtns}>
          <Pressable style={styles.reelsBtn} onPress={() => router.push('/reels' as never)}>
            <Text style={styles.reelsBtnIcon}>▶</Text>
            <Text style={styles.reelsBtnLabel}>Reels</Text>
          </Pressable>
          <Pressable style={styles.memoriesBtn} onPress={() => router.push('/memories' as never)}>
            <Text style={styles.memoriesBtnIcon}>📁</Text>
            <Text style={styles.memoriesBtnLabel}>Souvenirs</Text>
          </Pressable>
        </View>
        <YumiaLogo height={88} />
        <View style={styles.topBarActions}>
          <Pressable style={styles.iconBtn} onPress={() => router.push('/camera' as never)}>
            <Text style={styles.iconBtnTxt}>➕</Text>
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => router.push('/chat' as never)}>
            <Text style={styles.iconBtnTxt}>✉️</Text>
          </Pressable>
        </View>
      </View>

      {/* Raccourcis (profil, découvrir, carte, meetups) */}
      <View style={styles.header}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.headerActions}>
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
        </ScrollView>
      </View>

      {/* Recherche */}
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
          renderItem={({ item }) => {
            const isMe = item.id === me?.id;
            const isFollowed = following.has(item.id);
            return (
              <Pressable style={styles.userRow} onPress={() => router.push(`/user/${item.id}`)}>
                {item.photoUrl ? (
                  <Image source={{ uri: item.photoUrl }} style={styles.userAvatar} />
                ) : (
                  <View style={[styles.userAvatar, styles.storyAvatarFallback]}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{item.displayName[0]}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{item.displayName}</Text>
                  {item.bio ? <Text style={styles.userBio} numberOfLines={1}>{item.bio}</Text> : null}
                </View>
                {!isMe && (
                  <Pressable style={[styles.followBtn, isFollowed && styles.followBtnActive]} onPress={() => void toggleFollow(item.id)}>
                    <Text style={[styles.followBtnText, isFollowed && styles.followBtnTextActive]}>{isFollowed ? 'Abonné' : 'Suivre'}</Text>
                  </Pressable>
                )}
              </Pressable>
            );
          }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        />
      ) : (
        <>
          {/* Onglets */}
          <View style={styles.tabs}>
            {(['foryou', 'following', 'activity', 'encounters', 'people'] as Tab[]).map((t) => (
              <Pressable key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)}>
                <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>
                  {t === 'foryou' ? '✨ Pour vous' : t === 'following' ? '📸 Abonnements' : t === 'activity' ? '🏃 Activité' : t === 'encounters' ? '⚡ Rencontres' : '👥 Personnes'}
                </Text>
              </Pressable>
            ))}
          </View>

          {tab === 'foryou' && renderPostList(globalPosts, '✨', 'Le feed Yumia démarre ici', 'Sois le premier à publier une photo ou vidéo pour toute la communauté Yumia !', true)}

          {tab === 'following' && renderPostList(followingPosts, '📸', 'Aucune publication', 'Suis des gens pour voir leurs publications ici, ou publie ta première photo !', true)}

          {tab === 'activity' && (
            <FlatList
              data={feed}
              keyExtractor={(i) => i.id}
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
                  <View style={[styles.encounterAvatar, styles.storyAvatarFallback]}>
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

          {tab === 'people' && (
            <FlatList
              data={suggestions}
              keyExtractor={(u) => u.id}
              contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 80 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} />}
              ListHeaderComponent={
                <View style={styles.peopleHeader}>
                  <Text style={styles.peopleTitle}>Personnes à suivre</Text>
                  <Text style={styles.peopleSubtitle}>Découvre la communauté Yumia</Text>
                </View>
              }
              renderItem={({ item }) => {
                const isMe = item.id === me?.id;
                const isFollowed = following.has(item.id);
                return (
                  <Pressable style={styles.userRow} onPress={() => router.push(`/user/${item.id}`)}>
                    {item.photoUrl ? (
                      <Image source={{ uri: item.photoUrl }} style={styles.userAvatar} />
                    ) : (
                      <View style={[styles.userAvatar, styles.storyAvatarFallback]}>
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>{item.displayName[0]}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName}>{item.displayName}</Text>
                      {item.bio ? <Text style={styles.userBio} numberOfLines={1}>{item.bio}</Text> : null}
                    </View>
                    {!isMe && (
                      <Pressable style={[styles.followBtn, isFollowed && styles.followBtnActive]} onPress={() => void toggleFollow(item.id)}>
                        <Text style={[styles.followBtnText, isFollowed && styles.followBtnTextActive]}>{isFollowed ? 'Abonné ✓' : 'Suivre'}</Text>
                      </Pressable>
                    )}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyEmoji}>👥</Text>
                  <Text style={styles.emptyTitle}>Aucune suggestion</Text>
                  <Text style={styles.emptyText}>Utilise la barre de recherche pour trouver des utilisateurs à suivre.</Text>
                </View>
              }
            />
          )}
        </>
      )}

      {/* ── Partage en DM : choisir la conversation ─────────────────────────── */}
      <Modal visible={sharePost !== null} transparent animationType="slide" onRequestClose={() => setSharePost(null)}>
        <Pressable style={styles.shareOverlay} onPress={() => setSharePost(null)}>
          <View style={styles.shareSheet}>
            <Text style={styles.shareTitle}>✈️ Envoyer à...</Text>
            <FlatList
              data={shareConvs}
              keyExtractor={(c) => c.id}
              style={{ maxHeight: 320 }}
              ListEmptyComponent={<Text style={styles.shareEmpty}>Aucune conversation. Va sur un profil pour en démarrer une !</Text>}
              renderItem={({ item: conv }) => {
                const name = conv.isGroup ? (conv.title ?? 'Groupe') : (conv.otherUser?.displayName ?? '?');
                return (
                  <Pressable style={styles.shareRow} onPress={() => void sendShare(conv.id)}>
                    {conv.otherUser?.photoUrl ? (
                      <Image source={{ uri: conv.otherUser.photoUrl }} style={styles.shareAvatar} />
                    ) : (
                      <View style={[styles.shareAvatar, styles.storyAvatarFallback]}>
                        <Text style={{ color: '#fff', fontWeight: '700' }}>{conv.isGroup ? '👥' : name[0]}</Text>
                      </View>
                    )}
                    <Text style={styles.shareName}>{name}</Text>
                    {shareSending === conv.id
                      ? <ActivityIndicator color={colors.brand} size="small" />
                      : <Text style={styles.shareSendTxt}>Envoyer</Text>}
                  </Pressable>
                );
              }}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { alignItems: 'center', justifyContent: 'center', paddingTop: 2, paddingBottom: 4 },
  topBarActions: { position: 'absolute', right: spacing.md, top: 6, flexDirection: 'row', gap: 8 },
  leftBtns: { position: 'absolute', left: spacing.md, top: 8, flexDirection: 'row', gap: 14, alignItems: 'center' },
  reelsBtn: { alignItems: 'center', gap: 2 },
  reelsBtnIcon: { fontSize: 20, color: colors.brand },
  reelsBtnLabel: { fontSize: 10, color: colors.brand, fontWeight: '700' },
  memoriesBtn: { alignItems: 'center', gap: 2 },
  memoriesBtnIcon: { fontSize: 20 },
  memoriesBtnLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '700' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  iconBtnTxt: { fontSize: 18 },
  header: { paddingBottom: 6 },
  headerActions: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.md },
  headerBtn: { backgroundColor: colors.surface, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  headerBtnText: { fontSize: 12, color: colors.text, fontWeight: '600' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.md, marginBottom: spacing.sm, gap: 8 },
  searchInput: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12, color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border },
  tabs: { flexDirection: 'row', marginHorizontal: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.md },
  tabBtnActive: { backgroundColor: colors.background },
  tabBtnText: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  tabBtnTextActive: { color: colors.brand, fontWeight: '700' },
  // Stories
  storyItem: { alignItems: 'center', width: 68 },
  storyMineWrap: { width: 64, height: 64, marginBottom: 4 },
  storyRing: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: colors.border, padding: 2 },
  storyRingActive: { borderColor: colors.brand },
  storyRingMine: { borderColor: colors.border, borderStyle: 'dashed' },
  storyAvatar: { width: 54, height: 54, borderRadius: 27 },
  storyAvatarFallback: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  storyAvatarLetter: { color: '#fff', fontWeight: '700', fontSize: 18 },
  storyPlus: { position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.background },
  storyPlusTxt: { color: '#fff', fontSize: 14, fontWeight: '800', lineHeight: 16 },
  storyName: { fontSize: 11, color: colors.text, textAlign: 'center' },
  // Post card
  postCard: { backgroundColor: colors.surface, marginBottom: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  postAuthor: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, gap: 10 },
  postAvatar: { width: 36, height: 36, borderRadius: 18 },
  postAuthorName: { fontWeight: '700', color: colors.text, fontSize: 13 },
  postPlace: { fontSize: 11, color: colors.textMuted },
  postAgo: { marginLeft: 'auto', fontSize: 12, color: colors.textMuted },
  postImage: { width: '100%', aspectRatio: 1 },
  videoPlaceholder: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  videoBadge: { position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 16, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  multiIndicator: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  multiIndicatorText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  carouselDots: { position: 'absolute', bottom: 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  carouselDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' },
  carouselDotActive: { backgroundColor: '#fff', width: 7, height: 7, borderRadius: 3.5 },
  postActions: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, alignItems: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  actionIcon: { fontSize: 22 },
  actionIconActive: { opacity: 1 },
  actionCount: { fontWeight: '700', color: colors.text, fontSize: 13 },
  musicBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: spacing.sm, marginTop: 2, marginBottom: 2, backgroundColor: colors.background + 'cc', borderRadius: radius.lg, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  musicArtwork: { width: 34, height: 34, borderRadius: 4 },
  musicTitle: { fontSize: 12, color: colors.text, fontWeight: '700' },
  musicArtist: { fontSize: 11, color: colors.textMuted },
  postCaption: { paddingHorizontal: spacing.sm, paddingBottom: 4, fontSize: 13, color: colors.text, lineHeight: 18 },
  postComments: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, fontSize: 13, color: colors.textMuted },
  // Activité
  feedCard: { flexDirection: 'row', marginHorizontal: spacing.md, marginBottom: 8, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  feedThumb: { width: 70, height: 70 },
  feedBody: { flex: 1, padding: spacing.sm, justifyContent: 'center' },
  feedUser: { fontSize: 12, color: colors.textMuted, marginBottom: 2 },
  feedPlace: { fontWeight: '700', color: colors.text, fontSize: 14 },
  feedCity: { fontSize: 12, color: colors.textMuted },
  // Rencontres
  encounterCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.xl, marginBottom: 10, padding: spacing.md, gap: 12, borderWidth: 1, borderColor: colors.border },
  encounterAvatar: { width: 52, height: 52, borderRadius: 26 },
  encounterInfo: { flex: 1 },
  encounterName: { fontWeight: '700', color: colors.text, fontSize: 15, marginBottom: 2 },
  encounterPlace: { fontSize: 13, color: colors.textMuted, marginBottom: 2 },
  encounterTime: { fontSize: 12, color: colors.brand },
  encounterLevel: { fontSize: 12, color: colors.textMuted },
  // Users
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 10 },
  userAvatar: { width: 44, height: 44, borderRadius: 22 },
  userName: { fontWeight: '700', color: colors.text, fontSize: 15 },
  userBio: { fontSize: 13, color: colors.textMuted, maxWidth: 240 },
  followBtn: { backgroundColor: colors.brand, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 6 },
  followBtnActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  followBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  followBtnTextActive: { color: colors.text },
  peopleHeader: { paddingHorizontal: spacing.md, paddingTop: 8, paddingBottom: 12 },
  peopleTitle: { ...typography.h3, color: colors.text, marginBottom: 2 },
  peopleSubtitle: { fontSize: 13, color: colors.textMuted },
  // Partage en DM
  shareOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  shareSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 40 },
  shareTitle: { color: colors.text, fontWeight: '800', fontSize: 16, marginBottom: 12 },
  shareEmpty: { color: colors.textMuted, fontSize: 13, paddingVertical: 20, textAlign: 'center' },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  shareAvatar: { width: 44, height: 44, borderRadius: 22 },
  shareName: { flex: 1, color: colors.text, fontWeight: '600', fontSize: 14 },
  shareSendTxt: { color: colors.brand, fontWeight: '700', fontSize: 13 },
  // Empty
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { ...typography.h3, color: colors.text, textAlign: 'center', marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  emptyBtn: { backgroundColor: colors.brand, borderRadius: radius.lg, paddingHorizontal: 24, paddingVertical: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
