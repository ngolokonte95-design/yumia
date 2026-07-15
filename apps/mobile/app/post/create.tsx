import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Modal, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { API_BASE_URL } from '../../lib/config';

const API = API_BASE_URL;

// ── Types ────────────────────────────────────────────────────────────────────

type MediaMode = 'photo' | 'video';

interface MusicTrack {
  title: string;
  artist: string;
  artworkUrl: string;
  previewUrl: string;
}

interface ItunesResult {
  trackId: number;
  trackName: string;
  artistName: string;
  artworkUrl100: string;
  previewUrl: string;
}

// ── Music picker modal ────────────────────────────────────────────────────────

function MusicPickerModal({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (track: MusicTrack) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ItunesResult[]>([]);
  const [searching, setSearching] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleSelect = (item: ItunesResult) => {
    onSelect({
      title: item.trackName,
      artist: item.artistName,
      artworkUrl: item.artworkUrl100.replace('100x100', '300x300'),
      previewUrl: item.previewUrl,
    });
    onClose();
    setQuery('');
    setResults([]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
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
            <Pressable style={modal.trackRow} onPress={() => handleSelect(item)}>
              <Image source={{ uri: item.artworkUrl100 }} style={modal.artwork} />
              <View style={{ flex: 1 }}>
                <Text style={modal.trackName} numberOfLines={1}>{item.trackName}</Text>
                <Text style={modal.artistName} numberOfLines={1}>{item.artistName}</Text>
              </View>
              <Text style={{ fontSize: 18, color: colors.textMuted }}>+</Text>
            </Pressable>
          )}
        />
      </View>
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
  // Options avancées (façon Instagram)
  const [commentsDisabled, setCommentsDisabled] = useState(false);
  const [hideLikeCount, setHideLikeCount] = useState(false);

  const openCamera = async () => {
    router.push('/camera?mode=post' as never);
  };

  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.85,
      selectionLimit: 10,
    });
    if (!result.canceled) {
      setImages(result.assets.map((a) => a.uri));
    }
  };

  const pickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      videoMaxDuration: 60,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setVideoUri(result.assets[0].uri);
    }
  };

  const uploadImage = useCallback(async (uri: string): Promise<string | null> => {
    const form = new FormData();
    // Detect file extension from URI for correct MIME type
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
        const body = await res.text().catch(() => '');
        console.warn(`[upload] HTTP ${res.status}:`, body);
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
        const uploaded = await Promise.all(images.map((uri) => uploadImage(uri)));
        mediaUrls = uploaded.filter((u): u is string => u !== null);
        if (mediaUrls.length === 0) {
          Alert.alert('Erreur upload', `0/${images.length} photos uploadées. Vérifie les logs console.`);
          return;
        }
      } else if (videoUri) {
        // La vidéo doit être uploadée elle aussi (une URI locale ne serait lisible par personne).
        const uploaded = await uploadImage(videoUri);
        if (!uploaded) {
          Alert.alert('Erreur upload', 'La vidéo n\'a pas pu être envoyée. Réessaie.');
          return;
        }
        videoUrl = uploaded;
        mediaUrls = [uploaded];
      }

      const body: Record<string, unknown> = {
        mediaUrls,
        caption: caption.trim() || undefined,
        musicTrack: selectedMusic ? JSON.stringify(selectedMusic) : undefined,
        videoUrl,
        commentsDisabled: commentsDisabled || undefined,
        hideLikeCount: hideLikeCount || undefined,
        isDraft: asDraft || undefined,
      };

      const res = await fetch(`${API}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        router.back();
      } else {
        Alert.alert('Erreur', 'Impossible de publier le post');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.cancel}>Annuler</Text></Pressable>
        <Text style={styles.title}>Nouvelle publication</Text>
        <Pressable onPress={() => void submit()} disabled={loading || !hasMedia} style={[styles.shareBtn, (!hasMedia || loading) && styles.shareBtnDisabled]}>
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.shareBtnText}>Partager</Text>}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 40 }}>
        {/* Mode toggle */}
        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeBtn, mode === 'photo' && styles.modeBtnActive]}
            onPress={() => { setMode('photo'); setVideoUri(null); }}
          >
            <Text style={[styles.modeTxt, mode === 'photo' && styles.modeTxtActive]}>📷 Photo</Text>
          </Pressable>
          <Pressable
            style={[styles.modeBtn, mode === 'video' && styles.modeBtnActive]}
            onPress={() => { setMode('video'); setImages([]); }}
          >
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
                  <Pressable
                    style={styles.removeBtn}
                    onPress={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  >
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
              <Pressable style={styles.mediaChoiceBtn} onPress={pickImages}>
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
              <Pressable style={styles.mediaChoiceBtn} onPress={pickVideo}>
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
              <Text style={styles.musicArtist} numberOfLines={1}>{selectedMusic.artist}</Text>
            </View>
            <Pressable onPress={() => setMusicModalVisible(true)} style={styles.musicChangeBtn}>
              <Text style={styles.musicChangeTxt}>Changer</Text>
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

        {/* Options avancées */}
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

        {/* Brouillon */}
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
  pickerBox: {
    height: 200, backgroundColor: colors.surface, borderRadius: radius.xl,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
    borderColor: colors.border, borderStyle: 'dashed', marginBottom: spacing.md,
  },
  pickerEmoji: { fontSize: 40, marginBottom: 8 },
  pickerLabel: { ...typography.h3, color: colors.text, marginBottom: 4 },
  pickerHint: { fontSize: 13, color: colors.textMuted },
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
  },
  charCount: { fontSize: 12, color: colors.textMuted, textAlign: 'right', marginTop: 4 },
  optionsBox: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, marginTop: spacing.md,
  },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  optionLabel: { fontSize: 14, color: colors.text },
  optionToggle: { fontSize: 16 },
  draftBtn: {
    marginTop: spacing.md, alignItems: 'center', paddingVertical: 13,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  draftBtnText: { color: colors.text, fontWeight: '600', fontSize: 14 },
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
