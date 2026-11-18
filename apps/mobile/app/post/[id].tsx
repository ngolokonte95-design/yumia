/**
 * PUBLICATION — une publication en grand et son fil de commentaires.
 *
 * Habillage sobre (18/11/2026, « spectaculaire mais simple, peu de couleur ») :
 * fond noir uni, média bord à bord, verre discret, typographie forte. Le
 * dégradé de marque n'apparaît qu'à un endroit : le bouton d'envoi d'un
 * commentaire (et « Enregistrer » dans la feuille d'édition). Micro-animation :
 * le cœur rebondit. Aucun voile en dégradé.
 *
 * La logique (chargement, vue comptée, j'aime, commentaires et réponses,
 * signalement, édition de légende, musique synchronisée à la vidéo) et le
 * lecteur `PostVideo` sont inchangés.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, I18nManager, Image, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useAuth } from '../../lib/auth-context';
import { promptReport } from '../../lib/report-content';
import { colors, motion, radius, spacing } from '../../theme/tokens';
import { API_BASE_URL } from '../../lib/config';
import { PostVideo } from '../../components/PostVideo';
import { Avatar, PlanBadgeIcon } from '../../components/Avatar';
import type { PostOverlay, AuthorRef } from '../../lib/feed-api';
import { useI18n } from '../../lib/useI18n';
import type { TranslationKey } from '../../lib/translations';
import { formatCount } from '../../lib/format-count';
import { parseMusicTrack, isPlayableAudioUrl } from '../../lib/music-track';
import { isVideoUrl } from '../../lib/is-video-url';
import { TranslatableText } from '../../components/TranslatableText';
import { PressableScale } from '../../components/ui';
import { haptics } from '../../lib/useHaptics';
import {
  BrandFill, CHAT_BG, CHAT_GLASS, CHAT_HAIRLINE, GlassCircle, GradientRing, ringInner,
} from '../../components/chat/ChatChrome';

const API = API_BASE_URL;

interface Comment {
  id: string; content: string; createdAt: string;
  likesCount: number; likedByMe?: boolean; pinned?: boolean;
  user: AuthorRef | null;
  replies?: Comment[];
}

interface Post {
  id: string;
  userId: string;
  caption?: string;
  mediaUrls: string[];
  videoUrl?: string | null;
  musicTrack?: string | null;
  overlays?: PostOverlay[] | null;
  videoMuted?: boolean;
  voiceTrackUrl?: string | null;
  likesCount: number;
  viewsCount?: number;
  likedByMe: boolean;
  hideLikeCount?: boolean;
  commentsDisabled?: boolean;
  editedAt?: string | null;
  createdAt: string;
  user: AuthorRef | null;
  place?: { name: string; universe: string; city?: string } | null;
  comments: Comment[];
}

function formatAgo(iso: string, t: (key: TranslationKey) => string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t('social_time_now');
  if (m < 60) return `${m} ${t('social_time_min')}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}${t('social_time_hour')}`;
  return `${Math.floor(h / 24)}${t('social_time_day')}`;
}

export default function PostDetailScreen() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editCaption, setEditCaption] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const musicSoundRef = useRef<AudioPlayer | null>(null);

  const stopMusic = useCallback(async () => {
    if (musicSoundRef.current) {
      musicSoundRef.current.pause();
      musicSoundRef.current.remove();
      musicSoundRef.current = null;
    }
  }, []);

  // La musique fait partie intégrante de la publication (comme dans le fil,
  // social.tsx) : elle se joue automatiquement, pas de pause/lecture manuelle
  // à part — seul le tap sur la vidéo (ci-dessous) la met en pause, avec elle.
  const startMusic = useCallback(async (previewUrl: string) => {
    await stopMusic();
    try {
      await setAudioModeAsync({ playsInSilentMode: true });
      const sound = createAudioPlayer(previewUrl);
      sound.loop = true;
      musicSoundRef.current = sound;
      sound.addListener('playbackStatusUpdate', (st) => {
        if (st.error) {
          sound.remove();
          if (musicSoundRef.current === sound) musicSoundRef.current = null;
        }
      });
      sound.play();
    } catch { /* pas de musique, tant pis pour la musique — pas pour le post */ }
  }, [stopMusic]);

  // Auto-play dès l'ouverture du post (façon Instagram), stop si on quitte l'écran.
  useEffect(() => {
    const music = parseMusicTrack(post?.musicTrack);
    if (music?.previewUrl && isPlayableAudioUrl(music.previewUrl)) void startMusic(music.previewUrl);
    return () => { void stopMusic(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id]);

  useFocusEffect(useCallback(() => {
    return () => { void stopMusic(); };
  }, [stopMusic]));

  // Tap pause/lecture sur la vidéo → musique en pause/reprise avec elle.
  const onVideoPlayingChange = useCallback((playing: boolean) => {
    if (playing) musicSoundRef.current?.play();
    else musicSoundRef.current?.pause();
  }, []);

  // Vidéo qui boucle → musique resynchronisée au même instant (sinon elle
  // dérive sur son propre cycle, indépendant de la vidéo).
  const onVideoLoop = useCallback(() => {
    void musicSoundRef.current?.seekTo(0).catch(() => null);
  }, []);

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

  if (loading) return <CenterState top={insets.top} onBack={() => router.back()}><ActivityIndicator color="#fff" /></CenterState>;
  if (!post) return <CenterState top={insets.top} onBack={() => router.back()}><Text style={styles.centerTxt}>{t('pd_not_found')}</Text></CenterState>;

  // Même ordre de détection que le feed (social.tsx) : mediaUrls[0] d'abord
  // s'il a une extension vidéo, sinon repli sur `videoUrl`. Sans ce repli, un
  // post vidéo dont le fichier ne vit que dans mediaUrls passait par l'<Image>,
  // qui ne le décode pas — d'où des publications affichées cassées.
  const videoSrc = isVideoUrl(post.mediaUrls[0]) ? post.mediaUrls[0] : (post.videoUrl ?? undefined);
  const music = parseMusicTrack(post.musicTrack);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.top}
    >
      {/* En-tête : retour en verre + auteur (mène à son profil). */}
      <View style={styles.header}>
        <GlassCircle onPress={() => router.back()}>
          <Text style={styles.backIcon}>{BACK_ICON}</Text>
        </GlassCircle>
        <Pressable style={styles.author} onPress={() => router.push(`/user/${post.user?.id}`)}>
          <GradientRing size={44} active={false}>
            <Avatar
              uri={post.user?.photoUrl}
              size={ringInner(44)}
              placeholderColor={colors.surfaceElevated}
              fallback={<Text style={styles.avatarLetter}>{post.user?.displayName[0]}</Text>}
            />
          </GradientRing>
          <View style={styles.authorText}>
            <View style={styles.authorNameRow}>
              <Text style={styles.authorName} numberOfLines={1}>{post.user?.displayName}</Text>
              <PlanBadgeIcon plan={post.user?.plan} size={18} />
            </View>
            {post.place && <Text style={styles.placeName} numberOfLines={1}>📍 {post.place.name}</Text>}
          </View>
          <Text style={styles.ago}>{formatAgo(post.createdAt, t)}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 80 }} showsVerticalScrollIndicator={false}>
        {/* Video player */}
        {videoSrc && (
          <PostVideo
            uri={videoSrc}
            style={styles.postVideo}
            overlays={post.overlays}
            // Une musique ajoutée remplace le son d'origine de la vidéo — les
            // deux ne doivent jamais jouer en même temps (même règle que le fil).
            videoMuted={post.videoMuted || !!music}
            voiceTrackUrl={post.voiceTrackUrl}
            onPlayingChange={music ? onVideoPlayingChange : undefined}
            onLoop={music ? onVideoLoop : undefined}
          />
        )}

        {/* Images carousel */}
        {!videoSrc && post.mediaUrls.length > 0 && (
          <MediaCarousel uris={post.mediaUrls} index={imgIdx} onIndex={setImgIdx} />
        )}

        {/* Music badge — intégrée à la publication, pas de pause/lecture à part
            (le tap sur la vidéo la contrôle, voir onPlayingChange ci-dessus). */}
        {music && (
          <View style={styles.musicBadge}>
            {music.artworkUrl
              ? <Image source={{ uri: music.artworkUrl }} style={styles.musicArtwork} />
              : <Text style={styles.musicIcon}>🎵</Text>}
            <View style={{ flex: 1 }}>
              <Text style={styles.musicTitle} numberOfLines={1}>{music.title}</Text>
              {music.artist ? <Text style={styles.musicArtist} numberOfLines={1}>{music.artist}</Text> : null}
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <LikeButton liked={post.likedByMe} count={formatCount(post.likesCount)} onPress={() => void toggleLike()} />
          <View style={styles.stat}>
            <Text style={styles.statIcon}>💬</Text>
            <Text style={styles.statTxt}>{formatCount(post.comments.length)}</Text>
          </View>
          {/* La vue de cet écran vient d'être comptée par le POST ci-dessus :
              le chiffre affiché inclut donc la visite en cours. */}
          <View style={styles.stat}>
            <Text style={styles.statIcon}>👁</Text>
            <Text style={styles.statTxt}>{formatCount(post.viewsCount)}</Text>
          </View>
        </View>

        {post.caption ? (
          <TranslatableText
            text={post.caption}
            render={(shown) => (
              <Text style={styles.caption}><Text style={styles.captionUser}>{post.user?.displayName} </Text>{shown}</Text>
            )}
          />
        ) : null}

        {/* Comments — en fil, avec likes et réponses */}
        <View style={styles.commentsSection}>
          <View style={styles.commentsHead}>
            <Text style={styles.commentsTitle}>{t('pd_comments_title')}</Text>
            <View style={styles.commentsRule} />
          </View>
          {post.commentsDisabled ? (
            <Text style={styles.commentsOff}>{t('pd_comments_disabled')}</Text>
          ) : post.comments.map((c) => (
            <View key={c.id}>
              <CommentRow
                comment={c}
                onLike={() => void toggleCommentLike(c.id)}
                onReply={() => setReplyTo(c)}
                onReport={() => promptReport({
                  accessToken, targetType: 'comment', targetId: c.id, t,
                  titleKey: 'report_comment_title',
                })}
              />
              {c.replies?.map((r) => (
                // Réponse : en retrait, reliée par un filet au commentaire.
                <View key={r.id} style={styles.replyIndent}>
                  <CommentRow
                    comment={r}
                    onLike={() => void toggleCommentLike(r.id)}
                    onReply={() => setReplyTo(c)}
                    onReport={() => promptReport({
                      accessToken, targetType: 'comment', targetId: r.id, t,
                      titleKey: 'report_comment_title',
                    })}
                  />
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Comment input */}
      {!post.commentsDisabled && (
        <View style={[styles.commentBox, { paddingBottom: insets.bottom + 8 }]}>
          {replyTo ? (
            <View style={styles.replyBanner}>
              <Text style={styles.replyBannerText} numberOfLines={1}>
                {t('pd_reply_to')} <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{replyTo.user?.displayName}</Text> : {replyTo.content}
              </Text>
              <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                <Text style={styles.replyBannerClose}>✕</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              placeholder={replyTo ? t('pd_reply_placeholder').replace('{name}', replyTo.user?.displayName ?? '') : t('pd_comment_placeholder')}
              placeholderTextColor={colors.textMuted}
              value={comment}
              onChangeText={setComment}
            />
            {/* Seul accent de couleur de l'écran : le bouton d'envoi, quand il y a du texte. */}
            <PressableScale
              onPress={() => void sendComment()}
              disabled={!comment.trim() || posting}
              scaleTo={0.94}
              style={[styles.sendBtn, !comment.trim() && styles.sendBtnIdle]}
            >
              {comment.trim() ? <BrandFill /> : null}
              {posting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={[styles.sendTxt, !comment.trim() && styles.sendTxtIdle]}>{t('pd_send')}</Text>}
            </PressableScale>
          </View>
        </View>
      )}

      {/* Modal d'édition de la légende */}
      <Modal visible={editing} transparent animationType="slide" onRequestClose={() => setEditing(false)}>
        <View style={styles.editOverlay}>
          <View style={[styles.editSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.editTitle}>{t('pd_edit_caption_title')}</Text>
            <TextInput
              style={styles.editInput}
              value={editCaption}
              onChangeText={setEditCaption}
              placeholder={t('pd_caption_placeholder')}
              placeholderTextColor={colors.textMuted}
              multiline
              autoFocus
            />
            <View style={styles.editActions}>
              <PressableScale style={styles.editCancel} onPress={() => setEditing(false)} scaleTo={0.97}>
                <Text style={styles.editCancelTxt}>{t('pd_cancel')}</Text>
              </PressableScale>
              <PressableScale style={styles.editSave} onPress={() => void saveEdit()} disabled={savingEdit} scaleTo={0.97}>
                <BrandFill />
                {savingEdit ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.editSaveTxt}>{t('pd_save')}</Text>}
              </PressableScale>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/** Flèche de retour qui suit le sens de lecture. */
const BACK_ICON = I18nManager.isRTL ? '→' : '←';

/** Écran d'attente / publication introuvable, avec un retour. */
function CenterState({ top, onBack, children }: { top: number; onBack: () => void; children: React.ReactNode }) {
  return (
    <View style={[styles.container, { paddingTop: top }]}>
      <View style={styles.header}>
        <GlassCircle onPress={onBack}>
          <Text style={styles.backIcon}>{BACK_ICON}</Text>
        </GlassCircle>
      </View>
      <View style={styles.center}>{children}</View>
    </View>
  );
}

/** Photos bord à bord, à la largeur réelle de l'écran, avec compteur et points. */
function MediaCarousel({ uris, index, onIndex }: { uris: string[]; index: number; onIndex: (i: number) => void }) {
  const { width } = useWindowDimensions();
  return (
    <View>
      <ScrollView
        horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => onIndex(Math.round(e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width))}
      >
        {uris.map((uri, i) => (
          <Image key={i} source={{ uri }} style={{ width, height: width }} />
        ))}
      </ScrollView>
      {uris.length > 1 && (
        <>
          <View style={styles.counter}>
            <Text style={styles.counterTxt}>{index + 1} / {uris.length}</Text>
          </View>
          <View style={styles.dots}>
            {uris.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

/** Cœur qui rebondit au toucher (visuel seulement : l'action reste `onPress`). */
function LikeButton({ liked, count, onPress }: { liked: boolean; count: string; onPress: () => void }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <PressableScale
      style={styles.likeBtn}
      scaleTo={0.94}
      hitSlop={8}
      onPress={() => {
        scale.value = withSequence(withSpring(1.4, motion.spring.bouncy), withSpring(1, motion.spring.bouncy));
        haptics.light();
        onPress();
      }}
    >
      <Animated.Text style={[styles.likeIcon, style]}>{liked ? '❤️' : '🤍'}</Animated.Text>
      <Text style={styles.likeCount}>{count}</Text>
    </PressableScale>
  );
}

function CommentRow({ comment: c, onLike, onReply, onReport }: { comment: Comment; onLike: () => void; onReply: () => void; onReport: () => void }) {
  const { t } = useI18n();
  return (
    <View style={styles.commentRow}>
      <Avatar
        uri={c.user?.photoUrl}
        size={32}
        placeholderColor={colors.surfaceElevated}
        fallback={<Text style={styles.commentAvatarLetter}>{c.user?.displayName[0]}</Text>}
      />
      <View style={styles.commentBubble}>
        <View style={styles.commentUserRow}>
          <Text style={styles.commentUser}>
            {c.user?.displayName}{c.pinned ? '  📌' : ''}
          </Text>
          <PlanBadgeIcon plan={c.user?.plan} size={14} />
        </View>
        <TranslatableText text={c.content} style={styles.commentText} />
        <View style={styles.commentActions}>
          <Text style={styles.commentAgo}>{formatAgo(c.createdAt, t)}</Text>
          <Pressable onPress={onReply} hitSlop={6}>
            <Text style={styles.commentActionTxt}>{t('pd_reply')}</Text>
          </Pressable>
          {/* Un commentaire est un contenu d'utilisateur comme un autre : il
              doit pouvoir être signalé là où on le lit. */}
          <Pressable onPress={onReport} hitSlop={6}>
            <Text style={styles.commentActionTxt}>{t('report_content_action')}</Text>
          </Pressable>
        </View>
      </View>
      <PressableScale onPress={onLike} hitSlop={8} scaleTo={0.8} style={styles.commentLike}>
        <Text style={styles.commentLikeIcon}>{c.likedByMe ? '❤️' : '🤍'}</Text>
        {c.likesCount > 0 && <Text style={styles.commentLikeCount}>{c.likesCount}</Text>}
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CHAT_BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerTxt: { color: colors.textMuted, fontSize: 15 },

  // En-tête
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 10 },
  backIcon: { color: '#fff', fontSize: 20, fontWeight: '700' },
  author: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  authorText: { flex: 1, minWidth: 0 },
  authorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  authorName: { fontWeight: '800', color: colors.textPrimary, fontSize: 16, letterSpacing: -0.2, flexShrink: 1 },
  avatarLetter: { color: '#fff', fontWeight: '700' },
  placeName: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  ago: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },

  // Média
  postVideo: { width: '100%', aspectRatio: 4 / 5 },
  counter: {
    position: 'absolute', top: 12, end: 12, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.2)',
  },
  counterTxt: { color: '#fff', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)' },
  dotActive: { width: 18, backgroundColor: '#fff' },
  musicBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: CHAT_GLASS, marginHorizontal: spacing.md, marginTop: 12,
    borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: CHAT_HAIRLINE,
  },
  musicArtwork: { width: 40, height: 40, borderRadius: 8 },
  musicIcon: { fontSize: 22, width: 40, textAlign: 'center' },
  musicTitle: { fontSize: 13, color: colors.textPrimary, fontWeight: '700' },
  musicArtist: { fontSize: 12, color: colors.textMuted, marginTop: 1 },

  // Actions
  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: 14, paddingBottom: 10, gap: 18 },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  likeIcon: { fontSize: 26 },
  likeCount: { fontWeight: '900', color: colors.textPrimary, fontSize: 17, fontVariant: ['tabular-nums'] },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statIcon: { fontSize: 17, opacity: 0.85 },
  statTxt: { fontSize: 15, color: colors.textSecondary, fontWeight: '700', fontVariant: ['tabular-nums'] },
  caption: { paddingHorizontal: spacing.md, fontSize: 15, color: colors.textPrimary, lineHeight: 22, marginBottom: 6 },
  captionUser: { fontWeight: '800' },

  // Commentaires
  commentsSection: { paddingHorizontal: spacing.md, marginTop: spacing.md },
  commentsHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 14 },
  commentsTitle: { color: colors.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 1.8, textTransform: 'uppercase' },
  commentsRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.14)' },
  commentsOff: { color: colors.textMuted, fontSize: 13 },
  commentRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  commentAvatarLetter: { color: '#fff', fontSize: 11, fontWeight: '700' },
  commentBubble: {
    flex: 1, backgroundColor: CHAT_GLASS, borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: CHAT_HAIRLINE,
  },
  commentUserRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  commentUser: { fontWeight: '800', color: colors.textPrimary, fontSize: 13, marginBottom: 2 },
  commentText: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  commentActions: { flexDirection: 'row', gap: 14, marginTop: 6, alignItems: 'center' },
  commentAgo: { fontSize: 11, color: colors.textMuted },
  commentActionTxt: { fontSize: 11, color: colors.textSecondary, fontWeight: '700' },
  commentLike: { alignItems: 'center', paddingTop: 8, minWidth: 22 },
  commentLikeIcon: { fontSize: 14 },
  commentLikeCount: { fontSize: 10, color: colors.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  replyIndent: {
    marginStart: 15, paddingStart: 16,
    borderStartWidth: StyleSheet.hairlineWidth, borderStartColor: 'rgba(255,255,255,0.16)',
  },

  // Saisie
  commentBox: {
    gap: 8, paddingHorizontal: spacing.md, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)', backgroundColor: CHAT_BG,
  },
  replyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: CHAT_GLASS, borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: CHAT_HAIRLINE,
  },
  replyBannerText: { flex: 1, fontSize: 12, color: colors.textMuted },
  replyBannerClose: { color: colors.textSecondary, fontSize: 15 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentInput: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: radius.pill,
    paddingHorizontal: 16, paddingVertical: 11, color: colors.textPrimary, fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  sendBtn: {
    minWidth: 78, height: 42, paddingHorizontal: 16, borderRadius: radius.pill, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnIdle: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  sendTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  sendTxtIdle: { color: colors.textMuted },

  // Feuille d'édition de la légende
  editOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  editSheet: {
    backgroundColor: '#101016', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.28)' },
  editTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  editInput: {
    minHeight: 90, maxHeight: 200, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
    padding: spacing.md, color: colors.textPrimary, fontSize: 15, textAlignVertical: 'top',
  },
  editActions: { flexDirection: 'row', gap: spacing.sm },
  editCancel: {
    flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  editCancelTxt: { color: colors.textPrimary, fontWeight: '700', fontSize: 15 },
  editSave: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, overflow: 'hidden' },
  editSaveTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
