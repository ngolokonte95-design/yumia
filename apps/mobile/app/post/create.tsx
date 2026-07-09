import { useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, radius, spacing, typography } from '../../theme/tokens';

const API = process.env.EXPO_PUBLIC_API_URL ?? '';

type MediaMode = 'photo' | 'video';

export default function CreatePostScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<MediaMode>('photo');
  const [images, setImages] = useState<string[]>([]);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [musicTrack, setMusicTrack] = useState('');
  const [loading, setLoading] = useState(false);

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

  const hasMedia = mode === 'photo' ? images.length > 0 : !!videoUri;

  const submit = async () => {
    if (!hasMedia) {
      Alert.alert(mode === 'photo' ? 'Ajoute au moins une photo' : 'Sélectionne une vidéo');
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        mediaUrls: mode === 'photo' ? images : [],
        caption: caption.trim() || undefined,
        musicTrack: musicTrack.trim() || undefined,
        videoUrl: mode === 'video' ? videoUri : undefined,
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
        <Pressable onPress={submit} disabled={loading || !hasMedia} style={[styles.shareBtn, (!hasMedia || loading) && styles.shareBtnDisabled]}>
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
            <Pressable style={styles.pickerBox} onPress={pickImages}>
              <Text style={styles.pickerEmoji}>🖼️</Text>
              <Text style={styles.pickerLabel}>Sélectionner des photos</Text>
              <Text style={styles.pickerHint}>Jusqu'à 10 photos</Text>
            </Pressable>
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
            <Pressable style={styles.pickerBox} onPress={pickVideo}>
              <Text style={styles.pickerEmoji}>🎬</Text>
              <Text style={styles.pickerLabel}>Sélectionner une vidéo</Text>
              <Text style={styles.pickerHint}>Max 60 secondes</Text>
            </Pressable>
          )
        )}

        {/* Music track */}
        <View style={styles.musicRow}>
          <Text style={styles.musicIcon}>🎵</Text>
          <TextInput
            style={styles.musicInput}
            placeholder="Ajouter une musique (titre – artiste)"
            placeholderTextColor={colors.textMuted}
            value={musicTrack}
            onChangeText={setMusicTrack}
            maxLength={100}
          />
          {musicTrack.length > 0 && (
            <Pressable onPress={() => setMusicTrack('')}>
              <Text style={{ color: colors.textMuted, fontSize: 18, paddingHorizontal: 4 }}>✕</Text>
            </Pressable>
          )}
        </View>

        {/* Caption */}
        <TextInput
          style={styles.captionInput}
          placeholder="Écris une légende..."
          placeholderTextColor={colors.textMuted}
          value={caption}
          onChangeText={setCaption}
          multiline
          maxLength={500}
        />
        <Text style={styles.charCount}>{caption.length}/500</Text>
      </ScrollView>
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
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    paddingHorizontal: 14, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  musicIcon: { fontSize: 18 },
  musicInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 12 },
  captionInput: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, color: colors.text, fontSize: 15,
    minHeight: 100, textAlignVertical: 'top',
    borderWidth: 1, borderColor: colors.border,
  },
  charCount: { fontSize: 12, color: colors.textMuted, textAlign: 'right', marginTop: 4 },
});
