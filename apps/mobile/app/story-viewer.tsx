import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Dimensions, FlatList, Image, KeyboardAvoidingView, Modal,
  Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Audio } from 'expo-av';
import * as MediaLibrary from 'expo-media-library';
import { Directory, File, Paths } from 'expo-file-system';
import { useAuth } from '../lib/auth-context';
import { feedApi, type StoryGroup, type StorySticker } from '../lib/feed-api';
import { colors, radius, spacing } from '../theme/tokens';
import type { MusicTrack } from '../components/MusicPicker';

const { width, height } = Dimensions.get('window');
const STORY_MS = 5000;
const VIDEO_STORY_MS = 15000;

function StoryVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = false; p.play(); });
  return <VideoView player={player} style={styles.media} contentFit="cover" nativeControls={false} />;
}

/** Sticker sondage votable, superposé sur la story. */
function PollSticker({ sticker, storyId, token }: { sticker: StorySticker; storyId: string; token: string }) {
  const [results, setResults] = useState<number[]>([]);
  const [myVote, setMyVote] = useState<number | null>(null);

  useEffect(() => {
    void feedApi.pollResults(token, storyId).then((r) => { setResults(r.results); setMyVote(r.myVote); });
  }, [token, storyId]);

  const vote = async (i: number) => {
    const res = await feedApi.votePoll(token, storyId, i);
    if (res) { setResults(res.results); setMyVote(res.myVote); }
  };

  const total = results.reduce((a, b) => a + b, 0);
  const options = sticker.options ?? ['Oui', 'Non'];

  return (
    <View style={[styles.sticker, { left: `${Math.max(4, Math.min(60, sticker.x - 25))}%`, top: `${sticker.y}%`, width: '70%' }]}>
      <View style={styles.pollBox}>
        <Text style={styles.pollQuestion}>{sticker.question}</Text>
        {options.map((opt, i) => {
          const pct = total > 0 ? Math.round(((results[i] ?? 0) / total) * 100) : 0;
          const voted = myVote !== null;
          return (
            <Pressable key={i} style={styles.pollOption} onPress={() => void vote(i)}>
              {voted && <View style={[styles.pollFill, { width: `${pct}%` }, myVote === i && styles.pollFillMine]} />}
              <View style={styles.pollOptionRow}>
                <Text style={styles.pollOptionText}>{opt}{myVote === i ? ' ✓' : ''}</Text>
                {voted && <Text style={styles.pollPct}>{pct}%</Text>}
              </View>
            </Pressable>
          );
        })}
        {total > 0 && <Text style={styles.pollTotal}>{total} vote{total > 1 ? 's' : ''}</Text>}
      </View>
    </View>
  );
}

