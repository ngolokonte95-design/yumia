import { useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { feedApi, type StorySticker } from '../../lib/feed-api';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { MusicPickerModal, type MusicTrack } from '../../components/MusicPicker';

export default function CreateStoryScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ uri?: string; mediaType?: string }>();
  const insets = useSafeAreaInsets();
  const [uri, setUri] = useState<string | null>(params.uri ?? null);
  const [type, setType] = useState<'photo' | 'video'>(params.mediaType === 'video' ? 'video' : 'photo');
  const [caption, setCaption] = useState('');
  const [pinToProfile, setPinToProfile] = useState(false);
  const [highlightTitle, setHighlightTitle] = useState('');
  const [loading, setLoading] = useState(false);
  // Enrichissements façon Instagram
  const [closeFriendsOnly, setCloseFriendsOnly] = useState(false);
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptA, setPollOptA] = useState('Oui');
  const [pollOptB, setPollOptB] = useState('Non');
  const [questionEnabled, setQuestionEnabled] = useState(false);
  const [questionText, setQuestionText] = useState('Pose-moi une question !');
  const [selectedMusic, setSelectedMusic] = useState<MusicTrack | null>(null);
  const [musicModalVisible, setMusicModalVisible] = useState(false);

  const openCamera = () => { router.push('/camera?mode=story' as never); };

  const pick = async (mode: 'photo' | 'video') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: mode === 'photo' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
      quality: 0.85,
      videoMaxDuration: 30,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      setUri(result.assets[0].uri);
      setType(mode);
    }
  };

  const publish = async () => {
    if (!uri || !accessToken) { Alert.alert('Sélectionne une photo ou une vidéo'); return; }
    setLoading(true);
    try {
      const mediaUrl = await feedApi.uploadMedia(accessToken, uri);
      if (!mediaUrl) { Alert.alert('Erreur', "L'upload a échoué."); return; }

      const stickers: StorySticker[] = [];
      if (pollEnabled && pollQuestion.trim()) {
        stickers.push({ kind: 'poll', x: 50, y: 62, question: pollQuestion.trim(), options: [pollOptA.trim() || 'Oui', pollOptB.trim() || 'Non'] });
      }
      if (questionEnabled && questionText.trim()) {
        stickers.push({ kind: 'question', x: 50, y: 40, question: questionText.trim() });
      }

      await feedApi.createStory(accessToken, {
        mediaUrl,
        type,
        caption: caption.trim() || undefined,
        closeFriendsOnly: closeFriendsOnly || undefined,
        stickers: stickers.length ? stickers : undefined,
        musicTrack: selectedMusic ? JSON.stringify(selectedMusic) : undefined,
      });

      if (pinToProfile) {
        await feedApi.createHighlight(accessToken, highlightTitle.trim() || 'À la une', [{ mediaUrl, type, caption: caption.trim() || undefined }]);
      }

      router.back();
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.cancel}>Annuler</Text></Pressable>
        <Text style={styles.title}>Nouvelle story</Text>
        <Pressable onPress={publish} disabled={!uri || loading} style={[styles.shareBtn, (!uri || loading) && styles.shareBtnDisabled]}>
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.shareBtnText}>Publier</Text>}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 40 }}>
        {uri ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri }} style={styles.preview} />
            {type === 'video' && <View style={styles.videoTag}><Text style={{ color: '#fff' }}>🎬 Vidéo</Text></View>}
            <Pressable style={styles.changeBtn} onPress={() => setUri(null)}>
              <Text style={styles.changeTxt}>Changer</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.pickGrid}>
            {/* Caméra — en avant, pleine largeur */}
            <Pressable style={styles.cameraBox} onPress={openCamera}>
              <Text style={styles.pickEmoji}>📷</Text>
              <Text style={styles.pickLabel}>Ouvrir la caméra</Text>
              <Text style={styles.pickHint}>Photo · Vidéo · Reel</Text>
            </Pressable>
            <View style={styles.pickRow}>
              <Pressable style={styles.pickBox} onPress={() => pick('photo')}>
                <Text style={styles.pickEmoji}>🖼️</Text>
                <Text style={styles.pickLabel}>Photo</Text>
              </Pressable>
              <Pressable style={styles.pickBox} onPress={() => pick('video')}>
                <Text style={styles.pickEmoji}>🎬</Text>
                <Text style={styles.pickLabel}>Vidéo</Text>
              </Pressable>
            </View>
          </View>
        )}

        <TextInput
          style={styles.caption}
          placeholder="Ajouter une légende (optionnel)..."
          placeholderTextColor={colors.textMuted}
          value={caption}
          onChangeText={setCaption}
          maxLength={200}
        />

        {/* Musique */}
        {selectedMusic ? (
          <View style={styles.musicSelected}>
            <Image source={{ uri: selectedMusic.artworkUrl }} style={styles.musicArtwork} />
            <View style={{ flex: 1 }}>
              <Text style={styles.musicTitle} numberOfLines={1}>{selectedMusic.title}</Text>
              <Text style={styles.musicArtist} numberOfLines={1}>{selectedMusic.artist} · {selectedMusic.durationMs / 1000}s</Text>
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
            <Text style={{ fontSize: 20 }}>🎵</Text>
            <Text style={styles.musicPlaceholder}>Ajouter une musique</Text>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>›</Text>
          </Pressable>
        )}

        {/* À la une */}
        <View style={styles.pinRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.pinTitle}>📌 Enregistrer à la une</Text>
            <Text style={styles.pinHint}>Garde cette story sur ton profil après 24h</Text>
          </View>
          <Switch value={pinToProfile} onValueChange={setPinToProfile} trackColor={{ true: colors.brand }} />
        </View>
        {pinToProfile && (
          <TextInput
            style={styles.caption}
            placeholder="Nom de la story à la une (ex: Voyages)"
            placeholderTextColor={colors.textMuted}
            value={highlightTitle}
            onChangeText={setHighlightTitle}
            maxLength={30}
          />
        )}

        {/* Amis proches */}
        <View style={styles.pinRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.pinTitle}>🟢 Amis proches uniquement</Text>
            <Text style={styles.pinHint}>Seuls tes amis proches verront cette story</Text>
          </View>
          <Switch value={closeFriendsOnly} onValueChange={setCloseFriendsOnly} trackColor={{ true: '#2BB673' }} />
        </View>

        {/* Sticker sondage */}
        <View style={styles.pinRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.pinTitle}>📊 Ajouter un sondage</Text>
            <Text style={styles.pinHint}>Tes abonnés votent directement dans la story</Text>
          </View>
          <Switch value={pollEnabled} onValueChange={setPollEnabled} trackColor={{ true: colors.brand }} />
        </View>
        {pollEnabled && (
          <View style={{ gap: 8, marginBottom: spacing.md }}>
            <TextInput
              style={[styles.caption, { marginBottom: 0 }]}
              placeholder="Ta question (ex: On y va ce soir ?)"
              placeholderTextColor={colors.textMuted}
              value={pollQuestion}
              onChangeText={setPollQuestion}
              maxLength={80}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[styles.caption, { flex: 1, marginBottom: 0 }]}
                placeholder="Option 1"
                placeholderTextColor={colors.textMuted}
                value={pollOptA}
                onChangeText={setPollOptA}
                maxLength={22}
              />
              <TextInput
                style={[styles.caption, { flex: 1, marginBottom: 0 }]}
                placeholder="Option 2"
                placeholderTextColor={colors.textMuted}
                value={pollOptB}
                onChangeText={setPollOptB}
                maxLength={22}
              />
            </View>
          </View>
        )}

        {/* Sticker question */}
        <View style={styles.pinRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.pinTitle}>💬 Boîte à questions</Text>
            <Text style={styles.pinHint}>Tes abonnés te répondent en message privé</Text>
          </View>
          <Switch value={questionEnabled} onValueChange={setQuestionEnabled} trackColor={{ true: colors.brand }} />
        </View>
        {questionEnabled && (
          <TextInput
            style={styles.caption}
            placeholder="Ton invite (ex: Pose-moi une question !)"
            placeholderTextColor={colors.textMuted}
            value={questionText}
            onChangeText={setQuestionText}
            maxLength={80}
          />
        )}
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  cancel: { color: colors.textMuted, fontSize: 16 },
  title: { ...typography.h3, color: colors.text },
  shareBtn: { backgroundColor: colors.brand, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 8 },
  shareBtnDisabled: { opacity: 0.4 },
  shareBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  previewWrap: { position: 'relative', borderRadius: radius.xl, overflow: 'hidden', marginBottom: spacing.md },
  preview: { width: '100%', aspectRatio: 0.7, borderRadius: radius.xl },
  videoTag: { position: 'absolute', top: 12, left: 12, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 4 },
  changeBtn: { position: 'absolute', bottom: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 8 },
  changeTxt: { color: '#fff', fontWeight: '700' },
  pickGrid: { marginBottom: spacing.md, gap: spacing.md },
  cameraBox: {
    height: 130, backgroundColor: colors.brand + '18', borderRadius: radius.xl,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
    borderColor: colors.brand, gap: 6,
  },
  pickHint: { fontSize: 12, color: colors.textMuted },
  pickRow: { flexDirection: 'row', gap: spacing.md },
  pickBox: { flex: 1, height: 130, backgroundColor: colors.surface, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed', gap: 6 },
  pickEmoji: { fontSize: 40 },
  pickLabel: { ...typography.h3, color: colors.text },
  caption: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  pinRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  pinTitle: { color: colors.text, fontWeight: '700', fontSize: 14 },
  pinHint: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  musicRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 14, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  musicPlaceholder: { flex: 1, color: colors.textMuted, fontSize: 14 },
  musicSelected: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 10, marginBottom: spacing.md, borderWidth: 1.5, borderColor: colors.brand + '66' },
  musicArtwork: { width: 46, height: 46, borderRadius: 6 },
  musicTitle: { fontSize: 13, color: colors.text, fontWeight: '700' },
  musicArtist: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  musicChangeBtn: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: colors.border },
  musicChangeTxt: { fontSize: 12, color: colors.brand, fontWeight: '600' },
});
