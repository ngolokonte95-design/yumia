/**
 * Fenêtre flottante des commentaires, façon Instagram.
 *
 * S'ouvre PAR-DESSUS le contenu (fil, reels, plein écran) sans le quitter :
 * la vidéo continue derrière, et fermer la fenêtre ramène exactement où l'on
 * était. Poignée en haut, liste qui occupe l'écran, réponses repliées sous
 * chaque commentaire, cœur à droite, barre de saisie collée au clavier avec
 * l'avatar de l'utilisateur et une rangée d'émojis. Se ferme au glissement
 * vers le bas ; se déploie presque plein écran au glissement vers le haut.
 *
 * Les données viennent de `GET /posts/:id` (comme la page de la publication) :
 * commentaires racine avec `replies`, `likedByMe`, `pinned`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Keyboard, Modal, Platform, Pressable,
  StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { API_BASE_URL } from '../lib/config';
import { promptReport } from '../lib/report-content';
import { useI18n } from '../lib/useI18n';
import type { TranslationKey } from '../lib/translations';
import type { AuthorRef } from '../lib/feed-api';
import { Avatar, PlanBadgeIcon } from './Avatar';
import { colors, radius, spacing } from '../theme/tokens';

export interface SheetComment {
  id: string;
  content: string;
  createdAt: string;
  likesCount: number;
  likedByMe?: boolean;
  pinned?: boolean;
  user: AuthorRef | null;
  replies?: SheetComment[];
}

/** Émojis proposés d'un appui, comme la rangée d'Instagram. */
const QUICK_EMOJIS = ['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂'];

const SPRING = { damping: 26, stiffness: 260, mass: 0.9 };

function formatAgo(iso: string, t: (key: TranslationKey) => string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return t('social_time_now');
  if (m < 60) return `${m} ${t('social_time_min')}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}${t('social_time_hour')}`;
  return `${Math.floor(h / 24)}${t('social_time_day')}`;
}