export default function StoryViewerScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { accessToken, user: me } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [group, setGroup] = useState<StoryGroup | null>(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySent, setReplySent] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewers, setViewers] = useState<Array<{ viewedAt: string; user: { id: string; displayName: string; photoUrl?: string } }>>([]);
  const progress = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef<Animated.CompositeAnimation | null>(null);
  const musicSoundRef = useRef<Audio.Sound | null>(null);
  const diskRotation = useRef(new Animated.Value(0)).current;
  const diskAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const isMine = group?.user?.id === me?.id;

  useEffect(() => {
    if (!accessToken || !userId) return;
    void (async () => {
      const groups = await feedApi.globalStories(accessToken);
      setGroup(groups.find((g) => g.user?.id === userId) ?? null);
      setLoading(false);
    })();
  }, [accessToken, userId]);

  const musicMeta = useMemo<MusicTrack | null>(() => {
    const raw = group?.stories[index]?.musicTrack;
    if (!raw) return null;
    try { return JSON.parse(raw) as MusicTrack; } catch { return null; }
  }, [group, index]);

  // Charge/décharge la piste musicale à chaque changement de story
  useEffect(() => {
    if (!musicMeta?.previewUrl) {
      musicSoundRef.current?.stopAsync().catch(() => null);
      musicSoundRef.current?.unloadAsync().catch(() => null);
      musicSoundRef.current = null;
      return;
    }
    let sound: Audio.Sound | null = null;
    const load = async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound: s } = await Audio.Sound.createAsync(
          { uri: musicMeta.previewUrl },
          { shouldPlay: true, positionMillis: musicMeta.startMs ?? 0, isLooping: true },
        );
        sound = s;
        musicSoundRef.current = s;
      } catch {}
    };
    void load();
    return () => {
      sound?.stopAsync().catch(() => null);
      sound?.unloadAsync().catch(() => null);
      musicSoundRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Pause/reprise musique avec l'état de la story
  useEffect(() => {
    if (!musicSoundRef.current) return;
    if (paused || viewersOpen) {
      musicSoundRef.current.pauseAsync().catch(() => null);
    } else {
      musicSoundRef.current.playAsync().catch(() => null);
    }
  }, [paused, viewersOpen]);

  // Rotation du disque vinyle
  useEffect(() => {
    diskAnimRef.current?.stop();
    diskRotation.setValue(0);
    if (musicMeta && !paused && !viewersOpen) {
      diskAnimRef.current = Animated.loop(
        Animated.timing(diskRotation, { toValue: 1, duration: 4000, useNativeDriver: true }),
      );
      diskAnimRef.current.start();
    }
  }, [musicMeta, paused, viewersOpen, diskRotation]);

  const close = useCallback(() => router.back(), [router]);

  const next = useCallback(() => {
    setIndex((i) => {
      if (!group) return i;
      // Ne pas naviguer depuis l'updater de setState (rendu d'un autre
      // composant en cours) : ça déclenche « Cannot update a component while
      // rendering a different component ». On diffère la fermeture après le commit.
      if (i + 1 >= group.stories.length) { setTimeout(close, 0); return i; }
      return i + 1;
    });
    setReplySent(false);
  }, [group, close]);

  const prev = useCallback(() => { setIndex((i) => Math.max(0, i - 1)); setReplySent(false); }, []);

  // Auto-avance + barre de progression animée (pause quand focus reply ou vues ouvertes)
  useEffect(() => {
    if (!group || !group.stories[index] || paused || viewersOpen) {
      progressAnim.current?.stop();
      return;
    }
    const story = group.stories[index];
    const ms = story.type === 'video' ? VIDEO_STORY_MS : STORY_MS;
    if (accessToken) void feedApi.markStoryViewed(accessToken, story.id);
    progress.setValue(0);
    // L'animation est l'unique horloge d'avancement (un setTimeout parallèle
    // doublerait l'appel à next() → saut de story / double router.back()).
    progressAnim.current = Animated.timing(progress, { toValue: 1, duration: ms, useNativeDriver: false });
    progressAnim.current.start(({ finished }) => { if (finished) next(); });
    return () => { progressAnim.current?.stop(); };
  }, [group, index, next, accessToken, paused, viewersOpen, progress]);

  const openViewers = async () => {
    if (!accessToken || !group) return;
    setViewersOpen(true);
    const list = await feedApi.storyViewers(accessToken, group.stories[index].id);
    setViewers(list);
  };

  const sendReply = async () => {
    if (!accessToken || !group || !replyText.trim()) return;
    const ok = await feedApi.replyToStory(accessToken, group.stories[index].id, replyText.trim());
    if (ok) { setReplyText(''); setReplySent(true); setPaused(false); }
  };

  const [saving, setSaving] = useState(false);
  const saveStory = async () => {
    if (!group) return;
    const story = group.stories[index];
    setSaving(true);
    setPaused(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission refusée', 'Autorise l\'accès aux photos pour enregistrer.'); return; }
      const dest = new Directory(Paths.cache, `story-${story.id}-${Date.now()}`);
      dest.create();
      const file = await File.downloadFileAsync(story.mediaUrl, dest, { idempotent: true });
      await MediaLibrary.saveToLibraryAsync(file.uri);
      Alert.alert('Enregistré', 'La story a été enregistrée dans tes photos.');
    } catch {
      Alert.alert('Erreur', 'Impossible d\'enregistrer cette story.');
    } finally {
      setSaving(false);
      setPaused(false);
    }
  };

  const deleteStory = () => {
    if (!accessToken || !group) return;
    const story = group.stories[index];
    setPaused(true);
    Alert.alert('Supprimer cette story ?', 'Cette action est irréversible.', [
      { text: 'Annuler', style: 'cancel', onPress: () => setPaused(false) },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await feedApi.deleteStory(accessToken, story.id);
            if (group.stories.length <= 1) { close(); return; }
            setGroup((g) => g ? { ...g, stories: g.stories.filter((s) => s.id !== story.id) } : g);
            setIndex((i) => Math.min(i, group.stories.length - 2));
            setPaused(false);
          } catch {
            Alert.alert('Erreur', 'Impossible de supprimer cette story.');
            setPaused(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#fff" /></View>;
  }
  if (!group || group.stories.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Aucune story active</Text>
        <Pressable onPress={close} style={styles.closeFallback}><Text style={styles.closeTxt}>Fermer</Text></Pressable>
      </View>
    );
  }

  const story = group.stories[index];
  const stickers = (story.stickers ?? []) as StorySticker[];

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {story.type === 'video' ? (
        <StoryVideo key={story.id} uri={story.mediaUrl} />
      ) : (
        <Image source={{ uri: story.mediaUrl }} style={styles.media} resizeMode="cover" />
      )}

      {/* Barres de progression */}
      <View style={[styles.progressRow, { top: insets.top + 8 }]}>
        {group.stories.map((s, i) => (
          <View key={s.id} style={styles.progressTrack}>
            {i < index ? (
              <View style={[styles.progressFill, { width: '100%' }]} />
            ) : i === index ? (
              <Animated.View style={[styles.progressFill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
            ) : null}
          </View>
        ))}
      </View>

      {/* En-tête auteur */}
      <View style={[styles.topBar, { top: insets.top + 20 }]}>
        {group.user.photoUrl ? (
          <Image source={{ uri: group.user.photoUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{group.user.displayName[0]}</Text>
          </View>
        )}
        <Text style={styles.name}>{group.user.displayName}</Text>
        {story.closeFriendsOnly ? (
          <View style={styles.cfBadge}><Text style={styles.cfBadgeTxt}>🟢 Amis proches</Text></View>
        ) : null}
        <Pressable onPress={close} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
      </View>

      {/* Stickers superposés */}
      {accessToken && stickers.map((st, i) => {
        if (st.kind === 'poll' || st.kind === 'emoji_slider') {
          return <PollSticker key={`${story.id}-${i}`} sticker={st} storyId={story.id} token={accessToken} />;
        }
        if (st.kind === 'question') {
          return (
            <View key={i} style={[styles.sticker, { left: '10%', top: `${st.y}%`, width: '80%' }]}>
              <View style={styles.questionBox}>
                <Text style={styles.questionText}>{st.question}</Text>
                <Text style={styles.questionHint}>Réponds avec la barre en bas ⬇️</Text>
              </View>
            </View>
          );
        }
        if (st.kind === 'mention' || st.kind === 'hashtag' || st.kind === 'location' || st.kind === 'text' || st.kind === 'link') {
          const label = st.kind === 'mention' ? `@${st.label}` : st.kind === 'hashtag' ? `#${st.label}` : st.kind === 'location' ? `📍 ${st.label}` : (st.text ?? st.label ?? '');
          if (!label) return null;
          return (
            <Pressable
              key={i}
              style={[styles.sticker, { left: `${Math.max(2, Math.min(70, st.x - 15))}%`, top: `${st.y}%` }]}
              onPress={() => {
                if (st.kind === 'mention' && st.userId) router.push(`/user/${st.userId}` as never);
              }}
            >
              <View style={styles.labelSticker}><Text style={styles.labelStickerTxt}>{label}</Text></View>
            </Pressable>
          );
        }
        return null;
      })}

      {musicMeta ? (
        <View style={[styles.musicBar, { bottom: insets.bottom + (story.caption ? 140 : 90) }]}>
          <Animated.Image
            source={{ uri: musicMeta.artworkUrl }}
            style={[styles.musicDisk, {
              transform: [{ rotate: diskRotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
            }]}
          />
          <Text style={styles.musicTrackText} numberOfLines={1}>♫ {musicMeta.title} · {musicMeta.artist}</Text>
        </View>
      ) : null}

      {story.caption ? (
        <View style={[styles.captionWrap, { bottom: insets.bottom + 90 }]}>
          <Text style={styles.caption}>{story.caption}</Text>
        </View>
      ) : null}

      {/* Zones tactiles précédent / suivant */}
      <Pressable style={styles.tapLeft} onPress={prev} />
      <Pressable style={styles.tapRight} onPress={next} />

      {/* Barre du bas : vues + enregistrer/supprimer (ma story) OU réponse en DM (story d'autrui) */}
      {isMine ? (
        <View style={[styles.myStoryRow, { bottom: insets.bottom + 16 }]}>
          <Pressable style={styles.viewsBar} onPress={openViewers}>
            <Text style={styles.viewsTxt}>👁 {story.viewCount ?? 0} vue{(story.viewCount ?? 0) > 1 ? 's' : ''} — voir qui</Text>
          </Pressable>
          <Pressable style={styles.circleActionBtn} onPress={() => void saveStory()} disabled={saving} hitSlop={8}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.circleActionTxt}>💾</Text>}
          </Pressable>
          <Pressable style={styles.circleActionBtn} onPress={deleteStory} hitSlop={8}>
            <Text style={styles.circleActionTxt}>🗑️</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.replyBar, { bottom: insets.bottom + 12 }]}>
          <TextInput
            style={styles.replyInput}
            placeholder={replySent ? 'Réponse envoyée ✓' : `Répondre à ${group.user.displayName.split(' ')[0]}...`}
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={replyText}
            onChangeText={setReplyText}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            returnKeyType="send"
            onSubmitEditing={() => void sendReply()}
          />
          <Pressable onPress={() => void sendReply()} disabled={!replyText.trim()} hitSlop={8}>
            <Text style={[styles.replySend, !replyText.trim() && { opacity: 0.4 }]}>➤</Text>
          </Pressable>
        </View>
      )}

      {/* Liste des vues (ma story) */}
      <Modal visible={viewersOpen} transparent animationType="slide" onRequestClose={() => setViewersOpen(false)}>
        <Pressable style={styles.viewersOverlay} onPress={() => setViewersOpen(false)}>
          <View style={styles.viewersSheet}>
            <Text style={styles.viewersTitle}>👁 Vues ({viewers.length})</Text>
            <FlatList
              data={viewers}
              keyExtractor={(v) => v.user.id}
              style={{ maxHeight: height * 0.4 }}
              ListEmptyComponent={<Text style={styles.viewersEmpty}>Personne n'a encore vu cette story.</Text>}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.viewerRow}
                  onPress={() => { setViewersOpen(false); router.push(`/user/${item.user.id}` as never); }}
                >
                  {item.user.photoUrl ? (
                    <Image source={{ uri: item.user.photoUrl }} style={styles.viewerAvatar} />
                  ) : (
                    <View style={[styles.viewerAvatar, styles.avatarFallback]}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>{item.user.displayName[0]}</Text>
                    </View>
                  )}
                  <Text style={styles.viewerName}>{item.user.displayName}</Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', gap: 16 },
  empty: { color: '#fff', fontSize: 16 },
  closeFallback: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.surface, borderRadius: 999 },
  closeTxt: { color: '#fff', fontWeight: '700' },
  media: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  progressRow: { position: 'absolute', left: spacing.sm, right: spacing.sm, flexDirection: 'row', gap: 4, zIndex: 5 },
  progressTrack: { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: '#fff' },
  topBar: { position: 'absolute', left: spacing.md, right: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 5 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 15 },
  cfBadge: { backgroundColor: 'rgba(43,182,115,0.9)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  cfBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },
  close: { color: '#fff', fontSize: 22, fontWeight: '700' },
  musicBar: { position: 'absolute', left: spacing.md, right: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, zIndex: 6 },
  musicDisk: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  musicTrackText: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  captionWrap: { position: 'absolute', left: spacing.md, right: spacing.md, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: 12 },
  caption: { color: '#fff', fontSize: 15, textAlign: 'center' },
  tapLeft: { position: 'absolute', left: 0, top: 80, bottom: 110, width: width * 0.3 },
  tapRight: { position: 'absolute', right: 0, top: 80, bottom: 110, width: width * 0.7 },
  // Stickers
  sticker: { position: 'absolute', zIndex: 6 },
  pollBox: { backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: radius.lg, padding: 12, gap: 8 },
  pollQuestion: { fontWeight: '800', fontSize: 15, color: '#111', textAlign: 'center' },
  pollOption: { borderRadius: radius.md, borderWidth: 1.5, borderColor: '#E8621A', overflow: 'hidden', position: 'relative' },
  pollFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#E8621A22' },
  pollFillMine: { backgroundColor: '#E8621A44' },
  pollOptionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 9 },
  pollOptionText: { fontWeight: '700', color: '#E8621A', fontSize: 14 },
  pollPct: { fontWeight: '800', color: '#111', fontSize: 13 },
  pollTotal: { fontSize: 11, color: '#666', textAlign: 'center' },
  questionBox: { backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: radius.lg, padding: 14, alignItems: 'center', gap: 4 },
  questionText: { fontWeight: '800', fontSize: 15, color: '#111', textAlign: 'center' },
  questionHint: { fontSize: 11, color: '#888' },
  labelSticker: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  labelStickerTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  // Barre du bas
  myStoryRow: { position: 'absolute', left: spacing.md, right: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 6 },
  viewsBar: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingVertical: 11, alignItems: 'center' },
  circleActionBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  circleActionTxt: { fontSize: 19 },
  viewsTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  replyBar: {
    position: 'absolute', left: spacing.md, right: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 16, paddingVertical: 4, zIndex: 6,
  },
  replyInput: { flex: 1, color: '#fff', fontSize: 14, height: 40 },
  replySend: { color: '#fff', fontSize: 20 },
  // Viewers modal
  viewersOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  viewersSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 40 },
  viewersTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 16, marginBottom: 12 },
  viewersEmpty: { color: colors.textMuted, fontSize: 13, paddingVertical: 20, textAlign: 'center' },
  viewerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  viewerAvatar: { width: 40, height: 40, borderRadius: 20 },
  viewerName: { color: colors.textPrimary, fontWeight: '600', fontSize: 14 },
});
