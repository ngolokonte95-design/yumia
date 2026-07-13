import { useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Pressable, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { feedApi } from '../../lib/feed-api';
import { colors, radius, spacing, typography } from '../../theme/tokens';

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

      await feedApi.createStory(accessToken, { mediaUrl, type, caption: caption.trim() || undefined });

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

      <View style={{ padding: spacing.md, flex: 1 }}>
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
      </View>
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
});
