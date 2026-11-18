import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type ViewStyle,
} from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, gradients, radius, spacing, typography } from '../../theme/tokens';
import { CrystalFill, GradientText, PressableScale, Reveal } from '../../components/ui';
import { PillTabs, TopGlassButton } from '../../components/p2b/ProfileVisuals';
import { CHEVRON, GLASS, GlassGroup, IconBubble, ToggleRow } from '../../components/profile/ProfileChrome';
import { API_BASE_URL } from '../../lib/config';
import { MusicPickerModal, type MusicTrack } from '../../components/MusicPicker';
import { PostVideo } from '../../components/PostVideo';
import { PlacePicker, type PickedPlace } from '../../components/PlacePicker';
import { VideoEditor } from '../../components/postEditor/VideoEditor';
import type { PostOverlay } from '../../lib/feed-api';
import { useI18n } from '../../lib/useI18n';
import { useKeyboardReveal } from '../../lib/useKeyboardReveal';
import { appendFile } from '../../lib/upload';
import { FeatureTip } from '../../components/FeatureTip';

/** Photos par publication — la limite d'Instagram, annoncée dans l'écran. */
const MAX_PHOTOS = 10;

const API = API_BASE_URL;

type MediaMode = 'photo' | 'video';

/**
 * Nouvelle publication — DA du 18/11/2026, sobre comme le profil social :
 * fond sombre, verre, titre en blanc cristal, choix et bouton Partager
 * sertis de cristal, options en groupe vitré à interrupteurs. Aucune couleur.
 */

