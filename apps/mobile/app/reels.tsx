import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Dimensions, FlatList, Image, Pressable,
  Share, StyleSheet, Text, View, ViewToken,
} from 'react-native';
import { Audio } from 'expo-av';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAuth } from '../lib/auth-context';
import { colors, radius, spacing } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';
import { feedApi, type FeedPost } from '../lib/feed-api';

const { width: W, height: H } = Dimensions.get('window');
const API = API_BASE_URL;

type ReelTab = 'foryou' | 'following';

// ── Lecteur vidéo d'un seul reel ─────────────────────────────────────────────
function ReelVideo({ uri, active, muted }: { uri: string; active: boolean; muted: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = muted;
  });

  useEffect(() => {
    try { player.muted = muted; } catch {}
  }, [muted, player]);

  useEffect(() => {
    if (active) {
      player.play();
    } else {
      player.pause();
    }
  }, [active, player]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

// ── Carte d'un reel ──────────────────────────────────────────────────────────
function ReelCard({
  item, active, onLike, onComment, onShare, onUserPress, onFollow,
  screenHeight,
}: {
  item: FeedPost;
  active: boolean;
  onLike: (id: string) => void;
  onComment: (id: string) => void;
  onShare: (item: FeedPost) => void;
  onUserPress: (id: string) => void;
  onFollow: (id: string) => void;
  screenHeight: number;
}) {
  const musicMeta = item.musicTrack ? (() => {
    try { return JSON.parse(item.musicTrack) as { title?: string; artist?: string; artworkUrl?: string; previewUrl?: string; startMs?: number }; }
    catch { return null; }
  })() : null;
  const [muted, setMuted] = useState(!!musicMeta);
  const [liked, setLiked] = useState(item.likedByMe);
  const [likes, setLikes] = useState(item.likesCount);
  const musicSoundRef = useRef<Audio.Sound | null>(null);
  const diskAnim = useRef(new Animated.Value(0)).current;
  const diskLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Lecture de la piste musicale synchronisée avec l'activité du reel
  useEffect(() => {
    // Les URLs CDN Deezer/iTunes ne sont pas lisibles par expo-av : on ignore
    // les anciennes pistes qui pointent encore vers ces CDN (sinon « Unable to open URL »).
    const playable = musicMeta?.previewUrl && !/dzcdn\.net|itunes\.apple\.com|mzstatic\.com/i.test(musicMeta.previewUrl);
    if (!playable) return;
    let sound: Audio.Sound | null = null;
    if (active) {
      const load = async () => {
        try {
          await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
          const { sound: s } = await Audio.Sound.createAsync(
            { uri: musicMeta.previewUrl! },
            { shouldPlay: true, positionMillis: musicMeta.startMs ?? 0, isLooping: true },
          );
          sound = s;
          musicSoundRef.current = s;
          // Gère les erreurs async (URL AAC protégée, réseau, etc.)
          s.setOnPlaybackStatusUpdate((st) => {
            if (!st.isLoaded && st.error) {
              s.unloadAsync().catch(() => null);
              if (musicSoundRef.current === s) musicSoundRef.current = null;
            }
          });
        } catch {}
      };
      void load();
    } else {
      musicSoundRef.current?.stopAsync().catch(() => null);
      musicSoundRef.current?.unloadAsync().catch(() => null);
      musicSoundRef.current = null;
    }
    return () => {
      sound?.stopAsync().catch(() => null);
      sound?.unloadAsync().catch(() => null);
      musicSoundRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Rotation du disque vinyle
  useEffect(() => {
    diskLoopRef.current?.stop();
    diskAnim.setValue(0);
    if (active && musicMeta) {
      diskLoopRef.current = Animated.loop(
        Animated.timing(diskAnim, { toValue: 1, duration: 4000, useNativeDriver: true }),
      );
      diskLoopRef.current.start();
    }
  }, [active, musicMeta, diskAnim]);

  const handleLike = () => {
    setLiked((v) => !v);
    setLikes((v) => v + (liked ? -1 : 1));
    onLike(item.id);
  };

  const mediaUrl = item.mediaUrls?.[0];
  const isVideo = !!mediaUrl && (mediaUrl.includes('.mp4') || mediaUrl.includes('.mov') || mediaUrl.includes('video'));

  return (
    <View style={[styles.reelCard, { height: screenHeight }]}>
      {/* Fond / vidéo */}
      {mediaUrl ? (
        isVideo ? (
          <ReelVideo uri={mediaUrl} active={active} muted={muted} />
        ) : (
          <Image source={{ uri: mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        )
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111' }]} />
      )}

      {/* Overlay gradient bas */}
      <View style={styles.reelOverlay} />

      {/* Tap pour mute/unmute */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setMuted((v) => !v)} />

      {/* Boutons droite */}
      <View style={styles.reelActions}>
        {/* Avatar auteur */}
        <Pressable onPress={() => item.user && onUserPress(item.user.id)} style={styles.reelAvatarWrap}>
          {item.user?.photoUrl ? (
            <Image source={{ uri: item.user.photoUrl }} style={styles.reelAvatar} />
          ) : (
            <View style={[styles.reelAvatar, { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{item.user?.displayName[0]}</Text>
            </View>
          )}
          <Pressable style={styles.followBadge} onPress={() => item.user && onFollow(item.user.id)}>
            <Text style={styles.followBadgeTxt}>+</Text>
          </Pressable>
        </Pressable>

        {/* Like */}
        <Pressable style={styles.reelActionBtn} onPress={handleLike}>
          <Text style={[styles.reelActionIcon, liked && { color: '#FF3040' }]}>♥</Text>
          <Text style={styles.reelActionCount}>{likes}</Text>
        </Pressable>

        {/* Commentaire */}
        <Pressable style={styles.reelActionBtn} onPress={() => onComment(item.id)}>
          <Text style={styles.reelActionIcon}>💬</Text>
          <Text style={styles.reelActionCount}>{item.commentsCount ?? 0}</Text>
        </Pressable>

        {/* Repost */}
        <Pressable style={styles.reelActionBtn}>
          <Text style={styles.reelActionIcon}>🔁</Text>
          <Text style={styles.reelActionCount}>{item.repostsCount ?? 0}</Text>
        </Pressable>

        {/* Partager */}
        <Pressable style={styles.reelActionBtn} onPress={() => onShare(item)}>
          <Text style={styles.reelActionIcon}>↗</Text>
          <Text style={styles.reelActionCount}>12</Text>
        </Pressable>

        {/* ... menu */}
        <Pressable style={styles.reelActionBtn}>
          <Text style={styles.reelActionIcon}>···</Text>
        </Pressable>

        {/* Disque vinyle animé */}
        <Animated.View style={[styles.musicDisk, {
          transform: [{ rotate: diskAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
        }]}>
          {musicMeta?.artworkUrl
            ? <Image source={{ uri: musicMeta.artworkUrl }} style={styles.musicDiskImg} />
            : <Text style={{ fontSize: 18 }}>🎵</Text>}
        </Animated.View>
      </View>

      {/* Infos bas */}
      <View style={styles.reelInfo}>
        <Pressable style={styles.reelAuthorRow} onPress={() => item.user && onUserPress(item.user.id)}>
          <Text style={styles.reelAuthorName}>{item.user?.displayName ?? 'Yumia'}</Text>
          {/* Bouton Suivre inline */}
          <Pressable style={styles.reelFollowBtn} onPress={() => item.user && onFollow(item.user.id)}>
            <Text style={styles.reelFollowTxt}>Suivre</Text>
          </Pressable>
        </Pressable>
        {item.caption ? (
          <Text style={styles.reelCaption} numberOfLines={2}>{item.caption}</Text>
        ) : null}
        {musicMeta?.title ? (
          <Text style={styles.reelMusicRow} numberOfLines={1}>🎵 {musicMeta.title}{musicMeta.artist ? ` • ${musicMeta.artist}` : ''}</Text>
        ) : null}
        {/* Barre de progression */}
        <View style={styles.reelProgressBar}>
          <View style={[styles.reelProgressFill, { width: active ? '100%' : '0%' }]} />
        </View>
      </View>

      {/* Icône son — mute vidéo ET piste musicale */}
      <Pressable style={styles.muteBtn} onPress={() => {
        setMuted((v) => {
          const next = !v;
          if (musicSoundRef.current) {
            if (next) { musicSoundRef.current.pauseAsync().catch(() => null); }
            else { musicSoundRef.current.playAsync().catch(() => null); }
          }
          return next;
        });
      }}>
        <Text style={{ fontSize: 20, color: '#fff' }}>{muted ? '🔇' : '🔊'}</Text>
      </Pressable>
    </View>
  );
}

// ── Écran principal Reels ────────────────────────────────────────────────────
export default function ReelsScreen() {
  const { accessToken, user: me } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [reelTab, setReelTab] = useState<ReelTab>('foryou');
  const [reels, setReels] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [screenFocused, setScreenFocused] = useState(true);
  const [following, setFollowing] = useState<Set<string>>(new Set());

  // Stop tout l'audio quand l'utilisateur quitte l'écran reels
  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    return () => setScreenFocused(false);
  }, []));

  const screenH = H; // Hauteur totale

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const feed = reelTab === 'foryou'
        ? await feedApi.globalFeed(accessToken, 30)
        : await feedApi.followingFeed(accessToken, 30);
      // On filtre les posts avec media (vidéos en priorité, photos aussi)
      setReels(feed.filter((p) => p.mediaUrls?.length > 0));
    } catch {
      setReels([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, reelTab]);

  useEffect(() => { void load(); }, [load]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index ?? 0);
    }
  }).current;

  const toggleLike = async (postId: string) => {
    if (!accessToken) return;
    await feedApi.toggleLike(accessToken, postId);
  };

  const toggleFollow = async (targetId: string) => {
    if (!accessToken || targetId === me?.id) return;
    const isFollowing = following.has(targetId);
    await fetch(`${API}/social/follow/${targetId}`, {
      method: isFollowing ? 'DELETE' : 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    setFollowing((prev) => {
      const s = new Set(prev);
      if (isFollowing) s.delete(targetId); else s.add(targetId);
      return s;
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: '#000' }]}>
      {/* Header flottant */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backTxt}>←</Text>
        </Pressable>
        <View style={styles.tabsRow}>
          <Pressable onPress={() => setReelTab('foryou')}>
            <Text style={[styles.tabTxt, reelTab === 'foryou' && styles.tabTxtActive]}>Pour vous</Text>
          </Pressable>
          <View style={styles.tabDivider} />
          <Pressable onPress={() => setReelTab('following')}>
            <Text style={[styles.tabTxt, reelTab === 'following' && styles.tabTxtActive]}>Ami(e)s</Text>
          </Pressable>
        </View>
        <Pressable style={styles.cameraBtn} onPress={() => router.push('/camera?mode=reel' as never)}>
          <Text style={{ fontSize: 22, color: '#fff' }}>📷</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#fff" size="large" /></View>
      ) : reels.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🎬</Text>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Aucun reel</Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', paddingHorizontal: 32, lineHeight: 22 }}>
            Sois le premier à publier une vidéo reel sur Yumia !
          </Text>
          <Pressable
            style={[styles.createReelBtn, { marginTop: 24 }]}
            onPress={() => router.push('/camera?mode=reel' as never)}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>🎬 Créer un reel</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={reels}
          keyExtractor={(p) => p.id}
          pagingEnabled
          snapToInterval={screenH}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          renderItem={({ item, index }) => (
            <ReelCard
              item={item}
              active={index === activeIndex && screenFocused}
              onLike={toggleLike}
              onComment={(id) => router.push(`/post/${id}` as never)}
              onShare={(it) => void Share.share({ message: `Regarde ce reel sur Yumia 🎬` })}
              onUserPress={(id) => router.push(`/user/${id}` as never)}
              onFollow={toggleFollow}
              screenHeight={screenH}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingBottom: 12,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  backTxt: { fontSize: 24, color: '#fff', fontWeight: '700' },
  tabsRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  tabTxt: { fontSize: 16, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  tabTxtActive: { color: '#fff', fontWeight: '700', textDecorationLine: 'underline' },
  tabDivider: { width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.3)' },
  cameraBtn: { width: 40, alignItems: 'flex-end' },

  // Reel card
  reelCard: { width: W, backgroundColor: '#000', position: 'relative' },
  reelOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 240,
    // gradient simulé via opacité
    backgroundColor: 'transparent',
  },

  // Actions droite
  reelActions: {
    position: 'absolute', right: 12, bottom: 100,
    alignItems: 'center', gap: 20,
  },
  reelAvatarWrap: { position: 'relative', marginBottom: 4 },
  reelAvatar: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: '#fff' },
  followBadge: {
    position: 'absolute', bottom: -8, left: '50%',
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#fff',
    transform: [{ translateX: -10 }],
  },
  followBadgeTxt: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 18 },
  reelActionBtn: { alignItems: 'center', gap: 3 },
  reelActionIcon: { fontSize: 28, color: '#fff' },
  reelActionCount: { fontSize: 13, color: '#fff', fontWeight: '600' },
  musicDisk: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  musicDiskImg: { width: 44, height: 44, borderRadius: 22 },
  reelMusicRow: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginBottom: 6 },

  // Infos bas
  reelInfo: {
    position: 'absolute', bottom: 0, left: 0, right: 70,
    padding: spacing.md, paddingBottom: 24,
  },
  reelAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  reelAuthorName: { color: '#fff', fontWeight: '700', fontSize: 15 },
  reelFollowBtn: {
    borderWidth: 1.5, borderColor: '#fff', borderRadius: radius.pill,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  reelFollowTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  reelCaption: { color: '#fff', fontSize: 14, lineHeight: 20, marginBottom: 10 },
  reelProgressBar: {
    height: 2, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 1,
    marginTop: 4,
  },
  reelProgressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 1 },

  // Mute
  muteBtn: {
    position: 'absolute', bottom: 100, left: 14,
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20,
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
  },

  createReelBtn: {
    backgroundColor: colors.brand, borderRadius: radius.pill,
    paddingHorizontal: 24, paddingVertical: 12,
  },
});
