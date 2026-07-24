import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Audio } from 'expo-av';
import { useAuth } from '../../lib/auth-context';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { API_BASE_URL } from '../../lib/config';

const API = API_BASE_URL;

interface MusicMeta { title: string; artist?: string; artworkUrl?: string; previewUrl?: string }
function parseMusicTrack(raw?: string | null): MusicMeta | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as MusicMeta; } catch { return { title: raw }; }
}

/**
 * Les URLs CDN Deezer/iTunes ne sont pas lisibles par expo-av (AVFoundation les
 * rejette → « Unable to open URL »). Seules les pistes réhébergées sur Yumia sont
 * jouables. On ignore donc les anciennes pistes pointant encore vers ces CDN.
 */
function isPlayableAudioUrl(url?: string | null): boolean {
  if (!url) return false;
  return !/dzcdn\.net|itunes\.apple\.com|mzstatic\.com/i.test(url);
}

interface Comment {
  id: string; content: string; createdAt: string;
  likesCount: number; likedByMe?: boolean; pinned?: boolean;
  user: { id: string; displayName: string; photoUrl?: string } | null;
  replies?: Comment[];
}

interface Post {
  id: string;
  userId: string;
  caption?: string;
  mediaUrls: string[];
  videoUrl?: string | null;
  musicTrack?: string | null;
  likesCount: number;
  likedByMe: boolean;
  hideLikeCount?: boolean;
  commentsDisabled?: boolean;
  editedAt?: string | null;
  createdAt: string;
  user: { id: string; displayName: string; photoUrl?: string } | null;
  place?: { name: string; universe: string; city?: string } | null;
  comments: Comment[];
}

function PostVideoPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = true; });
  return <VideoView player={player} style={styles.postVideo} contentFit="cover" nativeControls />;
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