export default function CreatePostScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ uri?: string; mediaType?: string }>();
  const insets = useSafeAreaInsets();
  // La légende est sous l'aperçu du média : sans ça, le clavier la recouvrait.
  const scrollRef = useRef<ScrollViewInstance>(null);
  const kb = useKeyboardReveal(scrollRef);
  const { t } = useI18n();
  const [mode, setMode] = useState<MediaMode>('photo');
  const [images, setImages] = useState<string[]>(params.uri && params.mediaType !== 'video' ? [params.uri] : []);
  const [videoUri, setVideoUri] = useState<string | null>(params.uri && params.mediaType === 'video' ? params.uri : null);
  const [caption, setCaption] = useState('');
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [placePickerOpen, setPlacePickerOpen] = useState(false);
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

  // Le « + » AJOUTE à la sélection : il la remplaçait, si bien qu'on perdait
  // les photos déjà choisies (ou celle prise à l'appareil) en voulant en
  // ajouter une — le carrousel paraissait impossible à composer.
  const pickImages = async () => {
    const remaining = MAX_PHOTOS - images.length;
    if (remaining <= 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      // Garde l'ordre de sélection : c'est l'ordre du carrousel.
      orderedSelection: true,
      quality: 0.85,
      selectionLimit: remaining,
    });
    if (result.canceled) return;
    setImages((prev) => {
      const added = result.assets.map((a) => a.uri).filter((uri) => !prev.includes(uri));
      return [...prev, ...added].slice(0, MAX_PHOTOS);
    });
  };

  /** Fait de la photo `i` la couverture — celle affichée en premier et sur le profil. */
  const makeCover = (i: number) => {
    if (i === 0) return;
    setImages((prev) => [prev[i], ...prev.filter((_, j) => j !== i)]);
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
      // Qualité « moyenne » : une minute filmée en 4K dépasse largement la
      // limite d'envoi (nginx refuse alors en HTTP 413). Le rendu reste net
      // sur un écran de téléphone, pour un fichier plusieurs fois plus petit.
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
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
    appendFile(form, 'file', uri);
    const res = await fetch(`${API}/posts/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      if (res.status === 413) throw new Error(t('postcreate_upload_too_large'));
      throw new Error(t('postcreate_upload_failed').replace('{status}', String(res.status)).replace('{detail}', txt.slice(0, 160)));
    }
    return await res.json() as { url: string; thumbnailUrl?: string };
  }, [accessToken, t]);

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
        placeId: place?.id,
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

  const changeMode = (m: MediaMode) => {
    if (m === mode) return;
    setMode(m);
    if (m === 'photo') setVideoUri(null);
    else setImages([]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 6 }]}>
      <View style={styles.topBar}>
        <TopGlassButton label="✕" onPress={() => router.back()} accessibilityLabel={t('postcreate_cancel')} />
        <GradientText style={styles.title} colors={gradients.crystal} numberOfLines={1}>{t('postcreate_title')}</GradientText>
        <CrystalButton
          label={t('postcreate_share')}
          loading={loading}
          disabled={loading || !hasMedia}
          onPress={() => void submit()}
        />
      </View>

      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScroll={kb.onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 40 + kb.bottomInset }}
      >
        <PillTabs<MediaMode>
          style={styles.modeRow}
          active={mode}
          onChange={changeMode}
          tabs={[
            { key: 'photo', label: t('postcreate_mode_photo') },
            { key: 'video', label: t('postcreate_mode_video') },
          ]}
        />

        {/* ── Photos ── */}
        {mode === 'photo' && (
          images.length > 0 ? (
            <Reveal>
              <View style={styles.grid}>
                {images.map((uri, i) => (
                  <PressableScale key={uri} style={styles.gridItem} onPress={() => makeCover(i)} scaleTo={0.96}>
                    <Image source={{ uri }} style={styles.gridImg} />
                    {images.length > 1 && (
                      i === 0 ? (
                        <View style={[styles.orderBadge, styles.coverBadge]}>
                          <CrystalFill edge={1} />
                          <Text style={styles.orderTxt}>{t('postcreate_cover')}</Text>
                        </View>
                      ) : (
                        <View style={styles.orderBadge}>
                          <Text style={styles.orderTxt}>{i + 1}</Text>
                        </View>
                      )
                    )}
                    <PressableScale
                      style={styles.removeBtn}
                      onPress={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                      scaleTo={0.85}
                      hitSlop={6}
                    >
                      <Text style={styles.removeTxt}>✕</Text>
                    </PressableScale>
                  </PressableScale>
                ))}
                {images.length < MAX_PHOTOS && (
                  <PressableScale style={[styles.addMore, GLASS]} onPress={() => void pickImages()} scaleTo={0.95}>
                    <Text style={styles.addMorePlus}>＋</Text>
                    <Text style={styles.addMoreHint}>{images.length}/{MAX_PHOTOS}</Text>
                  </PressableScale>
                )}
              </View>
              {images.length > 1 && (
                <Text style={styles.carouselHint}>{t('postcreate_cover_hint')}</Text>
              )}
            </Reveal>
          ) : (
            <MediaChoices
              onCamera={openCamera}
              onGallery={() => void pickImages()}
              galleryEmoji="🖼️"
              galleryHint={t('postcreate_up_to_10_photos')}
              cameraLabel={t('postcreate_camera')}
              galleryLabel={t('postcreate_gallery')}
            />
          )
        )}

        {/* ── Vidéo ── */}
        {mode === 'video' && (
          videoUri ? (
            <Reveal style={styles.videoPreviewWrap}>
              {/* Vrai aperçu qui joue, plutôt qu'un bandeau statique : on doit
                  pouvoir voir ce qu'on s'apprête à publier, comme Instagram. */}
              <View style={styles.videoFrame}>
                <PostVideo
                  uri={videoUri}
                  style={styles.videoPreview}
                  overlays={overlays}
                  videoMuted={videoMuted}
                />
              </View>
              <View style={styles.videoPreviewActions}>
                <PressableScale style={styles.videoBtn} onPress={() => setEditorOpen(true)} scaleTo={0.95}>
                  <CrystalFill />
                  <GradientText style={styles.videoBtnTxtStrong} colors={gradients.crystal} numberOfLines={1}>
                    {t('postcreate_edit')}
                  </GradientText>
                </PressableScale>
                <PressableScale style={[styles.videoBtn, GLASS]} onPress={() => void pickVideo()} scaleTo={0.95}>
                  <Text style={styles.videoBtnTxt} numberOfLines={1}>{t('postcreate_change')}</Text>
                </PressableScale>
                <PressableScale style={[styles.videoBtn, GLASS]} onPress={() => setVideoUri(null)} scaleTo={0.95}>
                  <Text style={[styles.videoBtnTxt, styles.dangerTxt]} numberOfLines={1}>{t('postcreate_remove')}</Text>
                </PressableScale>
              </View>
            </Reveal>
          ) : (
            <MediaChoices
              onCamera={openCamera}
              onGallery={() => void pickVideo()}
              galleryEmoji="🎬"
              galleryHint={t('postcreate_max_60s')}
              cameraLabel={t('postcreate_camera')}
              galleryLabel={t('postcreate_gallery')}
            />
          )
        )}

        {/* Musique — disponible directement ici pour les deux modes ; l'éditeur
            vidéo reste aussi accessible et reste synchronisé avec ce choix. */}
        {selectedMusic ? (
          <View style={[styles.row, GLASS, styles.rowSet]}>
            <Image source={{ uri: selectedMusic.artworkUrl }} style={styles.musicArtwork} />
            <View style={styles.flex1}>
              <Text style={styles.musicTitle} numberOfLines={1}>{selectedMusic.title}</Text>
              <Text style={styles.musicArtist} numberOfLines={1}>
                {selectedMusic.artist} · {selectedMusic.durationMs / 1000}s
              </Text>
            </View>
            <PressableScale onPress={() => setMusicModalVisible(true)} style={[styles.smallBtn, GLASS]} scaleTo={0.92}>
              <Text style={styles.smallBtnTxt}>{t('postcreate_modify')}</Text>
            </PressableScale>
            <PressableScale onPress={() => setSelectedMusic(null)} hitSlop={10} scaleTo={0.85}>
              <Text style={styles.clear}>✕</Text>
            </PressableScale>
          </View>
        ) : (
          <PressableScale style={[styles.row, GLASS]} onPress={() => setMusicModalVisible(true)} scaleTo={0.98}>
            <IconBubble icon="🎵" />
            <Text style={styles.rowPlaceholder}>{t('postcreate_add_music')}</Text>
            <Text style={styles.chevron}>{CHEVRON}</Text>
          </PressableScale>
        )}

        {/* Aperçu discret des ajouts de l'éditeur, en mode vidéo. */}
        {mode === 'video' && videoUri && (overlays.length > 0 || voiceUri || videoMuted) && (
          <View style={styles.editorSummary}>
            {overlays.length > 0 && <Text style={[styles.editorSummaryTxt, GLASS]}>{t('postcreate_additions_count').replace('{n}', String(overlays.length)).replace('{s}', overlays.length > 1 ? 's' : '')}</Text>}
            {voiceUri && <Text style={[styles.editorSummaryTxt, GLASS]}>{t('postcreate_voice_over')}</Text>}
            {videoMuted && <Text style={[styles.editorSummaryTxt, GLASS]}>{t('postcreate_muted_sound')}</Text>}
          </View>
        )}

        {/* Légende */}
        <CaptionField
          value={caption}
          onChangeText={setCaption}
          placeholder={t('postcreate_caption_placeholder')}
        />
        <Text style={styles.charCount}>{caption.length}/500</Text>

        {/* Lieu — rattaché à la base YUMIA plutôt qu'à du texte libre :
            il devient cliquable dans le fil et relie la publication à la
            fiche du lieu. */}
        <PressableScale style={[styles.row, GLASS, place ? styles.rowSet : null]} onPress={() => setPlacePickerOpen(true)} scaleTo={0.98}>
          <IconBubble icon="📍" />
          <Text style={[styles.rowPlaceholder, place ? styles.rowValue : null]} numberOfLines={1}>
            {place ? place.name : t('place_tag_add')}
          </Text>
          {place ? (
            <PressableScale onPress={() => setPlace(null)} hitSlop={12} scaleTo={0.85}>
              <Text style={styles.clear} accessibilityLabel={t('place_tag_remove')}>✕</Text>
            </PressableScale>
          ) : (
            <Text style={styles.chevron}>{CHEVRON}</Text>
          )}
        </PressableScale>
        <PlacePicker
          visible={placePickerOpen}
          onClose={() => setPlacePickerOpen(false)}
          onSelect={setPlace}
        />

        {/* Options */}
        <GlassGroup style={styles.options}>
          <ToggleRow
            icon="💬"
            label={t('postcreate_disable_comments')}
            value={commentsDisabled}
            onValueChange={setCommentsDisabled}
          />
          <ToggleRow
            icon="🤍"
            label={t('postcreate_hide_likes')}
            value={hideLikeCount}
            onValueChange={setHideLikeCount}
          />
        </GlassGroup>

        <View style={styles.bottomActions}>
          <PressableScale
            style={[styles.bottomBtn, GLASS, (!hasMedia || loading) && styles.disabled]}
            disabled={loading || !hasMedia}
            onPress={() => void submit(true)}
            scaleTo={0.96}
          >
            <Text style={styles.draftBtnText} numberOfLines={1}>{t('postcreate_save_draft')}</Text>
          </PressableScale>
          <CrystalButton
            label={t('postcreate_share')}
            loading={loading}
            disabled={loading || !hasMedia}
            onPress={() => void submit()}
            style={styles.bottomBtn}
          />
        </View>
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
      <FeatureTip feature="post_create" />
    </View>
  );
}

/** Bouton serti de cristal (Partager) ; roue de chargement pendant l'envoi. */
function CrystalButton({ label, loading, disabled, onPress, style }: {
  label: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      style={[styles.crystalBtn, style, disabled && !loading && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.95}
    >
      <CrystalFill />
      {loading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <GradientText style={styles.crystalBtnTxt} colors={gradients.crystal} numberOfLines={1}>{label}</GradientText>
      )}
    </PressableScale>
  );
}

/** Deux grandes cases de verre : appareil photo, galerie. */
function MediaChoices({ onCamera, onGallery, galleryEmoji, galleryHint, cameraLabel, galleryLabel }: {
  onCamera: () => void;
  onGallery: () => void;
  galleryEmoji: string;
  galleryHint: string;
  cameraLabel: string;
  galleryLabel: string;
}) {
  return (
    <View style={styles.mediaChoiceRow}>
      <Reveal index={0} style={styles.flex1}>
        <PressableScale style={[styles.mediaChoiceBtn, GLASS]} onPress={onCamera} scaleTo={0.96}>
          <View style={[styles.mediaMedal, GLASS]}><Text style={styles.mediaChoiceEmoji}>📷</Text></View>
          <Text style={styles.mediaChoiceLabel}>{cameraLabel}</Text>
        </PressableScale>
      </Reveal>
      <Reveal index={1} style={styles.flex1}>
        <PressableScale style={[styles.mediaChoiceBtn, GLASS]} onPress={onGallery} scaleTo={0.96}>
          <View style={[styles.mediaMedal, GLASS]}><Text style={styles.mediaChoiceEmoji}>{galleryEmoji}</Text></View>
          <Text style={styles.mediaChoiceLabel}>{galleryLabel}</Text>
          <Text style={styles.mediaChoiceHint}>{galleryHint}</Text>
        </PressableScale>
      </Reveal>
    </View>
  );
}

/** Légende en verre, liseré clair quand elle a le focus. */
function CaptionField({ value, onChangeText, placeholder }: {
  value: string; onChangeText: (v: string) => void; placeholder: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.captionWrap, GLASS, focused && styles.focused]}>
      <TextInput
        style={styles.captionInput}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        multiline
        maxLength={500}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex1: { flex: 1 },
  disabled: { opacity: 0.4 },
  dangerTxt: { color: colors.danger },

  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
  },
  title: { ...typography.heading, fontWeight: '900', color: '#fff', flex: 1, textAlign: 'center' },
  crystalBtn: {
    height: 38, minWidth: 92, paddingHorizontal: 14, borderRadius: radius.pill, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  crystalBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 0.3 },

  modeRow: { marginBottom: spacing.md },

  mediaChoiceRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  mediaChoiceBtn: {
    height: 170, borderRadius: radius.xl,
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  mediaMedal: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  mediaChoiceEmoji: { fontSize: 30 },
  mediaChoiceLabel: { ...typography.body, color: colors.textPrimary, fontWeight: '800' },
  mediaChoiceHint: { ...typography.label, color: colors.textMuted },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md },
  gridItem: { width: '31.9%', aspectRatio: 1 },
  gridImg: { width: '100%', height: '100%', borderRadius: radius.md },
  removeBtn: {
    position: 'absolute', top: 5, end: 5,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.3)',
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
  },
  removeTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  orderBadge: {
    position: 'absolute', start: 5, bottom: 5, overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  coverBadge: { backgroundColor: 'transparent' },
  orderTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  addMore: { width: '31.9%', aspectRatio: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  addMorePlus: { fontSize: 26, color: colors.textSecondary },
  addMoreHint: { ...typography.label, color: colors.textMuted, marginTop: 2 },
  carouselHint: { ...typography.caption, color: colors.textMuted, marginTop: -spacing.xs, marginBottom: spacing.md },

  videoPreviewWrap: { marginBottom: spacing.md },
  videoFrame: {
    borderRadius: radius.xl, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)',
  },
  videoPreview: { width: '100%', aspectRatio: 4 / 5, backgroundColor: colors.surface },
  videoPreviewActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  videoBtn: {
    flex: 1, height: 42, borderRadius: radius.pill, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  videoBtnTxt: { color: colors.textPrimary, fontWeight: '800', fontSize: 13 },
  videoBtnTxtStrong: { color: '#fff', fontWeight: '900', fontSize: 13 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10, minHeight: 58,
    marginBottom: spacing.md,
  },
  rowSet: { borderColor: 'rgba(255,255,255,0.30)' },
  rowPlaceholder: { ...typography.body, color: colors.textMuted, flex: 1, fontWeight: '600' },
  rowValue: { color: colors.textPrimary, fontWeight: '700' },
  chevron: { color: colors.textMuted, fontSize: 20, fontWeight: '700' },
  clear: { ...typography.body, color: colors.textSecondary, paddingHorizontal: 4 },
  musicArtwork: { width: 44, height: 44, borderRadius: radius.sm },
  musicTitle: { ...typography.caption, color: colors.textPrimary, fontWeight: '800' },
  musicArtist: { ...typography.label, color: colors.textMuted, marginTop: 2 },
  smallBtn: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  smallBtnTxt: { ...typography.label, color: colors.textPrimary, fontWeight: '800' },

  editorSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  editorSummaryTxt: {
    ...typography.label, color: colors.textSecondary, fontWeight: '700',
    borderRadius: radius.pill, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5,
  },

  captionWrap: { borderRadius: radius.lg, marginBottom: 4 },
  focused: { borderColor: 'rgba(255,255,255,0.40)' },
  captionInput: {
    padding: spacing.md, color: colors.textPrimary, fontSize: 15,
    minHeight: 110, textAlignVertical: 'top',
  },
  charCount: { ...typography.label, color: colors.textMuted, textAlign: 'right', marginBottom: spacing.md },

  options: { marginBottom: spacing.lg },

  bottomActions: { flexDirection: 'row', gap: spacing.sm },
  bottomBtn: { flex: 1, height: 50, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  draftBtnText: { color: colors.textPrimary, fontWeight: '800', fontSize: 14 },
});