export function CommentsSheet({
  postId, onClose, onCountChange,
}: {
  /** Publication dont on montre les commentaires ; `null` = fenêtre fermée. */
  postId: string | null;
  onClose: () => void;
  /** Le nombre de commentaires a changé (publication, suppression) : +1 / -1. */
  onCountChange?: (postId: string, delta: number) => void;
}) {
  const { t } = useI18n();
  const { accessToken, user } = useAuth();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();

  // Deux crans : ouvert (62 % de l'écran) et déployé (presque tout l'écran).
  const collapsedTop = Math.round(screenH * 0.38);
  const expandedTop = insets.top + 24;

  const [comments, setComments] = useState<SheetComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [postAuthorId, setPostAuthorId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<SheetComment | null>(null);
  const [openReplies, setOpenReplies] = useState<Set<string>>(() => new Set());
  const inputRef = useRef<TextInput>(null);

  // ── Géométrie animée ────────────────────────────────────────────────────
  const top = useSharedValue(screenH);          // bord haut de la fenêtre
  const dragStart = useSharedValue(screenH);
  const visible = postId !== null;

  const close = useCallback(() => {
    top.value = withTiming(screenH, { duration: 220 }, (done) => {
      if (done) runOnJS(onClose)();
    });
  }, [onClose, screenH, top]);

  useEffect(() => {
    if (visible) top.value = withSpring(collapsedTop, SPRING);
  }, [visible, collapsedTop, top]);

  const pan = Gesture.Pan()
    .onStart(() => { dragStart.value = top.value; })
    .onUpdate((e) => {
      const next = dragStart.value + e.translationY;
      top.value = Math.max(expandedTop, Math.min(screenH, next));
    })
    .onEnd((e) => {
      // Glissement franc vers le bas, ou relâché bas : on ferme. Sinon, on
      // se cale sur le cran le plus proche.
      const goingDown = e.velocityY > 900 || (e.translationY > 140 && e.velocityY > -200);
      if (goingDown && top.value > collapsedTop - 40) {
        top.value = withTiming(screenH, { duration: 200 }, (done) => {
          if (done) runOnJS(onClose)();
        });
        return;
      }
      const target = top.value < (collapsedTop + expandedTop) / 2 || e.velocityY < -900
        ? expandedTop
        : collapsedTop;
      top.value = withSpring(target, SPRING);
    });

  // ── Clavier ─────────────────────────────────────────────────────────────
  // Écoute directe plutôt que KeyboardAvoidingView : dans une fenêtre modale
  // à barre d'état translucide, Android ne redimensionne rien et iOS décale
  // faux — on ne voyait pas ce qu'on écrivait. Ici la fenêtre est relevée de
  // la hauteur exacte du clavier, et se déploie en même temps pour que la
  // liste reste lisible au-dessus, comme sur Instagram.
  const keyboard = useSharedValue(0);
  const [keyboardShown, setKeyboardShown] = useState(false);
  useEffect(() => {
    if (!visible) return undefined;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => {
      keyboard.value = withTiming(e.endCoordinates.height, { duration: Platform.OS === 'ios' ? 250 : 120 });
      top.value = withSpring(expandedTop, SPRING);
      setKeyboardShown(true);
    });
    const hide = Keyboard.addListener(hideEvt, () => {
      keyboard.value = withTiming(0, { duration: Platform.OS === 'ios' ? 250 : 120 });
      setKeyboardShown(false);
    });
    return () => { show.remove(); hide.remove(); };
  }, [visible, expandedTop, keyboard, top]);

  const sheetStyle = useAnimatedStyle(() => ({
    height: screenH - top.value,
    // Le clavier pousse la fenêtre vers le haut : la barre de saisie reste
    // juste au-dessus de lui, la liste se réduit d'autant.
    paddingBottom: keyboard.value,
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(top.value, [screenH, collapsedTop], [0, 0.55], Extrapolation.CLAMP),
  }));

  // ── Données ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!postId || !accessToken) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/posts/${postId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return;
      const post = await res.json() as { comments?: SheetComment[]; commentsDisabled?: boolean; userId?: string };
      setComments(post.comments ?? []);
      setDisabled(!!post.commentsDisabled);
      setPostAuthorId(post.userId ?? null);
    } catch {
      // Réseau : la liste reste vide, l'utilisateur peut fermer et réessayer.
    } finally {
      setLoading(false);
    }
  }, [postId, accessToken]);

  useEffect(() => {
    if (!visible) {
      setComments([]); setText(''); setReplyTo(null); setOpenReplies(new Set());
      return;
    }
    void load();
  }, [visible, load]);

  const patchComment = useCallback((id: string, fn: (c: SheetComment) => SheetComment) => {
    const walk = (c: SheetComment): SheetComment => {
      const self = c.id === id ? fn(c) : c;
      return self.replies ? { ...self, replies: self.replies.map(walk) } : self;
    };
    setComments((prev) => prev.map(walk));
  }, []);

  const toggleLike = useCallback(async (c: SheetComment) => {
    if (!accessToken) return;
    const liked = !c.likedByMe;
    patchComment(c.id, (x) => ({ ...x, likedByMe: liked, likesCount: Math.max(0, x.likesCount + (liked ? 1 : -1)) }));
    try {
      await fetch(`${API_BASE_URL}/posts/comments/${c.id}/like`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      patchComment(c.id, (x) => ({ ...x, likedByMe: !liked, likesCount: Math.max(0, x.likesCount + (liked ? -1 : 1)) }));
    }
  }, [accessToken, patchComment]);

  const send = useCallback(async () => {
    const content = text.trim();
    if (!content || !postId || !accessToken || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API_BASE_URL}/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ content, parentId: replyTo?.id }),
      });
      if (!res.ok) return;
      setText('');
      // Une réponse s'affiche déployée : on vient de l'écrire, on veut la voir.
      if (replyTo) setOpenReplies((prev) => new Set(prev).add(replyTo.id));
      setReplyTo(null);
      onCountChange?.(postId, 1);
      await load();
    } finally {
      setSending(false);
    }
  }, [text, postId, accessToken, sending, replyTo, onCountChange, load]);

  const remove = useCallback(async (c: SheetComment) => {
    if (!accessToken || !postId) return;
    const res = await fetch(`${API_BASE_URL}/posts/comments/${c.id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      onCountChange?.(postId, -1);
      await load();
    }
  }, [accessToken, postId, onCountChange, load]);

  /** Appui long : supprimer le sien, signaler celui d'un autre. */
  const onLongPress = useCallback((c: SheetComment) => {
    const mine = !!user && c.user?.id === user.id;
    if (mine) {
      Alert.alert(t('cm_delete'), undefined, [
        { text: t('cancel'), style: 'cancel' },
        { text: t('cm_delete'), style: 'destructive', onPress: () => void remove(c) },
      ]);
      return;
    }
    promptReport({ accessToken, targetType: 'comment', targetId: c.id, t, titleKey: 'report_comment_title' });
  }, [user, t, remove, accessToken]);

  const startReply = useCallback((root: SheetComment, target: SheetComment) => {
    // Comme Instagram : une réponse à une réponse reste sous le commentaire
    // racine, avec une mention pour dire à qui l'on répond.
    setReplyTo(root);
    const name = target.user?.displayName;
    if (name) setText((prev) => (prev.startsWith(`@${name} `) ? prev : `@${name} ${prev}`));
    inputRef.current?.focus();
  }, []);

  // ── Rendu ───────────────────────────────────────────────────────────────
  const renderRow = (c: SheetComment, root: SheetComment, isReply: boolean) => (
    <Pressable
      key={c.id}
      style={[styles.row, isReply ? styles.rowReply : null]}
      onLongPress={() => onLongPress(c)}
      delayLongPress={350}
    >
      <Avatar
        uri={c.user?.photoUrl}
        size={isReply ? 26 : 34}
        placeholderColor={colors.brand}
        fallback={<Text style={styles.avatarFallback}>{c.user?.displayName?.[0] ?? '?'}</Text>}
      />
      <View style={styles.rowBody}>
        <View style={styles.rowHead}>
          <Text style={styles.name} numberOfLines={1}>{c.user?.displayName ?? '—'}</Text>
          <PlanBadgeIcon plan={c.user?.plan} size={22} />
          {c.user?.id && c.user.id === postAuthorId ? <Text style={styles.authorTag}>{t('cm_author')}</Text> : null}
          <Text style={styles.ago}>{formatAgo(c.createdAt, t)}</Text>
          {c.pinned ? <Text style={styles.ago}>📌</Text> : null}
        </View>
        <Text style={styles.content}>{c.content}</Text>
        <View style={styles.actions}>
          {!disabled ? (
            <Pressable onPress={() => startReply(root, c)} hitSlop={8}>
              <Text style={styles.actionTxt}>{t('pd_reply')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <Pressable onPress={() => void toggleLike(c)} hitSlop={10} style={styles.likeCol}>
        <Text style={[styles.heart, c.likedByMe ? styles.heartOn : null]}>{c.likedByMe ? '♥' : '♡'}</Text>
        {c.likesCount > 0 ? <Text style={styles.likeCount}>{c.likesCount}</Text> : null}
      </Pressable>
    </Pressable>
  );

  const renderItem = ({ item }: { item: SheetComment }) => {
    const replies = item.replies ?? [];
    const open = openReplies.has(item.id);
    return (
      <View>
        {renderRow(item, item, false)}
        {replies.length > 0 ? (
          <View style={styles.repliesBlock}>
            <Pressable
              style={styles.repliesToggle}
              onPress={() => setOpenReplies((prev) => {
                const next = new Set(prev);
                if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                return next;
              })}
              hitSlop={8}
            >
              <View style={styles.repliesLine} />
              <Text style={styles.repliesTxt}>
                {open ? t('cm_hide_replies') : t('cm_view_replies').replace('{n}', String(replies.length))}
              </Text>
            </Pressable>
            {open ? replies.map((r) => renderRow(r, item, true)) : null}
          </View>
        ) : null}
      </View>
    );
  };

  const canSend = text.trim().length > 0 && !sending;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        </Animated.View>

        <Animated.View style={[styles.sheet, sheetStyle]}>
          <View style={styles.flex}>
            {/* Poignée + titre : c'est la zone qu'on saisit pour déplacer ou
                fermer la fenêtre. */}
            <GestureDetector gesture={pan}>
              <View style={styles.header}>
                <View style={styles.handle} />
                <Text style={styles.title}>{t('pd_comments_title')}</Text>
              </View>
            </GestureDetector>
            <View style={styles.separator} />

            {loading && comments.length === 0 ? (
              <View style={styles.center}><ActivityIndicator color={colors.textSecondary} /></View>
            ) : disabled ? (
              <View style={styles.center}>
                <Text style={styles.emptyTitle}>{t('pd_comments_disabled')}</Text>
              </View>
            ) : (
              <FlatList
                data={comments}
                keyExtractor={(c) => c.id}
                renderItem={renderItem}
                style={styles.flex}
                contentContainerStyle={comments.length === 0 ? styles.flex : styles.listContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                ListEmptyComponent={
                  <View style={styles.center}>
                    <Text style={styles.emptyTitle}>{t('cm_empty_title')}</Text>
                    <Text style={styles.emptySub}>{t('cm_empty_sub')}</Text>
                  </View>
                }
              />
            )}

            {!disabled ? (
              <View style={[styles.composer, { paddingBottom: keyboardShown ? 8 : Math.max(insets.bottom, 8) }]}>
                {replyTo ? (
                  <View style={styles.replyBanner}>
                    <Text style={styles.replyBannerTxt} numberOfLines={1}>
                      {t('pd_reply_placeholder').replace('{name}', replyTo.user?.displayName ?? '').replace(/\.{3}$/, '')}
                    </Text>
                    <Pressable onPress={() => { setReplyTo(null); setText(''); }} hitSlop={10}>
                      <Text style={styles.replyBannerClose}>✕</Text>
                    </Pressable>
                  </View>
                ) : null}
                <View style={styles.emojiRow}>
                  {QUICK_EMOJIS.map((e) => (
                    <Pressable key={e} onPress={() => { setText((prev) => prev + e); inputRef.current?.focus(); }} hitSlop={6}>
                      <Text style={styles.emoji}>{e}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.inputRow}>
                  <Avatar
                    uri={user?.photoUrl}
                    size={34}
                    placeholderColor={colors.brand}
                    fallback={<Text style={styles.avatarFallback}>{user?.displayName?.[0] ?? '?'}</Text>}
                  />
                  <View style={styles.inputPill}>
                    <TextInput
                      ref={inputRef}
                      style={styles.input}
                      placeholder={
                        replyTo
                          ? t('pd_reply_placeholder').replace('{name}', replyTo.user?.displayName ?? '')
                          : t('pd_comment_placeholder')
                      }
                      placeholderTextColor={colors.textMuted}
                      value={text}
                      onChangeText={setText}
                      multiline
                      maxLength={500}
                    />
                    {canSend ? (
                      <Pressable onPress={() => void send()} style={styles.sendBtn} hitSlop={6}>
                        <Text style={styles.sendTxt}>↑</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { backgroundColor: '#000' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: { alignItems: 'center', paddingTop: 8, paddingBottom: 12 },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.textMuted, opacity: 0.6, marginBottom: 12 },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: 6 },
  emptyTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptySub: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  listContent: { paddingTop: 12, paddingBottom: 12 },

  row: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: 10, gap: 12 },
  rowReply: { paddingLeft: spacing.md + 34 + 12 },
  rowBody: { flex: 1 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  name: { color: colors.textPrimary, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  authorTag: {
    color: colors.textSecondary, fontSize: 10, fontWeight: '700',
    backgroundColor: colors.surfaceAlt, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6,
    overflow: 'hidden',
  },
  ago: { color: colors.textMuted, fontSize: 12 },
  content: { color: colors.textPrimary, fontSize: 14, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 16, marginTop: 6 },
  actionTxt: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  likeCol: { alignItems: 'center', paddingTop: 2, minWidth: 28 },
  heart: { color: colors.textSecondary, fontSize: 17 },
  heartOn: { color: '#ED4956' },
  likeCount: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  avatarFallback: { color: '#fff', fontSize: 12, fontWeight: '700' },

  repliesBlock: { paddingLeft: spacing.md + 34 + 12 },
  repliesToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  repliesLine: { width: 24, height: StyleSheet.hairlineWidth, backgroundColor: colors.textMuted },
  repliesTxt: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },

  composer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface },
  replyBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 8, backgroundColor: colors.surfaceAlt,
  },
  replyBannerTxt: { color: colors.textSecondary, fontSize: 12, flex: 1 },
  replyBannerClose: { color: colors.textSecondary, fontSize: 14, paddingLeft: 12 },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: spacing.sm, paddingVertical: 10 },
  emoji: { fontSize: 24 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: spacing.md, paddingBottom: 6 },
  inputPill: {
    flex: 1, flexDirection: 'row', alignItems: 'flex-end',
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill,
    paddingLeft: 14, paddingRight: 6, paddingVertical: 4, minHeight: 40,
  },
  input: { flex: 1, color: colors.textPrimary, fontSize: 14, maxHeight: 110, paddingVertical: 6 },
  sendBtn: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center', marginBottom: 1,
  },
  sendTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