export default function PostDetailScreen() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editCaption, setEditCaption] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const musicSoundRef = useRef<Audio.Sound | null>(null);

  const stopMusic = useCallback(async () => {
    if (musicSoundRef.current) {
      await musicSoundRef.current.stopAsync().catch(() => null);
      await musicSoundRef.current.unloadAsync().catch(() => null);
      musicSoundRef.current = null;
    }
    setIsMusicPlaying(false);
  }, []);

  const toggleMusic = useCallback(async (previewUrl: string) => {
    if (musicSoundRef.current) { await stopMusic(); return; }
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: previewUrl }, { shouldPlay: true, isLooping: true });
      musicSoundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((st) => {
        if (!st.isLoaded) {
          if (st.error) {
            sound.unloadAsync().catch(() => null);
            if (musicSoundRef.current === sound) { musicSoundRef.current = null; setIsMusicPlaying(false); }
          }
          return;
        }
        if (!st.isPlaying && !st.isBuffering) setIsMusicPlaying(false);
      });
      setIsMusicPlaying(true);
    } catch { setIsMusicPlaying(false); }
  }, [stopMusic]);

  // Auto-play dès l'ouverture du post (façon Instagram), stop si on quitte l'écran.
  useEffect(() => {
    const music = parseMusicTrack(post?.musicTrack);
    if (music?.previewUrl && isPlayableAudioUrl(music.previewUrl)) void toggleMusic(music.previewUrl);
    return () => { void stopMusic(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id]);

  useFocusEffect(useCallback(() => {
    return () => { void stopMusic(); };
  }, [stopMusic]));

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    const res = await fetch(`${API}/posts/${id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) setPost(await res.json());
    setLoading(false);
  }, [accessToken, id]);

  useEffect(() => { void load(); }, [load]);

  // Ouvre l'édition de légende quand on arrive avec ?edit=1.
  useEffect(() => {
    if (edit === '1' && post && !editing) {
      setEditCaption(post.caption ?? '');
      setEditing(true);
    }
  }, [edit, post, editing]);

  const saveEdit = async () => {
    if (!accessToken || !post) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`${API}/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ caption: editCaption }),
      });
      if (res.ok) {
        setPost((p) => p ? { ...p, caption: editCaption, editedAt: new Date().toISOString() } : p);
        setEditing(false);
      }
    } finally {
      setSavingEdit(false);
    }
  };

  // Comptabilise une vue (stats de l'auteur).
  useEffect(() => {
    if (!accessToken || !id) return;
    void fetch(`${API}/posts/${id}/view`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } }).catch(() => {});
  }, [accessToken, id]);

  // Répondre à un commentaire précis.
  const [replyTo, setReplyTo] = useState<Comment | null>(null);

  const toggleCommentLike = async (commentId: string) => {
    if (!accessToken || !post) return;
    // Optimiste : bascule localement (racines et réponses).
    const patch = (c: Comment): Comment => c.id === commentId
      ? { ...c, likedByMe: !c.likedByMe, likesCount: c.likesCount + (c.likedByMe ? -1 : 1) }
      : { ...c, replies: c.replies?.map(patch) };
    setPost((p) => p ? { ...p, comments: p.comments.map(patch) } : p);
    await fetch(`${API}/posts/comments/${commentId}/like`, {
      method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => {});
  };

  const toggleLike = async () => {
    if (!post || !accessToken) return;
    const res = await fetch(`${API}/posts/${post.id}/like`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const data = await res.json() as { liked: boolean; likesCount: number };
      setPost((p) => p ? { ...p, likedByMe: data.liked, likesCount: data.likesCount } : p);
    }
  };

  const sendComment = async () => {
    if (!comment.trim() || !post || !accessToken) return;
    setPosting(true);
    const res = await fetch(`${API}/posts/${post.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ content: comment.trim(), parentId: replyTo?.id }),
    });
    if (res.ok) {
      setComment('');
      setReplyTo(null);
      void load();
    }
    setPosting(false);
  };

  if (loading) return <View style={[styles.center, { paddingTop: insets.top }]}><ActivityIndicator color={colors.brand} /></View>;
  if (!post) return <View style={[styles.center, { paddingTop: insets.top }]}><Text style={{ color: colors.textMuted }}>Post introuvable</Text></View>;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>←</Text></Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>
        {/* Author */}
        <Pressable style={styles.author} onPress={() => router.push(`/user/${post.user?.id}`)}>
          {post.user?.photoUrl ? (
            <Image source={{ uri: post.user.photoUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{post.user?.displayName[0]}</Text>
            </View>
          )}
          <View>
            <Text style={styles.authorName}>{post.user?.displayName}</Text>
            {post.place && <Text style={styles.placeName}>📍 {post.place.name}</Text>}
          </View>
          <Text style={styles.ago}>{formatAgo(post.createdAt)}</Text>
        </Pressable>

        {/* Video player */}
        {post.videoUrl && <PostVideoPlayer uri={post.videoUrl} />}

        {/* Images carousel */}
        {!post.videoUrl && post.mediaUrls.length > 0 && (
          <View>
            <ScrollView
              horizontal pagingEnabled showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setImgIdx(Math.round(e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width))}
            >
              {post.mediaUrls.map((uri, i) => (
                <Image key={i} source={{ uri }} style={styles.postImage} />
              ))}
            </ScrollView>
            {post.mediaUrls.length > 1 && (
              <View style={styles.dots}>
                {post.mediaUrls.map((_, i) => (
                  <View key={i} style={[styles.dot, i === imgIdx && styles.dotActive]} />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Music badge */}
        {post.musicTrack && (() => {
          const music = parseMusicTrack(post.musicTrack);
          if (!music) return null;
          return (
            <Pressable
              style={styles.musicBadge}
              onPress={() => music.previewUrl && isPlayableAudioUrl(music.previewUrl) ? void toggleMusic(music.previewUrl) : null}
            >
              {music.artworkUrl
                ? <Image source={{ uri: music.artworkUrl }} style={styles.musicArtwork} />
                : <Text style={styles.musicIcon}>🎵</Text>}
              <View style={{ flex: 1 }}>
                <Text style={styles.musicTitle} numberOfLines={1}>{music.title}</Text>
                {music.artist ? <Text style={styles.musicArtist} numberOfLines={1}>{music.artist}</Text> : null}
              </View>
              {music.previewUrl ? <Text style={{ fontSize: 18 }}>{isMusicPlaying ? '⏸' : '▶️'}</Text> : null}
            </Pressable>
          );
        })()}

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable style={styles.likeBtn} onPress={toggleLike}>
            <Text style={[styles.likeIcon, post.likedByMe && styles.likeIconActive]}>
              {post.likedByMe ? '❤️' : '🤍'}
            </Text>
            <Text style={styles.likeCount}>{post.likesCount}</Text>
          </Pressable>
          <Text style={styles.commentCount}>💬 {post.comments.length}</Text>
        </View>

        {post.caption ? <Text style={styles.caption}><Text style={styles.captionUser}>{post.user?.displayName} </Text>{post.caption}</Text> : null}

        {/* Comments — en fil, avec likes et réponses */}
        <View style={styles.commentsSection}>
          <Text style={styles.commentsTitle}>Commentaires</Text>
          {post.commentsDisabled ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Les commentaires sont désactivés sur ce post.</Text>
          ) : post.comments.map((c) => (
            <View key={c.id}>
              <CommentRow
                comment={c}
                onLike={() => void toggleCommentLike(c.id)}
                onReply={() => setReplyTo(c)}
              />
              {c.replies?.map((r) => (
                <View key={r.id} style={{ paddingLeft: 38 }}>
                  <CommentRow comment={r} onLike={() => void toggleCommentLike(r.id)} onReply={() => setReplyTo(c)} />
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Comment input */}
      {!post.commentsDisabled && (
        <View style={[styles.commentBox, { paddingBottom: insets.bottom + 8, flexDirection: 'column', alignItems: 'stretch', gap: 6 }]}>
          {replyTo ? (
            <View style={styles.replyBanner}>
              <Text style={styles.replyBannerText} numberOfLines={1}>
                ↩︎ Réponse à <Text style={{ fontWeight: '700' }}>{replyTo.user?.displayName}</Text> : {replyTo.content}
              </Text>
              <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                <Text style={{ color: colors.textMuted, fontSize: 15 }}>✕</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              style={styles.commentInput}
              placeholder={replyTo ? `Répondre à ${replyTo.user?.displayName}...` : 'Ajouter un commentaire...'}
              placeholderTextColor={colors.textMuted}
              value={comment}
              onChangeText={setComment}
            />
            <Pressable onPress={sendComment} disabled={!comment.trim() || posting} style={styles.sendBtn}>
              {posting ? <ActivityIndicator color={colors.brand} size="small" /> : <Text style={styles.sendTxt}>Envoyer</Text>}
            </Pressable>
          </View>
        </View>
      )}

      {/* Modal d'édition de la légende */}
      <Modal visible={editing} transparent animationType="slide" onRequestClose={() => setEditing(false)}>
        <View style={styles.editOverlay}>
          <View style={[styles.editSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.editTitle}>Modifier la légende</Text>
            <TextInput
              style={styles.editInput}
              value={editCaption}
              onChangeText={setEditCaption}
              placeholder="Écris une légende…"
              placeholderTextColor={colors.textMuted}
              multiline
              autoFocus
            />
            <View style={styles.editActions}>
              <Pressable style={styles.editCancel} onPress={() => setEditing(false)}>
                <Text style={styles.editCancelTxt}>Annuler</Text>
              </Pressable>
              <Pressable style={styles.editSave} onPress={saveEdit} disabled={savingEdit}>
                {savingEdit ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.editSaveTxt}>Enregistrer</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function CommentRow({ comment: c, onLike, onReply }: { comment: Comment; onLike: () => void; onReply: () => void }) {
  return (
    <View style={styles.commentRow}>
      <View style={[styles.commentAvatar, { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }]}>
        {c.user?.photoUrl ? (
          <Image source={{ uri: c.user.photoUrl }} style={styles.commentAvatar} />
        ) : (
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{c.user?.displayName[0]}</Text>
        )}
      </View>
      <View style={[styles.commentBubble, { flex: 1 }]}>
        <Text style={styles.commentUser}>
          {c.user?.displayName}{c.pinned ? '  📌' : ''}
        </Text>
        <Text style={styles.commentText}>{c.content}</Text>
        <View style={styles.commentActions}>
          <Text style={styles.commentAgo}>{formatAgo(c.createdAt)}</Text>
          <Pressable onPress={onReply} hitSlop={6}>
            <Text style={styles.commentActionTxt}>Répondre</Text>
          </Pressable>
        </View>
      </View>
      <Pressable onPress={onLike} hitSlop={8} style={{ alignItems: 'center', paddingTop: 6 }}>
        <Text style={{ fontSize: 13 }}>{c.likedByMe ? '❤️' : '🤍'}</Text>
        {c.likesCount > 0 && <Text style={styles.commentLikeCount}>{c.likesCount}</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  editOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  editSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, gap: spacing.md },
  editTitle: { ...typography.h3, color: colors.text, textAlign: 'center' },
  editInput: { minHeight: 90, maxHeight: 200, backgroundColor: colors.background, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, color: colors.text, fontSize: 15, textAlignVertical: 'top' },
  editActions: { flexDirection: 'row', gap: spacing.sm },
  editCancel: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  editCancelTxt: { color: colors.text, fontWeight: '600', fontSize: 15 },
  editSave: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: radius.md, backgroundColor: colors.brand },
  editSaveTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: spacing.md, paddingVertical: 12 },
  back: { fontSize: 22, color: colors.brand },
  author: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  authorName: { fontWeight: '700', color: colors.text, fontSize: 14 },
  placeName: { fontSize: 12, color: colors.textMuted },
  ago: { marginLeft: 'auto', fontSize: 12, color: colors.textMuted },
  postImage: { width: 375, height: 375 },
  postVideo: { width: '100%', height: 375 },
  musicBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, marginHorizontal: spacing.md, marginTop: 8,
    borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  musicArtwork: { width: 40, height: 40, borderRadius: 6 },
  musicIcon: { fontSize: 22, width: 40, textAlign: 'center' },
  musicTitle: { fontSize: 13, color: colors.text, fontWeight: '700' },
  musicArtist: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.brand },
  actions: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: 16 },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  likeIcon: { fontSize: 24 },
  likeIconActive: {},
  likeCount: { fontWeight: '700', color: colors.text, fontSize: 15 },
  commentCount: { fontSize: 15, color: colors.textMuted },
  caption: { paddingHorizontal: spacing.md, fontSize: 14, color: colors.text, lineHeight: 20, marginBottom: 8 },
  captionUser: { fontWeight: '700' },
  commentsSection: { paddingHorizontal: spacing.md },
  commentsTitle: { ...typography.h3, color: colors.text, marginBottom: 12 },
  commentRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  commentAvatar: { width: 30, height: 30, borderRadius: 15 },
  commentBubble: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 10 },
  commentUser: { fontWeight: '700', color: colors.text, fontSize: 13, marginBottom: 2 },
  commentText: { color: colors.text, fontSize: 14 },
  commentActions: { flexDirection: 'row', gap: 14, marginTop: 6, alignItems: 'center' },
  commentAgo: { fontSize: 11, color: colors.textMuted },
  commentActionTxt: { fontSize: 11, color: colors.textMuted, fontWeight: '700' },
  commentLikeCount: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  replyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderRadius: radius.md,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  replyBannerText: { flex: 1, fontSize: 12, color: colors.textMuted },
  commentBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: spacing.md, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background,
  },
  commentInput: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.full,
    paddingHorizontal: 16, paddingVertical: 10, color: colors.text, fontSize: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  sendBtn: { paddingHorizontal: 14, paddingVertical: 10 },
  sendTxt: { color: colors.brand, fontWeight: '700', fontSize: 14 },
});
