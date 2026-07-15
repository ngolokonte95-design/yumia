import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, FlatList, Image, Modal, PanResponder,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { API_BASE_URL } from '../../lib/config';

const API = API_BASE_URL;
const PREVIEW_DURATION_S = 30;
const WAVEFORM_W = 288;
const WAVEFORM_H = 72;
const BAR_COUNT = 52;

// ── Types ─────────────────────────────────────────────────────────────────────

type MediaMode = 'photo' | 'video';

interface MusicTrack {
  title: string;
  artist: string;
  artworkUrl: string;
  previewUrl: string;
  startMs: number;
  durationMs: number;
}

interface ItunesResult {
  trackId: number;
  trackName: string;
  artistName: string;
  artworkUrl100: string;
  previewUrl: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function generateBars(seed: number): number[] {
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const x = Math.abs(((seed * 48_271 + i * 16_807) >>> 0) % 80);
    return 16 + x; // 16–96% of WAVEFORM_H
  });
}

function fmtSec(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── Clip Selector (Phase 2) ────────────────────────────────────────────────────

function ClipSelector({
  track,
  onConfirm,
  onBack,
}: {
  track: ItunesResult;
  onConfirm: (startMs: number, durationMs: number) => void;
  onBack: () => void;
}) {
  const [clipSec, setClipSec] = useState(15);
  const [startSec, setStartSec] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const animX = useRef(new Animated.Value(0)).current;
  const offsetRef = useRef(0);
  const maxXRef = useRef(0);
  const startSecRef = useRef(0);
  const bars = useMemo(() => generateBars(track.trackId), [track.trackId]);

  const winW = (clipSec / PREVIEW_DURATION_S) * WAVEFORM_W;

  useEffect(() => {
    maxXRef.current = Math.max(0, WAVEFORM_W - winW);
    // Re-clamp position when clipSec changes
    const clamped = Math.min(offsetRef.current, maxXRef.current);
    offsetRef.current = clamped;
    animX.setValue(clamped);
    const sec = Math.round((clamped / WAVEFORM_W) * PREVIEW_DURATION_S);
    startSecRef.current = sec;
    setStartSec(sec);
  }, [clipSec, winW, animX]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        const x = Math.max(0, Math.min(maxXRef.current, offsetRef.current + g.dx));
        animX.setValue(x);
      },
      onPanResponderRelease: (_, g) => {
        const x = Math.max(0, Math.min(maxXRef.current, offsetRef.current + g.dx));
        offsetRef.current = x;
        animX.setValue(x);
        const sec = Math.round((x / WAVEFORM_W) * PREVIEW_DURATION_S);
        startSecRef.current = sec;
        setStartSec(sec);
        if (soundRef.current) {
          void soundRef.current.setPositionAsync(sec * 1000);
        }
      },
    }),
  ).current;

  const stopSound = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => null);
      await soundRef.current.unloadAsync().catch(() => null);
      soundRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(async () => {
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      if (isPlaying) {
        await soundRef.current?.pauseAsync();
        setIsPlaying(false);
        return;
      }
      if (soundRef.current) {
        await soundRef.current.playFromPositionAsync(startSecRef.current * 1000);
        setIsPlaying(true);
        return;
      }
      if (!track.previewUrl) return;
      const { sound } = await Audio.Sound.createAsync(
        { uri: track.previewUrl },
        { shouldPlay: true, positionMillis: startSecRef.current * 1000 },
      );
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((st) => {
        if (st.isLoaded && !st.isPlaying) setIsPlaying(false);
      });
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }, [isPlaying, track.previewUrl]);

  useEffect(() => () => { void stopSound(); }, [stopSound]);

  const handleConfirm = async () => {
    await stopSound();
    onConfirm(startSecRef.current * 1000, clipSec * 1000);
  };

  const endSec = Math.min(startSec + clipSec, PREVIEW_DURATION_S);

  return (
    <View style={clip.container}>
      {/* Header */}
      <View style={clip.header}>
        <Pressable onPress={() => { void stopSound(); onBack(); }} style={clip.backBtn}>
          <Text style={clip.backTxt}>← Retour</Text>
        </Pressable>
        <Text style={clip.headerTitle}>Sélectionner un extrait</Text>
        <View style={{ width: 70 }} />
      </View>

      {/* Artwork + infos */}
      <View style={clip.trackRow}>
        <Image source={{ uri: track.artworkUrl100 }} style={clip.artwork} />
        <View style={{ flex: 1 }}>
          <Text style={clip.trackName} numberOfLines={1}>{track.trackName}</Text>
          <Text style={clip.artistName} numberOfLines={1}>{track.artistName}</Text>
        </View>
      </View>

      {/* Duration chips */}
      <View style={clip.durationRow}>
        {[10, 15, 30].map((d) => (
          <Pressable
            key={d}
            style={[clip.durationChip, clipSec === d && clip.durationChipActive]}
            onPress={() => setClipSec(d)}
          >
            <Text style={[clip.durationTxt, clipSec === d && clip.durationTxtActive]}>
              {d}s
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Waveform */}
      <View style={clip.waveContainer}>
        {/* Bars */}
        <View style={clip.barsRow}>
          {bars.map((h, i) => (
            <View
              key={i}
              style={[
                clip.bar,
                {
                  height: (h / 96) * WAVEFORM_H,
                  opacity: 0.4,
                },
              ]}
            />
          ))}
        </View>

        {/* Selection window (draggable) */}
        <Animated.View
          style={[
            clip.selWindow,
            { width: winW, transform: [{ translateX: animX }] },
          ]}
          {...panResponder.panHandlers}
        >
          {/* Colored bars inside window */}
          <View style={StyleSheet.absoluteFill}>
            <View style={clip.barsRow}>
              {bars.map((h, i) => {
                const barX = (i / BAR_COUNT) * WAVEFORM_W;
                const inWindow = barX >= 0 && barX <= winW;
                if (!inWindow) return null;
                return (
                  <View
                    key={i}
                    style={[clip.bar, { height: (h / 96) * WAVEFORM_H, backgroundColor: '#fff' }]}
                  />
                );
              })}
            </View>
          </View>
          {/* Left handle */}
          <View style={clip.handle} />
          {/* Right handle */}
          <View style={[clip.handle, { right: 0, left: undefined }]} />
        </Animated.View>
      </View>

      {/* Timer */}
      <View style={clip.timerRow}>
        <Text style={clip.timer}>{fmtSec(startSec)}</Text>
        <Text style={clip.timerSep}>—</Text>
        <Text style={clip.timer}>{fmtSec(endSec)}</Text>
      </View>

      {/* Play / Pause */}
      <Pressable style={clip.playBtn} onPress={() => void togglePlay()}>
        <Text style={clip.playBtnTxt}>{isPlaying ? '⏸ Pause' : '▶ Écouter l\'extrait'}</Text>
      </Pressable>

      {/* Confirm */}
      <Pressable style={clip.confirmBtn} onPress={() => void handleConfirm()}>
        <Text style={clip.confirmTxt}>✓ Utiliser cet extrait ({clipSec}s)</Text>
      </Pressable>
    </View>
  );
}

// ── Music Picker Modal ─────────────────────────────────────────────────────────

function MusicPickerModal({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (track: MusicTrack) => void;
}) {
  const [phase, setPhase] = useState<'search' | 'clip'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ItunesResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingTrack, setPendingTrack] = useState<ItunesResult | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setPhase('search');
      setQuery('');
      setResults([]);
      setPendingTrack(null);
    }
  }, [visible]);

  useEffect(() => {
    if (timeout.current) clearTimeout(timeout.current);
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    timeout.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=15&media=music`,
        );
        const data = await res.json() as { results: ItunesResult[] };
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, [query]);

  const handleTrackPress = (item: ItunesResult) => {
    setPendingTrack(item);
    setPhase('clip');
  };

  const handleClipConfirm = (startMs: number, durationMs: number) => {
    if (!pendingTrack) return;
    onSelect({
      title: pendingTrack.trackName,
      artist: pendingTrack.artistName,
      artworkUrl: pendingTrack.artworkUrl100.replace('100x100', '300x300'),
      previewUrl: pendingTrack.previewUrl,
      startMs,
      durationMs,
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {phase === 'clip' && pendingTrack ? (
        <ClipSelector
          track={pendingTrack}
          onConfirm={handleClipConfirm}
          onBack={() => setPhase('search')}
        />
      ) : (
        <View style={modal.container}>
          <View style={modal.header}>
            <Text style={modal.title}>🎵 Choisir une musique</Text>
            <Pressable onPress={onClose}><Text style={modal.close}>✕</Text></Pressable>
          </View>

          <View style={modal.searchRow}>
            <TextInput
              style={modal.searchInput}
              placeholder="Rechercher un titre, un artiste..."
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoFocus
              returnKeyType="search"
            />
            {searching && <ActivityIndicator color={colors.brand} style={{ marginLeft: 8 }} />}
          </View>

          <FlatList
            data={results}
            keyExtractor={(item) => String(item.trackId)}
            contentContainerStyle={{ paddingBottom: 40 }}
            ListEmptyComponent={
              query.trim() && !searching ? (
                <View style={modal.empty}>
                  <Text style={modal.emptyText}>Aucun résultat pour « {query} »</Text>
                </View>
              ) : !query.trim() ? (
                <View style={modal.empty}>
                  <Text style={modal.emptyEmoji}>🎧</Text>
                  <Text style={modal.emptyText}>Tape le nom d'une chanson ou d'un artiste</Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <Pressable style={modal.trackRow} onPress={() => handleTrackPress(item)}>
                <Image source={{ uri: item.artworkUrl100 }} style={modal.artwork} />
                <View style={{ flex: 1 }}>
                  <Text style={modal.trackName} numberOfLines={1}>{item.trackName}</Text>
                  <Text style={modal.artistName} numberOfLines={1}>{item.artistName}</Text>
                </View>
                <Text style={{ fontSize: 18, color: colors.textMuted }}>›</Text>
              </Pressable>
            )}
          />
        </View>
      )}
    </Modal>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function CreatePostScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ uri?: string; mediaType?: string }>();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<MediaMode>('photo');
  const [images, setImages] = useState<string[]>(params.uri && params.mediaType !== 'video' ? [params.uri] : []);
  const [videoUri, setVideoUri] = useState<string | null>(params.uri && params.mediaType === 'video' ? params.uri : null);
  const [caption, setCaption] = useState('');
  const [selectedMusic, setSelectedMusic] = useState<MusicTrack | null>(null);
  const [musicModalVisible, setMusicModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [commentsDisabled, setCommentsDisabled] = useState(false);
  const [hideLikeCount, setHideLikeCount] = useState(false);

  const openCamera = () => { router.push('/camera?mode=post' as never); };

  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.85,
      selectionLimit: 10,
    });
    if (!result.canceled) setImages(result.assets.map((a) => a.uri));
  };

  const pickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      videoMaxDuration: 60,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) setVideoUri(result.assets[0].uri);
  };

  const uploadMedia = useCallback(async (uri: string): Promise<string | null> => {
    const form = new FormData();
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mime = ext === 'png' ? 'image/png'
      : ext === 'webp' ? 'image/webp'
      : ext === 'mp4' ? 'video/mp4'
      : ext === 'mov' ? 'video/quicktime'
      : 'image/jpeg';
    form.append('file', { uri, type: mime, name: `media.${ext}` } as any);
    try {
      const res = await fetch(`${API}/posts/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      if (!res.ok) {
        console.warn(`[upload] HTTP ${res.status}:`, await res.text().catch(() => ''));
        return null;
      }
      const data = await res.json() as { url: string };
      return data.url;
    } catch (e) {
      console.warn('[upload] network error:', e);
      return null;
    }
  }, [accessToken]);

  const hasMedia = mode === 'photo' ? images.length > 0 : !!videoUri;

  const submit = async (asDraft = false) => {
    if (!hasMedia) {
      Alert.alert(mode === 'photo' ? 'Ajoute au moins une photo' : 'Sélectionne une vidéo');
      return;
    }
    setLoading(true);
    try {
      let mediaUrls: string[] = [];
      let videoUrl: string | undefined;

      if (mode === 'photo') {
        const uploaded = await Promise.all(images.map((uri) => uploadMedia(uri)));
        mediaUrls = uploaded.filter((u): u is string => u !== null);
        if (mediaUrls.length === 0) {
          Alert.alert('Erreur upload', `0/${images.length} photos uploadées.`);
          return;
        }
      } else if (videoUri) {
        const uploaded = await uploadMedia(videoUri);
        if (!uploaded) { Alert.alert('Erreur upload', 'La vidéo n\'a pas pu être envoyée.'); return; }
        videoUrl = uploaded;
        mediaUrls = [uploaded];
      }

      const body: Record<string, unknown> = {
        mediaUrls,
        caption: caption.trim() || undefined,
        videoUrl,
        commentsDisabled: commentsDisabled || undefined,
        hideLikeCount: hideLikeCount || undefined,
        isDraft: asDraft || undefined,
      };

      if (selectedMusic) {
        body.musicTrack = JSON.stringify({
          title: selectedMusic.title,
          artist: selectedMusic.artist,
          artworkUrl: selectedMusic.artworkUrl,
          previewUrl: selectedMusic.previewUrl,
        });
        body.musicStartMs = selectedMusic.startMs;
        body.musicDurationMs = selectedMusic.durationMs;
      }

      const res = await fetch(`${API}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });

      if (res.ok) { router.back(); }
      else { Alert.alert('Erreur', 'Impossible de publier le post'); }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.cancel}>Annuler</Text></Pressable>
        <Text style={styles.title}>Nouvelle publication</Text>
        <Pressable
          onPress={() => void submit()}
          disabled={loading || !hasMedia}
          style={[styles.shareBtn, (!hasMedia || loading) && styles.shareBtnDisabled]}
        >
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.shareBtnText}>Partager</Text>}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 40 }}>
        {/* Mode toggle */}
        <View style={styles.modeRow}>
          <Pressable style={[styles.modeBtn, mode === 'photo' && styles.modeBtnActive]} onPress={() => { setMode('photo'); setVideoUri(null); }}>
            <Text style={[styles.modeTxt, mode === 'photo' && styles.modeTxtActive]}>📷 Photo</Text>
          </Pressable>
          <Pressable style={[styles.modeBtn, mode === 'video' && styles.modeBtnActive]} onPress={() => { setMode('video'); setImages([]); }}>
            <Text style={[styles.modeTxt, mode === 'video' && styles.modeTxtActive]}>🎬 Vidéo</Text>
          </Pressable>
        </View>

        {/* Photo picker */}
        {mode === 'photo' && (
          images.length > 0 ? (
            <View style={styles.grid}>
              {images.map((uri, i) => (
                <View key={i} style={styles.gridItem}>
                  <Image source={{ uri }} style={styles.gridImg} />
                  <Pressable style={styles.removeBtn} onPress={() => setImages((prev) => prev.filter((_, j) => j !== i))}>
                    <Text style={styles.removeTxt}>✕</Text>
                  </Pressable>
                </View>
              ))}
              <Pressable style={styles.addMore} onPress={pickImages}>
                <Text style={{ fontSize: 28, color: colors.textMuted }}>+</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.mediaChoiceRow}>
              <Pressable style={styles.mediaChoiceBtn} onPress={openCamera}>
                <Text style={styles.mediaChoiceEmoji}>📷</Text>
                <Text style={styles.mediaChoiceLabel}>Caméra</Text>
              </Pressable>
              <Pressable style={styles.mediaChoiceBtn} onPress={() => void pickImages()}>
                <Text style={styles.mediaChoiceEmoji}>🖼️</Text>
                <Text style={styles.mediaChoiceLabel}>Galerie</Text>
                <Text style={styles.mediaChoiceHint}>Jusqu'à 10 photos</Text>
              </Pressable>
            </View>
          )
        )}

        {/* Video picker */}
        {mode === 'video' && (
          videoUri ? (
            <View style={styles.videoSelected}>
              <Text style={styles.videoIcon}>🎬</Text>
              <Text style={styles.videoName} numberOfLines={1}>Vidéo sélectionnée</Text>
              <Pressable onPress={() => setVideoUri(null)} style={styles.videoRemove}>
                <Text style={{ color: '#f87171', fontWeight: '700' }}>✕ Retirer</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.mediaChoiceRow}>
              <Pressable style={styles.mediaChoiceBtn} onPress={openCamera}>
                <Text style={styles.mediaChoiceEmoji}>📷</Text>
                <Text style={styles.mediaChoiceLabel}>Caméra</Text>
              </Pressable>
              <Pressable style={styles.mediaChoiceBtn} onPress={() => void pickVideo()}>
                <Text style={styles.mediaChoiceEmoji}>🎬</Text>
                <Text style={styles.mediaChoiceLabel}>Galerie</Text>
                <Text style={styles.mediaChoiceHint}>Max 60 secondes</Text>
              </Pressable>
            </View>
          )
        )}

        {/* Music picker */}
        {selectedMusic ? (
          <View style={styles.musicSelected}>
            <Image source={{ uri: selectedMusic.artworkUrl }} style={styles.musicArtwork} />
            <View style={{ flex: 1 }}>
              <Text style={styles.musicTitle} numberOfLines={1}>{selectedMusic.title}</Text>
              <Text style={styles.musicArtist} numberOfLines={1}>
                {selectedMusic.artist} · {selectedMusic.durationMs / 1000}s
              </Text>
            </View>
            <Pressable onPress={() => setMusicModalVisible(true)} style={styles.musicChangeBtn}>
              <Text style={styles.musicChangeTxt}>Modifier</Text>
            </Pressable>
            <Pressable onPress={() => setSelectedMusic(null)}>
              <Text style={{ color: colors.textMuted, fontSize: 18, paddingLeft: 4 }}>✕</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.musicRow} onPress={() => setMusicModalVisible(true)}>
            <Text style={styles.musicIcon}>🎵</Text>
            <Text style={styles.musicPlaceholder}>Ajouter une musique</Text>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>›</Text>
          </Pressable>
        )}

        {/* Caption */}
        <TextInput
          style={styles.captionInput}
          placeholder="Écris une légende... (#hashtags acceptés)"
          placeholderTextColor={colors.textMuted}
          value={caption}
          onChangeText={setCaption}
          multiline
          maxLength={500}
        />
        <Text style={styles.charCount}>{caption.length}/500</Text>

        {/* Options */}
        <View style={styles.optionsBox}>
          <Pressable style={styles.optionRow} onPress={() => setCommentsDisabled((v) => !v)}>
            <Text style={styles.optionLabel}>💬 Désactiver les commentaires</Text>
            <Text style={styles.optionToggle}>{commentsDisabled ? '✅' : '⬜'}</Text>
          </Pressable>
          <Pressable style={styles.optionRow} onPress={() => setHideLikeCount((v) => !v)}>
            <Text style={styles.optionLabel}>❤️ Masquer le nombre de J'aime</Text>
            <Text style={styles.optionToggle}>{hideLikeCount ? '✅' : '⬜'}</Text>
          </Pressable>
        </View>

        <Pressable
          style={[styles.draftBtn, (!hasMedia || loading) && styles.shareBtnDisabled]}
          disabled={loading || !hasMedia}
          onPress={() => void submit(true)}
        >
          <Text style={styles.draftBtnText}>📝 Enregistrer comme brouillon</Text>
        </Pressable>
      </ScrollView>

      <MusicPickerModal
        visible={musicModalVisible}
        onClose={() => setMusicModalVisible(false)}
        onSelect={(track) => setSelectedMusic(track)}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  cancel: { color: colors.textMuted, fontSize: 16 },
  title: { ...typography.h3, color: colors.text },
  shareBtn: { backgroundColor: colors.brand, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 8 },
  shareBtnDisabled: { opacity: 0.4 },
  shareBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  modeRow: {
    flexDirection: 'row', backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: 4, marginBottom: spacing.md, gap: 4,
  },
  modeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.md },
  modeBtnActive: { backgroundColor: colors.background },
  modeTxt: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  modeTxtActive: { color: colors.brand, fontWeight: '700' },
  mediaChoiceRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  mediaChoiceBtn: {
    flex: 1, height: 160, backgroundColor: colors.surface, borderRadius: radius.xl,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
    borderColor: colors.border, borderStyle: 'dashed', gap: 6,
  },
  mediaChoiceEmoji: { fontSize: 38 },
  mediaChoiceLabel: { ...typography.h3, color: colors.text },
  mediaChoiceHint: { fontSize: 12, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md },
  gridItem: { width: '31%', aspectRatio: 1, position: 'relative' },
  gridImg: { width: '100%', height: '100%', borderRadius: radius.md },
  removeBtn: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12,
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
  },
  removeTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  addMore: {
    width: '31%', aspectRatio: 1, backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  videoSelected: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.brand + '44',
  },
  videoIcon: { fontSize: 28 },
  videoName: { flex: 1, color: colors.text, fontWeight: '600', fontSize: 14 },
  videoRemove: {},
  musicRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    paddingHorizontal: 14, paddingVertical: 14, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  musicIcon: { fontSize: 20 },
  musicPlaceholder: { flex: 1, color: colors.textMuted, fontSize: 14 },
  musicSelected: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: 10, marginBottom: spacing.md,
    borderWidth: 1.5, borderColor: colors.brand + '66',
  },
  musicArtwork: { width: 46, height: 46, borderRadius: 6 },
  musicTitle: { fontSize: 13, color: colors.text, fontWeight: '700' },
  musicArtist: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  musicChangeBtn: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: colors.border },
  musicChangeTxt: { fontSize: 12, color: colors.brand, fontWeight: '600' },
  captionInput: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, color: colors.text, fontSize: 15,
    minHeight: 100, textAlignVertical: 'top',
    borderWidth: 1, borderColor: colors.border,
    marginBottom: 4,
  },
  charCount: { fontSize: 12, color: colors.textMuted, textAlign: 'right', marginBottom: spacing.md },
  optionsBox: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md,
  },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  optionLabel: { fontSize: 14, color: colors.text },
  optionToggle: { fontSize: 16 },
  draftBtn: {
    alignItems: 'center', paddingVertical: 13,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  draftBtnText: { color: colors.text, fontWeight: '600', fontSize: 14 },
});

const clip = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: {},
  backTxt: { color: colors.brand, fontSize: 16 },
  headerTitle: { ...typography.h3, color: colors.text },
  trackRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 16,
  },
  artwork: { width: 56, height: 56, borderRadius: 8 },
  trackName: { fontSize: 15, color: colors.text, fontWeight: '700' },
  artistName: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  durationRow: {
    flexDirection: 'row', gap: 10, marginBottom: 24,
  },
  durationChip: {
    paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  durationChipActive: { borderColor: colors.brand, backgroundColor: colors.brand + '22' },
  durationTxt: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
  durationTxtActive: { color: colors.brand },
  waveContainer: {
    width: WAVEFORM_W,
    height: WAVEFORM_H,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignSelf: 'center',
    marginBottom: 12,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: WAVEFORM_H,
    gap: 2,
    paddingHorizontal: 2,
  },
  bar: {
    width: (WAVEFORM_W - BAR_COUNT * 2) / BAR_COUNT,
    backgroundColor: colors.textMuted,
    borderRadius: 2,
  },
  selWindow: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: WAVEFORM_H,
    backgroundColor: colors.brand + '44',
    borderWidth: 2,
    borderColor: colors.brand,
    borderRadius: 4,
    overflow: 'hidden',
  },
  handle: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 4,
    height: WAVEFORM_H,
    backgroundColor: colors.brand,
  },
  timerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 24,
  },
  timer: { fontSize: 16, color: colors.text, fontWeight: '600', fontVariant: ['tabular-nums'] },
  timerSep: { fontSize: 14, color: colors.textMuted },
  playBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.brand,
    borderRadius: radius.xl,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  playBtnTxt: { color: colors.brand, fontWeight: '700', fontSize: 15 },
  confirmBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.xl,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

const modal = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { ...typography.h3, color: colors.text },
  close: { fontSize: 20, color: colors.textMuted, paddingHorizontal: 8 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: spacing.md, marginVertical: spacing.md,
  },
  searchInput: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    paddingHorizontal: 14, paddingVertical: 12, color: colors.text,
    fontSize: 15, borderWidth: 1, borderColor: colors.border,
  },
  trackRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  artwork: { width: 50, height: 50, borderRadius: 6 },
  trackName: { fontSize: 14, color: colors.text, fontWeight: '600' },
  artistName: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
