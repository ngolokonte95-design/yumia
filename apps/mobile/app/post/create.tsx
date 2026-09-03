import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, Image,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { API_BASE_URL } from '../../lib/config';
import { MusicPickerModal, type MusicTrack } from '../../components/MusicPicker';
import { PostVideo } from '../../components/PostVideo';
import { VideoEditor } from '../../components/postEditor/VideoEditor';
import type { PostOverlay } from '../../lib/feed-api';
import { useI18n } from '../../lib/useI18n';

const API = API_BASE_URL;

type MediaMode = 'photo' | 'video';

export default function CreatePostScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ uri?: string; mediaType?: string }>();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [mode, setMode] = useState<MediaMode>('photo');
  const [images, setImages] = useState<string[]>(params.uri && params.mediaType !== 'video' ? [params.uri] : []);
  const [videoUri, setVideoUri] = useState<string | null>(params.uri && params.mediaType === 'video' ? params.uri : null);
  const [caption, setCaption] = useState('');
  const [selectedMusic, setSelectedMusic] = useState<MusicTrack | null>(null);
  const [musicModalVisible, setMusicModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [commentsDisabled, setCommentsDisabled] = useState(false);
  const [hideLikeCount, setHideLikeCount] = useState(false);

  // Éditeur vidéo façon CapCut : texte, dessin, son coupé, voix off.
  const [editorOpen, setEditorOpen] = useState(false);
  const [overlays, setOverlays] = useState<PostOverlay[]>([]);
  const [videoMuted, setVideoMuted] = useState(false);
  /** URI locale (pas encore hébergée) — uploadée seulement à la publication. */
  const [voiceUri, setVoiceUri] = useState<string | null>(null);

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
      // Sur iOS, ouvre l'éditeur natif (recadrage/trim) avant de renvoyer la
      // vidéo — la « modification avant publication » façon Instagram, sans
      // dépendance native supplémentaire ni nouveau build.
      allowsEditing: true,
      // Applique réellement la limite déjà annoncée dans l'UI ("Max 60
      // secondes"), qui n'était jusqu'ici qu'indicative.
      videoMaxDuration: 60,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setVideoUri(result.assets[0].uri);
      // Une nouvelle vidéo invalide les modifications faites sur l'ancienne.
      setOverlays([]);
      setVideoMuted(false);
      setVoiceUri(null);
    }
  };

  // Remonte une erreur détaillée (statut + message serveur) au lieu de renvoyer
  // silencieusement null : sans ça, un échec d'upload ou de config storage était
  // indiscernable et masquait la vraie cause côté serveur.
  const uploadMedia = useCallback(async (uri: string): Promise<{ url: string; thumbnailUrl?: string }> => {
    const form = new FormData();
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mime = ext === 'png' ? 'image/png'
      : ext === 'webp' ? 'image/webp'
      : ext === 'mp4' ? 'video/mp4'
      : ext === 'mov' ? 'video/quicktime'
      : ext === 'm4v' ? 'video/mp4'
      : ext === 'webm' ? 'video/webm'
      // Voix off enregistrée (expo-av) — même type que les vocaux du chat.
      : ext === 'm4a' || ext === 'caf' ? 'audio/m4a'
      : 'image/jpeg';
    form.append('file', { uri, type: mime, name: `media.${ext}` } as unknown as Blob);
    const res = await fetch(`${API}/posts/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Upload média échoué (HTTP ${res.status}). ${txt.slice(0, 160)}`);
    }
    return await res.json() as { url: string; thumbnailUrl?: string };
  }, [accessToken]);

  const hasMedia = mode === 'photo' ? images.length > 0 : !!videoUri;

  const submit = async (asDraft = false) => {
    if (!hasMedia) {
      Alert.alert(mode === 'photo' ? t('postcreate_add_photo') : t('postcreate_select_video'));
      return;
    }
    setLoading(true);
    try {
      let mediaUrls: string[] = [];
      let videoUrl: string | undefined;
      let voiceTrackUrl: string | undefined;
      // Image extraite automatiquement de la vidéo côté serveur (transcodage)
      // — affichée dans le fil le temps que le lecteur vidéo s'initialise,
      // sans elle un flash noir apparaît à chaque changement de vidéo sur
      // Android (décodeurs matériels limités, cf. lecteur PostVideo/ReelVideo).
      let coverUrl: string | undefined;

      if (mode === 'photo') {
        const uploads = await Promise.all(images.map((uri) => uploadMedia(uri)));
        mediaUrls = uploads.map((u) => u.url);
      } else if (videoUri) {
        // Uploads indépendants : un échec de la voix off ne doit pas
        // empêcher la vidéo elle-même d'être publiée.
        const [videoUpload, voiceUpload] = await Promise.all([
          uploadMedia(videoUri),
          voiceUri ? uploadMedia(voiceUri) : Promise.resolve(undefined),
        ]);
        videoUrl = videoUpload.url;
        coverUrl = videoUpload.thumbnailUrl;
        voiceTrackUrl = voiceUpload?.url;
        mediaUrls = [videoUrl];
      }

      const body: Record<string, unknown> = {
        mediaUrls,
        caption: caption.trim() || undefined,
        videoUrl,
        coverUrl,
        commentsDisabled: commentsDisabled || undefined,
        hideLikeCount: hideLikeCount || undefined,
        isDraft: asDraft || undefined,
        overlays: mode === 'video' && overlays.length > 0 ? overlays : undefined,
        videoMuted: mode === 'video' && videoMuted ? true : undefined,
        voiceTrackUrl,
      };

      if (selectedMusic) {
        body.musicTrack = JSON.stringify({
          title: selectedMusic.title,
          artist: selectedMusic.artist,
          artworkUrl: selectedMusic.artworkUrl,
          previewUrl: selectedMusic.previewUrl,
          startMs: selectedMusic.startMs,
          durationMs: selectedMusic.durationMs,
        });
      }

      const res = await fetch(`${API}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        router.back();
      } else {
        const txt = await res.text().catch(() => '');
        Alert.alert(t('postcreate_error'), t('postcreate_publish_failed').replace('{status}', String(res.status)).replace('{detail}', txt.slice(0, 200)));
      }
    } catch (err) {
      Alert.alert(t('postcreate_error'), err instanceof Error ? err.message : t('postcreate_publish_failed_generic'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.cancel}>{t('postcreate_cancel')}</Text></Pressable>
        <Text style={styles.title}>{t('postcreate_title')}</Text>
        <Pressable
          onPress={() => void submit()}
          disabled={loading || !hasMedia}
          style={[styles.shareBtn, (!hasMedia || loading) && styles.shareBtnDisabled]}
        >
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.shareBtnText}>{t('postcreate_share')}</Text>}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 40 }}>
        {/* Mode toggle */}
        <View style={styles.modeRow}>
          <Pressable style={[styles.modeBtn, mode === 'photo' && styles.modeBtnActive]} onPress={() => { setMode('photo'); setVideoUri(null); }}>
            <Text style={[styles.modeTxt, mode === 'photo' && styles.modeTxtActive]}>{t('postcreate_mode_photo')}</Text>
          </Pressable>
          <Pressable style={[styles.modeBtn, mode === 'video' && styles.modeBtnActive]} onPress={() => { setMode('video'); setImages([]); }}>
            <Text style={[styles.modeTxt, mode === 'video' && styles.modeTxtActive]}>{t('postcreate_mode_video')}</Text>
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
              <Pressable style={styles.addMore} onPress={() => void pickImages()}>
                <Text style={{ fontSize: 28, color: colors.textMuted }}>+</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.mediaChoiceRow}>
              <Pressable style={styles.mediaChoiceBtn} onPress={openCamera}>
                <Text style={styles.mediaChoiceEmoji}>📷</Text>
                <Text style={styles.mediaChoiceLabel}>{t('postcreate_camera')}</Text>
              </Pressable>
              <Pressable style={styles.mediaChoiceBtn} onPress={() => void pickImages()}>
                <Text style={styles.mediaChoiceEmoji}>🖼️</Text>
                <Text style={styles.mediaChoiceLabel}>{t('postcreate_gallery')}</Text>
                <Text style={styles.mediaChoiceHint}>{t('postcreate_up_to_10_photos')}</Text>
              </Pressable>
            </View>
          )
        )}

        {/* Video picker */}
        {mode === 'video' && (
          videoUri ? (
            <View style={styles.videoPreviewWrap}>
              {/* Vrai aperçu qui joue, plutôt qu'un bandeau statique : on doit
                  pouvoir voir ce qu'on s'apprête à publier, comme Instagram. */}
              <PostVideo
                uri={videoUri}
                style={styles.videoPreview}
                overlays={overlays}
                videoMuted={videoMuted}
              />
              <View style={styles.videoPreviewActions}>
                <Pressable style={[styles.videoPreviewBtn, styles.videoPreviewBtnPrimary]} onPress={() => setEditorOpen(true)}>
                  <Text style={[styles.videoPreviewBtnTxt, { color: '#fff' }]}>{t('postcreate_edit')}</Text>
                </Pressable>
                <Pressable style={styles.videoPreviewBtn} onPress={() => void pickVideo()}>
                  <Text style={styles.videoPreviewBtnTxt}>{t('postcreate_change')}</Text>
                </Pressable>
                <Pressable style={styles.videoPreviewBtn} onPress={() => setVideoUri(null)}>
                  <Text style={[styles.videoPreviewBtnTxt, { color: '#f87171' }]}>{t('postcreate_remove')}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.mediaChoiceRow}>
              <Pressable style={styles.mediaChoiceBtn} onPress={openCamera}>
                <Text style={styles.mediaChoiceEmoji}>📷</Text>
                <Text style={styles.mediaChoiceLabel}>{t('postcreate_camera')}</Text>
              </Pressable>
              <Pressable style={styles.mediaChoiceBtn} onPress={() => void pickVideo()}>
                <Text style={styles.mediaChoiceEmoji}>🎬</Text>
                <Text style={styles.mediaChoiceLabel}>{t('postcreate_gallery')}</Text>
                <Text style={styles.mediaChoiceHint}>{t('postcreate_max_60s')}</Text>
              </Pressable>
            </View>
          )
        )}

        {/* Music picker — disponible directement ici pour les deux modes
            (avant, en vidéo, il fallait ouvrir l'éditeur ✏️ Modifier pour y
            accéder ; l'éditeur reste aussi accessible et reste synchronisé
            avec ce choix). */}
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
              <Text style={styles.musicChangeTxt}>{t('postcreate_modify')}</Text>
            </Pressable>
            <Pressable onPress={() => setSelectedMusic(null)}>
              <Text style={{ color: colors.textMuted, fontSize: 18, paddingLeft: 4 }}>✕</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.musicRow} onPress={() => setMusicModalVisible(true)}>
            <Text style={styles.musicIcon}>🎵</Text>
            <Text style={styles.musicPlaceholder}>{t('postcreate_add_music')}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>›</Text>
          </Pressable>
        )}

        {/* Aperçu discret des ajouts de l'éditeur, en mode vidéo. La musique
            n'y figure plus : elle a maintenant sa propre ligne juste
            au-dessus (comme en mode photo), la répéter ici ferait doublon. */}
        {mode === 'video' && videoUri && (overlays.length > 0 || voiceUri || videoMuted) && (
          <View style={styles.editorSummary}>
            {overlays.length > 0 && <Text style={styles.editorSummaryTxt}>{t('postcreate_additions_count').replace('{n}', String(overlays.length)).replace('{s}', overlays.length > 1 ? 's' : '')}</Text>}
            {voiceUri && <Text style={styles.editorSummaryTxt}>{t('postcreate_voice_over')}</Text>}
            {videoMuted && <Text style={styles.editorSummaryTxt}>{t('postcreate_muted_sound')}</Text>}
          </View>
        )}

        {/* Caption */}
        <TextInput
          style={styles.captionInput}
          placeholder={t('postcreate_caption_placeholder')}
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
            <Text style={styles.optionLabel}>{t('postcreate_disable_comments')}</Text>
            <Text style={styles.optionToggle}>{commentsDisabled ? '✅' : '⬜'}</Text>
          </Pressable>
          <Pressable style={styles.optionRow} onPress={() => setHideLikeCount((v) => !v)}>
            <Text style={styles.optionLabel}>{t('postcreate_hide_likes')}</Text>
            <Text style={styles.optionToggle}>{hideLikeCount ? '✅' : '⬜'}</Text>
          </Pressable>
        </View>

        <Pressable
          style={[styles.draftBtn, (!hasMedia || loading) && styles.shareBtnDisabled]}
          disabled={loading || !hasMedia}
          onPress={() => void submit(true)}
        >
          <Text style={styles.draftBtnText}>{t('postcreate_save_draft')}</Text>
        </Pressable>
      </ScrollView>

      <MusicPickerModal
        visible={musicModalVisible}
        onClose={() => setMusicModalVisible(false)}
        onSelect={(track) => setSelectedMusic(track)}
        accessToken={accessToken}
        mediaUri={mode === 'photo' ? images[0] : (videoUri ?? undefined)}
        mediaType={mode}
      />

      {videoUri && (
        <VideoEditor
          visible={editorOpen}
          uri={videoUri}
          initial={{ overlays, videoMuted, voiceTrackUri: voiceUri }}
          initialMusic={selectedMusic}
          accessToken={accessToken}
          onClose={() => setEditorOpen(false)}
          onDone={(result) => {
            setOverlays(result.overlays);
            setVideoMuted(result.videoMuted);
            setVoiceUri(result.voiceTrackUri);
            setSelectedMusic(result.music);
            setEditorOpen(false);
          }}
        />
      )}
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
  videoPreviewWrap: { marginBottom: spacing.md },
  videoPreview: {
    width: '100%', aspectRatio: 4 / 5, borderRadius: radius.xl,
    overflow: 'hidden', backgroundColor: colors.surface,
  },
  videoPreviewActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  videoPreviewBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  videoPreviewBtnPrimary: { backgroundColor: colors.brand, borderColor: colors.brand },
  videoPreviewBtnTxt: { color: colors.text, fontWeight: '600', fontSize: 13 },
  editorSummary: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    marginBottom: spacing.md,
  },
  editorSummaryTxt: {
    fontSize: 12, color: colors.textSecondary, fontWeight: '600',
    backgroundColor: colors.surface, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: colors.border,
  },
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
