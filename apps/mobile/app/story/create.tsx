/**
 * CRÉATION D'UNE STORY.
 *
 * Habillage sobre (18/11/2026, « spectaculaire mais simple, peu de couleur ») :
 * fond noir uni, aperçu du média en grand, options regroupées dans deux cartes
 * de verre à interrupteurs. Un seul accent de couleur : le bouton « Publier ».
 *
 * La logique (choix du média, caméra, envoi, stickers sondage / question,
 * lieu, musique, à la une, amis proches) et l'aperçu vidéo `PostVideo` sont
 * inchangés.
 */
import { useState } from 'react';
import {
  Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { feedApi, type StorySticker } from '../../lib/feed-api';
import { colors, radius, spacing } from '../../theme/tokens';
import { API_BASE_URL } from '../../lib/config';
import { MusicPickerModal, type MusicTrack } from '../../components/MusicPicker';
import { PostVideo } from '../../components/PostVideo';
import { PlacePicker, type PickedPlace } from '../../components/PlacePicker';
import { useI18n } from '../../lib/useI18n';
import { PressableScale } from '../../components/ui';
import { CHAT_BG, CHAT_GLASS, GlassCircle } from '../../components/chat/ChatChrome';
import { CHEVRON, GlassGroup, IconBubble, ToggleRow } from '../../components/profile/ProfileChrome';
import { BrandButton } from '../../components/social/SocialChrome';

const API = API_BASE_URL;

export default function CreateStoryScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ uri?: string; mediaType?: string }>();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [uri, setUri] = useState<string | null>(params.uri ?? null);
  const [type, setType] = useState<'photo' | 'video'>(params.mediaType === 'video' ? 'video' : 'photo');
  const [caption, setCaption] = useState('');
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [placePickerOpen, setPlacePickerOpen] = useState(false);
  const [pinToProfile, setPinToProfile] = useState(false);
  const [highlightTitle, setHighlightTitle] = useState('');
  const [loading, setLoading] = useState(false);
  // Enrichissements façon Instagram
  const [closeFriendsOnly, setCloseFriendsOnly] = useState(false);
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptA, setPollOptA] = useState(t('sc_poll_yes'));
  const [pollOptB, setPollOptB] = useState(t('sc_poll_no'));
  const [questionEnabled, setQuestionEnabled] = useState(false);
  const [questionText, setQuestionText] = useState(t('sc_ask_me_prompt'));
  const [selectedMusic, setSelectedMusic] = useState<MusicTrack | null>(null);
  const [musicModalVisible, setMusicModalVisible] = useState(false);

  const openCamera = () => { router.push('/camera?mode=story' as never); };

  const pick = async (mode: 'photo' | 'video') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: mode === 'photo' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
      quality: 0.85,
      videoMaxDuration: 30,
      allowsEditing: true,
      // Cf. post/create.tsx : sans plafond de qualité, une vidéo 4K dépasse la
      // limite d'envoi.
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    });
    if (!result.canceled && result.assets[0]) {
      setUri(result.assets[0].uri);
      setType(mode);
    }
  };

  const publish = async () => {
    if (!uri || !accessToken) { Alert.alert(t('sc_select_media')); return; }
    setLoading(true);
    try {
      const mediaUrl = await feedApi.uploadMedia(accessToken, uri);

      const stickers: StorySticker[] = [];
      if (pollEnabled && pollQuestion.trim()) {
        stickers.push({ kind: 'poll', x: 50, y: 62, question: pollQuestion.trim(), options: [pollOptA.trim() || t('sc_poll_yes'), pollOptB.trim() || t('sc_poll_no')] });
      }
      if (questionEnabled && questionText.trim()) {
        stickers.push({ kind: 'question', x: 50, y: 40, question: questionText.trim() });
      }

      // Appel direct (pas feedApi.createStory) pour remonter l'erreur réelle du
      // serveur au lieu de l'avaler silencieusement — sans ça, un échec de
      // création laissait croire que la story avait été publiée.
      const res = await fetch(`${API}/stories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          mediaUrl,
          type,
          caption: caption.trim() || undefined,
          placeId: place?.id,
          closeFriendsOnly: closeFriendsOnly || undefined,
          stickers: stickers.length ? stickers : undefined,
          musicTrack: selectedMusic ? JSON.stringify(selectedMusic) : undefined,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        Alert.alert(t('sc_error'), t('sc_story_publish_failed').replace('{status}', String(res.status)).replace('{detail}', txt.slice(0, 200)));
        return;
      }

      if (pinToProfile) {
        await feedApi.createHighlight(accessToken, highlightTitle.trim() || t('sc_highlight_default'), [{ mediaUrl, type, caption: caption.trim() || undefined }]);
      }

      router.back();
    } catch (err) {
      Alert.alert(t('sc_error'), err instanceof Error ? err.message : t('sc_publish_failed_generic'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* En-tête : fermer en verre, titre fort, « Publier » — seul accent de couleur. */}
      <View style={styles.header}>
        <GlassCircle onPress={() => router.back()} accessibilityLabel={t('sc_cancel')}>
          <Text style={styles.headerIcon}>✕</Text>
        </GlassCircle>
        <Text style={styles.title} numberOfLines={1}>{t('sc_title')}</Text>
        <BrandButton
          compact
          label={t('sc_publish')}
          onPress={() => void publish()}
          disabled={!uri}
          loading={loading}
          style={styles.publishBtn}
        />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {uri ? (
          <View style={styles.previewWrap}>
            {/* Vrai lecteur pour une vidéo — une <Image> ne sait pas décoder un
                .mp4 (même bug que la grille de profil, corrigé ailleurs) et ne
                permettait aucune prévisualisation réelle avant publication. */}
            {type === 'video'
              ? <PostVideo uri={uri} style={styles.preview} />
              : <Image source={{ uri }} style={styles.preview} />}
            <PressableScale style={styles.changeBtn} onPress={() => setUri(null)} scaleTo={0.94}>
              <Text style={styles.changeTxt}>{t('sc_change')}</Text>
            </PressableScale>
          </View>
        ) : (
          <View style={styles.pickGrid}>
            {/* Caméra — en avant, pleine largeur */}
            <PressableScale style={styles.cameraBox} onPress={openCamera} scaleTo={0.98}>
              <View style={styles.cameraMedal}>
                <Text style={styles.cameraEmoji}>📷</Text>
              </View>
              <Text style={styles.pickLabel}>{t('sc_open_camera')}</Text>
              <Text style={styles.pickHint}>{t('sc_camera_hint')}</Text>
            </PressableScale>
            <View style={styles.pickRow}>
              <PressableScale style={styles.pickBox} onPress={() => void pick('photo')} scaleTo={0.96}>
                <Text style={styles.pickEmoji}>🖼️</Text>
                <Text style={styles.pickLabelSmall}>{t('sc_photo')}</Text>
              </PressableScale>
              <PressableScale style={styles.pickBox} onPress={() => void pick('video')} scaleTo={0.96}>
                <Text style={styles.pickEmoji}>🎬</Text>
                <Text style={styles.pickLabelSmall}>{t('sc_video')}</Text>
              </PressableScale>
            </View>
          </View>
        )}

        <TextInput
          style={styles.caption}
          placeholder={t('sc_caption_placeholder')}
          placeholderTextColor={colors.textMuted}
          value={caption}
          onChangeText={setCaption}
          maxLength={200}
        />

        <GlassGroup style={styles.group}>
          {/* Lieu — rattaché à la base YUMIA plutôt qu'à du texte libre :
              il devient cliquable dans le fil et relie la publication à la
              fiche du lieu. */}
          <Pressable style={styles.row} onPress={() => setPlacePickerOpen(true)}>
            <IconBubble icon="📍" />
            <Text style={[styles.rowLabel, place ? styles.rowLabelSet : null]} numberOfLines={1}>
              {place ? place.name : t('place_tag_add')}
            </Text>
            {place ? (
              <Pressable onPress={() => setPlace(null)} hitSlop={12} accessibilityLabel={t('place_tag_remove')}>
                <Text style={styles.rowClear}>✕</Text>
              </Pressable>
            ) : (
              <Text style={styles.chevron}>{CHEVRON}</Text>
            )}
          </Pressable>

          {/* Musique */}
          {selectedMusic ? (
            <View style={styles.row}>
              <Image source={{ uri: selectedMusic.artworkUrl }} style={styles.musicArtwork} />
              <View style={{ flex: 1 }}>
                <Text style={styles.musicTitle} numberOfLines={1}>{selectedMusic.title}</Text>
                <Text style={styles.musicArtist} numberOfLines={1}>{selectedMusic.artist} · {selectedMusic.durationMs / 1000}s</Text>
              </View>
              <PressableScale onPress={() => setMusicModalVisible(true)} style={styles.musicChangeBtn} scaleTo={0.94}>
                <Text style={styles.musicChangeTxt}>{t('sc_modify')}</Text>
              </PressableScale>
              <Pressable onPress={() => setSelectedMusic(null)} hitSlop={10}>
                <Text style={styles.rowClear}>✕</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.row} onPress={() => setMusicModalVisible(true)}>
              <IconBubble icon="🎵" />
              <Text style={styles.rowLabel} numberOfLines={1}>{t('sc_add_music')}</Text>
              <Text style={styles.chevron}>{CHEVRON}</Text>
            </Pressable>
          )}
        </GlassGroup>

        <PlacePicker
          visible={placePickerOpen}
          onClose={() => setPlacePickerOpen(false)}
          onSelect={setPlace}
        />

        <GlassGroup style={styles.group}>
          {/* À la une */}
          <View>
            <ToggleRow icon="⭐" label={t('sc_pin_title')} sublabel={t('sc_pin_hint')} value={pinToProfile} onValueChange={setPinToProfile} />
            {pinToProfile && (
              <TextInput
                style={styles.innerInput}
                placeholder={t('sc_highlight_name_placeholder')}
                placeholderTextColor={colors.textMuted}
                value={highlightTitle}
                onChangeText={setHighlightTitle}
                maxLength={30}
              />
            )}
          </View>

          {/* Amis proches */}
          <ToggleRow
            icon="👥"
            label={t('sc_close_friends_title')}
            sublabel={t('sc_close_friends_hint')}
            value={closeFriendsOnly}
            onValueChange={setCloseFriendsOnly}
          />

          {/* Sticker sondage */}
          <View>
            <ToggleRow icon="📊" label={t('sc_poll_title')} sublabel={t('sc_poll_hint')} value={pollEnabled} onValueChange={setPollEnabled} />
            {pollEnabled && (
              <View style={styles.innerBlock}>
                <TextInput
                  style={[styles.innerInput, styles.innerInputFlat]}
                  placeholder={t('sc_poll_question_placeholder')}
                  placeholderTextColor={colors.textMuted}
                  value={pollQuestion}
                  onChangeText={setPollQuestion}
                  maxLength={80}
                />
                <View style={styles.innerRow}>
                  <TextInput
                    style={[styles.innerInput, styles.innerInputFlat, { flex: 1 }]}
                    placeholder={t('sc_poll_option_1')}
                    placeholderTextColor={colors.textMuted}
                    value={pollOptA}
                    onChangeText={setPollOptA}
                    maxLength={22}
                  />
                  <TextInput
                    style={[styles.innerInput, styles.innerInputFlat, { flex: 1 }]}
                    placeholder={t('sc_poll_option_2')}
                    placeholderTextColor={colors.textMuted}
                    value={pollOptB}
                    onChangeText={setPollOptB}
                    maxLength={22}
                  />
                </View>
              </View>
            )}
          </View>

          {/* Sticker question */}
          <View>
            <ToggleRow
              icon="❓"
              label={t('sc_question_box_title')}
              sublabel={t('sc_question_box_hint')}
              value={questionEnabled}
              onValueChange={setQuestionEnabled}
            />
            {questionEnabled && (
              <TextInput
                style={styles.innerInput}
                placeholder={t('sc_question_prompt_placeholder')}
                placeholderTextColor={colors.textMuted}
                value={questionText}
                onChangeText={setQuestionText}
                maxLength={80}
              />
            )}
          </View>
        </GlassGroup>
      </ScrollView>

      <MusicPickerModal
        visible={musicModalVisible}
        onClose={() => setMusicModalVisible(false)}
        onSelect={(track) => setSelectedMusic(track)}
        accessToken={accessToken}
      />
    </View>
  );
}

const HAIRLINE = 'rgba(255,255,255,0.14)';
const FIELD_BG = 'rgba(255,255,255,0.05)';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CHAT_BG },

  // En-tête
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  headerIcon: { color: '#fff', fontSize: 16, fontWeight: '800' },
  title: { flex: 1, color: colors.textPrimary, fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  publishBtn: { minWidth: 96 },

  // Aperçu du média
  previewWrap: {
    position: 'relative', borderRadius: radius.xl, overflow: 'hidden', marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE,
  },
  preview: { width: '100%', aspectRatio: 0.7, borderRadius: radius.xl, overflow: 'hidden' },
  changeBtn: {
    position: 'absolute', bottom: 12, end: 12, backgroundColor: 'rgba(10,10,14,0.62)', borderRadius: radius.pill,
    paddingHorizontal: 16, paddingVertical: 9,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)',
  },
  changeTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Choix du média
  pickGrid: { marginBottom: spacing.md, gap: spacing.md },
  cameraBox: {
    height: 168, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: CHAT_GLASS, borderWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE,
  },
  cameraMedal: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4,
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.22)',
  },
  cameraEmoji: { fontSize: 30 },
  pickHint: { fontSize: 12, color: colors.textMuted },
  pickRow: { flexDirection: 'row', gap: spacing.md },
  pickBox: {
    flex: 1, height: 112, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: CHAT_GLASS, borderWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE,
  },
  pickEmoji: { fontSize: 30 },
  pickLabel: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  pickLabelSmall: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },

  // Champs
  caption: {
    backgroundColor: FIELD_BG, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 14,
    color: colors.textPrimary, fontSize: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE,
    marginBottom: spacing.md,
  },
  group: { marginBottom: spacing.md },
  // Même gabarit que les lignes de ProfileChrome (MenuRow / ToggleRow).
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: 12, minHeight: 60,
  },
  rowLabel: { flex: 1, color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  rowLabelSet: { color: colors.textPrimary },
  rowClear: { color: colors.textSecondary, fontSize: 16, paddingHorizontal: 2 },
  chevron: { color: colors.textMuted, fontSize: 22, fontWeight: '300', marginTop: -2 },
  musicArtwork: { width: 44, height: 44, borderRadius: 8 },
  musicTitle: { fontSize: 14, color: colors.textPrimary, fontWeight: '700' },
  musicArtist: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  musicChangeBtn: {
    borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE,
  },
  musicChangeTxt: { fontSize: 12, color: colors.textPrimary, fontWeight: '700' },
  innerBlock: { gap: 8, marginHorizontal: spacing.md, marginBottom: spacing.md },
  innerRow: { flexDirection: 'row', gap: 8 },
  innerInput: {
    marginHorizontal: spacing.md, marginBottom: spacing.md,
    backgroundColor: FIELD_BG, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12,
    color: colors.textPrimary, fontSize: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE,
  },
  // Champs déjà placés dans `innerBlock`, qui porte les marges.
  innerInputFlat: { marginHorizontal: 0, marginBottom: 0 },
});
