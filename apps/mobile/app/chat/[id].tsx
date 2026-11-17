import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Keyboard, Modal, Platform, Pressable,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, RecordingPresets,
  requestRecordingPermissionsAsync, setAudioModeAsync, createAudioPlayer, type AudioPlayer,
} from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuth } from '../../lib/auth-context';
import { encryptMessage, decryptMessage, getLocalPublicKey, isE2EAvailable } from '../../lib/e2e-crypto';
import { colors, elevation, motion, radius, spacing } from '../../theme/tokens';
import {
  BrandFill, CHAT_BG, CHAT_GLASS, CHAT_HAIRLINE, DatePill, GlassCircle, GradientRing, ringInner,
} from '../../components/chat/ChatChrome';
import { API_BASE_URL } from '../../lib/config';
import type { Plan } from '../../lib/feed-api';
import { Avatar, PlanBadgeIcon } from '../../components/Avatar';
import { useI18n } from '../../lib/useI18n';
import { EmojiPicker } from '../../components/chat/EmojiPicker';
import { PhotoViewer } from '../../components/PhotoViewer';
import { isTranslateQuotaError, translateMessage } from '../../lib/chat-translate-api';
import { ensureAiConsent } from '../../lib/ai-consent';
import { SUPPORTED_LOCALES } from '../../lib/locales';
import { haptics } from '../../lib/useHaptics';
import { appendFile } from '../../lib/upload';
import { saveRemoteMediaToGallery } from '../../lib/save-to-gallery';
import type { TranslationKey } from '../../lib/translations';
import { allowOutgoingCall } from '../../lib/outgoing-call';
import { promptReport } from '../../lib/report-content';

const API = API_BASE_URL;
const POLL_INTERVAL = 2000;

/** Fond (uni) de l'en-tête et de la barre de saisie : verre sombre opaque. */
const HEADER_BG = '#101016';
/** Anneau de l'avatar de l'interlocuteur dans l'en-tête. */
const HEADER_RING = 42;
/**
 * Fenêtre pendant laquelle un message qui arrive en bas de liste fait une
 * entrée discrète (glissé + fondu). Seul le DERNIER message est concerné :
 * l'historique, lui, s'affiche d'un bloc, sans animation par bulle.
 */
const FRESH_MS = 8000;

// Mappe la locale interne YUMIA vers un tag Intl pour le formatage date/heure.
const INTL_LOCALE: Record<string, string> = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', pt: 'pt-PT', ar: 'ar-SA' };

interface MessageReaction { messageId: string; userId: string; emoji: string }

interface Message {
  id: string; conversationId: string; senderId: string;
  content: string; type: string; audioUrl?: string; duration?: number;
  mediaUrl?: string | null; durationSec?: number | null;
  replyToId?: string | null;
  replyTo?: { id: string; content: string; senderId: string; type: string } | null;
  reactions?: MessageReaction[];
  sharedPost?: { id: string; mediaUrls: string[]; caption?: string | null; userId: string } | null;
  storyId?: string | null;
  oneTime?: boolean; oneTimeConsumed?: boolean;
  createdAt: string; senderPublicKey?: string;
  // type 'call' extras
  callType?: 'voice' | 'video'; callStatus?: 'missed' | 'answered' | 'declined'; callDuration?: number;
}

const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

interface Partner {
  id: string; displayName: string; photoUrl?: string; e2ePublicKey?: string; plan?: Plan | null;
}

function formatTime(iso: string, locale: string) {
  return new Date(iso).toLocaleTimeString(INTL_LOCALE[locale] ?? 'fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function fmtSec(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function fmtDuration(s: number) {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}min ${s % 60}s`;
}

// ── Bulle vocale ──────────────────────────────────────────────────────────────
function VoiceBubble({ audioUrl, duration, isMe, onLongPress }: { audioUrl: string; duration?: number; isMe: boolean; onLongPress?: () => void }) {
  // `useAudioPlayer` charge la source et libère le lecteur tout seul au
  // démontage (plus besoin d'unloadAsync manuel comme avec expo-av).
  const player = useAudioPlayer(audioUrl);
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  const pos = Math.floor(status.currentTime ?? 0);
  const total = Math.floor(status.duration || duration || 0);

  // Revient au début une fois la lecture terminée, pour pouvoir la relancer.
  useEffect(() => {
    if (status.didJustFinish) void player.seekTo(0);
  }, [status.didJustFinish, player]);

  const toggle = () => {
    if (playing) { player.pause(); return; }
    if (status.didJustFinish) void player.seekTo(0);
    player.play();
  };
  const progress = total > 0 ? pos / total : 0;

  return (
    <Pressable onPress={toggle} onLongPress={onLongPress} style={[styles.voiceBubble, isMe ? styles.voiceBubbleMe : styles.voiceBubbleOther]}>
      {isMe ? <BrandFill /> : null}
      <Text style={[styles.voicePlayIcon, isMe && { color: '#fff' }]}>{playing ? '⏸' : '▶'}</Text>
      <View style={styles.voiceWave}>
        <View style={[styles.voiceTrack, { backgroundColor: isMe ? 'rgba(255,255,255,0.25)' : colors.border }]}>
          <View style={[styles.voiceFill, { width: `${progress * 100}%`, backgroundColor: isMe ? '#fff' : colors.brand }]} />
        </View>
      </View>
      <Text style={[styles.voiceTime, isMe && { color: 'rgba(255,255,255,0.75)' }]}>{fmtSec(playing ? pos : total)}</Text>
    </Pressable>
  );
}

// ── Bulle vidéo (lecture inline, tap pour play/pause) ──────────────────────────
function VideoBubble({ url, onLongPress }: { url: string; onLongPress?: () => void }) {
  const [playing, setPlaying] = useState(false);
  const player = useVideoPlayer(url, (p) => { p.loop = true; });

  const toggle = () => {
    if (playing) { player.pause(); setPlaying(false); }
    else { player.play(); setPlaying(true); }
  };

  return (
    <Pressable onPress={toggle} onLongPress={onLongPress} style={styles.mediaBubble}>
      <VideoView player={player} style={styles.mediaContent} contentFit="cover" nativeControls={false} />
      {!playing && (
        <View style={styles.mediaPlayOverlay} pointerEvents="none">
          <Text style={{ fontSize: 28, color: '#fff' }}>▶</Text>
        </View>
      )}
    </Pressable>
  );
}

// ── Bulle d'événement d'appel ─────────────────────────────────────────────────
function CallEventBubble({ msg, onCallback }: { msg: Message; onCallback: () => void }) {
  const { t, locale } = useI18n();
  const isMissed = msg.callStatus === 'missed';
  const icon = msg.callType === 'video' ? '📹' : '📞';
  const typeLabel = msg.callType === 'video' ? t('chat_call_video') : t('chat_call_voice');
  const label = isMissed
    ? t('chat_call_missed').replace('{type}', typeLabel)
    : t('chat_call_with_duration').replace('{type}', typeLabel).replace('{duration}', fmtDuration(msg.callDuration ?? 0));

  return (
    <View style={styles.callEvent}>
      <View style={styles.callEventRow}>
        <View style={[styles.callIconBox, isMissed && styles.callIconBoxMissed]}>
          <Text style={{ fontSize: 18 }}>{icon}</Text>
          {isMissed && <View style={styles.missedArrow}><Text style={{ color: '#E5484D', fontSize: 14 }}>↙</Text></View>}
        </View>
        {/* flexShrink et non flex: 1 — la bulle n'a pas de largeur fixe, un
            flex: 1 y réduisait le texte à zéro (une lettre par ligne). */}
        <View style={{ flexShrink: 1 }}>
          <Text style={[styles.callEventLabel, isMissed && styles.callEventLabelMissed]}>{label}</Text>
          <Text style={styles.callEventTime}>{formatTime(msg.createdAt, locale)}</Text>
        </View>
      </View>
      {isMissed && (
        <Pressable style={styles.callbackBtn} onPress={onCallback}>
          <BrandFill />
          <Text style={styles.callbackBtnTxt}>{t('chat_callback')}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
/** Durées proposées pour les messages éphémères — `null` = désactivé. */
const EPHEMERAL_OPTIONS: Array<number | null> = [null, 3600, 86400, 7 * 86400];

/** « 1 heure », « 24 heures », « 7 jours » — traduit. */
function ephemeralLabel(t: (k: TranslationKey) => string, ttlSec: number): string {
  if (ttlSec >= 86400) {
    const days = Math.round(ttlSec / 86400);
    return `${days} ${days > 1 ? t('chat_ephemeral_days') : t('chat_ephemeral_day')}`;
  }
  const hours = Math.max(1, Math.round(ttlSec / 3600));
  return `${hours} ${hours > 1 ? t('chat_ephemeral_hours') : t('chat_ephemeral_hour')}`;
}

export default function ChatRoomScreen() {
  const { id: convId } = useLocalSearchParams<{ id: string }>();
  const { accessToken, user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();

  const [messages, setMessages] = useState<Message[]>([]);
  const [decrypted, setDecrypted] = useState<Map<string, string>>(new Map());
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [actionMsg, setActionMsg] = useState<Message | null>(null); // appui long → réactions/répondre
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  // Extrait enregistré en attente d'écoute/envoi (façon Snap : on peut le
  // réécouter et le jeter avant de l'envoyer réellement).
  const [voicePreview, setVoicePreview] = useState<{ uri: string; duration: number } | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [partner, setPartner] = useState<Partner | null>(null);
  // Messages éphémères : durée de vie en secondes, `null` = désactivé. Réglage
  // de la CONVERSATION, donc partagé avec l'interlocuteur.
  const [ephemeralTtl, setEphemeralTtl] = useState<number | null>(null);
  const [showEphemeral, setShowEphemeral] = useState(false);
  const [e2eActive, setE2eActive] = useState(false);
  // ── Clavier nouvelle génération : emojis, pièces jointes, traduction ──────
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttachSheet, setShowAttachSheet] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [translations, setTranslations] = useState<Map<string, string>>(new Map());
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [viewerPhotos, setViewerPhotos] = useState<string[] | null>(null);
  // Traduction de CE QUE J'ÉCRIS avant envoi : langue cible choisie une fois,
  // réutilisée tant qu'on ne la change pas (appui long pour la changer).
  const [translateTarget, setTranslateTarget] = useState<string | null>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [translatingInput, setTranslatingInput] = useState(false);

  // Le recorder doit être un hook au niveau du composant (pas créé à la
  // demande comme avec expo-av) — voir startVoice/stopVoiceToPreview.
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const listRef = useRef<FlatList>(null);
  const lastMsgDate = useRef<string>(new Date(0).toISOString());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewSoundRef = useRef<AudioPlayer | null>(null);

  // ─── Chargement du partenaire ────────────────────────────────────────────
  const loadPartner = useCallback(async () => {
    if (!accessToken || !convId) return;
    try {
      const res = await fetch(`${API}/chat/conversations/${convId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return;
      const data = await res.json() as {
        participants?: Partner[]; partner?: Partner; ephemeralTtlSec?: number | null;
      };
      const p = data.partner ?? data.participants?.find((u) => u.id !== user?.id) ?? null;
      setPartner(p);
      setEphemeralTtl(data.ephemeralTtlSec ?? null);
      if (p?.e2ePublicKey && isE2EAvailable()) setE2eActive(true);
    } catch { /* silencieux */ }
  }, [accessToken, convId, user?.id]);

  // ─── Déchiffrement d'un batch de messages ────────────────────────────────
  const decryptBatch = useCallback(async (msgs: Message[]) => {
    if (!isE2EAvailable()) return;
    const updates = new Map<string, string>();
    for (const m of msgs) {
      if (m.type === 'encrypted' && m.senderPublicKey) {
        try {
          const plain = await decryptMessage(m.content, m.senderPublicKey);
          updates.set(m.id, plain);
        } catch { updates.set(m.id, t('chat_encrypted_fallback')); }
      }
    }
    if (updates.size > 0) setDecrypted((prev) => new Map([...prev, ...updates]));
  }, [t]);

  // ─── Chargement de l'historique ──────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!accessToken || !convId) return;
    const res = await fetch(`${API}/chat/conversations/${convId}/messages?limit=80`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const msgs: Message[] = await res.json();
      setMessages(msgs);
      if (msgs.length) lastMsgDate.current = msgs[msgs.length - 1].createdAt;
      void decryptBatch(msgs);
    }
  }, [accessToken, convId, decryptBatch]);

  const poll = useCallback(async () => {
    if (!accessToken || !convId) return;
    const res = await fetch(
      `${API}/chat/conversations/${convId}/messages/poll?after=${encodeURIComponent(lastMsgDate.current)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (res.ok) {
      const newMsgs: Message[] = await res.json();
      if (newMsgs.length) {
        setMessages((prev) => [...prev, ...newMsgs]);
        lastMsgDate.current = newMsgs[newMsgs.length - 1].createdAt;
        void decryptBatch(newMsgs);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
        // Vibration légère à la réception — uniquement pour les messages du
        // partenaire (pas les nôtres, déjà affichés en optimiste ailleurs).
        if (newMsgs.some((m) => m.senderId !== user?.id)) haptics.light();
      }
    }
  }, [accessToken, convId, decryptBatch, user?.id]);

  useEffect(() => {
    void loadPartner();
    void loadHistory().then(() => setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100));
    pollRef.current = setInterval(() => void poll(), POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadHistory, loadPartner, poll]);

  // Coupe l'écoute de l'extrait vocal en attente si on quitte l'écran.
  useEffect(() => () => { previewSoundRef.current?.remove(); }, []);

  // ── Hauteur réellement occupée par le clavier ───────────────────────────────
  // La fenêtre de l'app ne se redimensionne pas sur cet appareil (mode
  // "pan", pas "resize") — `useWindowDimensions` ne bouge donc jamais avec le
  // clavier, inutile ici. On mesure donc par événement.
  //
  // Sur iOS, une fermeture du clavier par GESTE (glisser vers le bas,
  // fermeture "interactive") ne déclenche pas forcément "keyboardWillHide" de
  // façon fiable — la barre restait alors coincée en position haute. On
  // écoute donc EN PLUS "keyboardWillChangeFrame" (iOS uniquement : Android
  // n'a que Show/Hide), qui suit la hauteur en continu pendant TOUTE
  // animation du clavier, geste inclus, et retombe donc bien à 0 à la fin.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const applyHeight = (e: { endCoordinates?: { height?: number } }) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    };
    const showSub = Keyboard.addListener(showEvt, applyHeight);
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    const frameSub = Platform.OS === 'ios' ? Keyboard.addListener('keyboardWillChangeFrame', applyHeight) : null;
    return () => { showSub.remove(); hideSub.remove(); frameSub?.remove(); };
  }, []);

  // ─── Envoi de message (chiffré si possible) ───────────────────────────────
  const send = async () => {
    if (!input.trim() || sending || !accessToken || !convId) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    try {
      let content = text;
      let type = 'text';
      let senderPublicKey: string | undefined;

      if (e2eActive && partner?.e2ePublicKey) {
        try {
          content = await encryptMessage(text, partner.e2ePublicKey);
          senderPublicKey = await getLocalPublicKey();
          type = 'encrypted';
        } catch { /* chiffrement échoué → plaintext */ }
      }

      const res = await fetch(`${API}/chat/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ content, type, senderPublicKey, replyToId: replyTo?.id }),
      });
      if (res.ok) {
        const msg: Message = await res.json();
        // Ajouter en clair localement (pas besoin de déchiffrer ce qu'on vient d'envoyer)
        const displayed = { ...msg, content: text };
        setMessages((prev) => [...prev, displayed]);
        if (type === 'encrypted') setDecrypted((prev) => new Map([...prev, [msg.id, text]]));
        lastMsgDate.current = msg.createdAt;
        setReplyTo(null);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
      }
    } finally {
      setSending(false);
    }
  };

  // ─── Photo / vidéo, depuis la galerie ou l'appareil photo ──────────────────
  //
  // L'appareil photo est celui du système, pas l'écran caméra de l'app : ce
  // dernier sert à PUBLIER (post, story, reel) et proposait donc une
  // publication alors qu'on voulait envoyer l'image à son interlocuteur.
  const pickAndSendMedia = async (kind: 'image' | 'video', source: 'library' | 'camera' = 'library') => {
    setShowAttachSheet(false);
    if (!accessToken || !convId) return;
    let result: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.85,
        videoMaxDuration: 60,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      });
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: kind === 'image' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
        quality: 0.85,
        videoMaxDuration: 60,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      });
    }
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    // Depuis l'appareil photo, le genre dépend de ce qui a été capturé.
    if (source === 'camera') kind = asset.type === 'video' ? 'video' : 'image';

    setUploadingMedia(true);
    try {
      const form = new FormData();
      appendFile(form, 'file', asset.uri);
      const up = await fetch(`${API}/posts/upload`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form });
      if (!up.ok) { Alert.alert(t('chat_delete_error_title'), t('chat_upload_error')); return; }
      const { url } = await up.json() as { url: string };

      const res = await fetch(`${API}/chat/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          content: kind === 'image' ? t('chat_image_message') : t('chat_video_message'),
          type: kind,
          mediaUrl: url,
          replyToId: replyTo?.id,
        }),
      });
      if (res.ok) {
        const msg: Message = await res.json();
        setMessages((prev) => [...prev, msg]);
        lastMsgDate.current = msg.createdAt;
        setReplyTo(null);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
      } else {
        Alert.alert(t('chat_delete_error_title'), t('chat_upload_error'));
      }
    } catch {
      Alert.alert(t('chat_delete_error_title'), t('chat_upload_error'));
    } finally {
      setUploadingMedia(false);
    }
  };

  // ─── Traduction à la demande ────────────────────────────────────────────
  const handleTranslate = async (msg: Message) => {
    setActionMsg(null);
    if (!accessToken) return;
    if (translations.has(msg.id)) {
      // Toggle : si déjà traduit, on masque en effaçant l'entrée.
      setTranslations((prev) => { const next = new Map(prev); next.delete(msg.id); return next; });
      return;
    }
    // Traduction par Claude (Anthropic) : accord explicite d'abord.
    if (!(await ensureAiConsent())) return;
    setTranslatingId(msg.id);
    try {
      const { translated } = await translateMessage(accessToken, getDisplayContent(msg), locale, 'message');
      setTranslations((prev) => new Map(prev).set(msg.id, translated));
    } catch (err) {
      Alert.alert(t('chat_delete_error_title'), t(isTranslateQuotaError(err) ? 'translate_quota_reached' : 'chat_translate_error'));
    } finally {
      setTranslatingId(null);
    }
  };

  // ─── Traduction de ce que J'ÉCRIS, avant envoi ─────────────────────────────
  const translateInputTo = async (code: string) => {
    if (!input.trim() || !accessToken) return;
    if (!(await ensureAiConsent())) return;
    setTranslatingInput(true);
    try {
      const { translated } = await translateMessage(accessToken, input, code, 'message');
      setInput(translated);
    } catch (err) {
      Alert.alert(t('chat_delete_error_title'), t(isTranslateQuotaError(err) ? 'translate_quota_reached' : 'chat_translate_error'));
    } finally {
      setTranslatingInput(false);
    }
  };

  /** Tap sur le bouton 🌐 : traduit avec la langue déjà choisie, ou ouvre le choix si aucune. */
  const handleTranslateInput = () => {
    if (!input.trim()) return;
    if (!translateTarget) { setShowLangPicker(true); return; }
    void translateInputTo(translateTarget);
  };

  /** Choix (ou changement, via appui long sur 🌐) de la langue cible. */
  const chooseTranslateTarget = (code: string) => {
    setTranslateTarget(code);
    setShowLangPicker(false);
    if (input.trim()) void translateInputTo(code);
  };

  // ─── Vocal ────────────────────────────────────────────────────────────────
  const startVoice = async () => {
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) return;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setIsRecordingVoice(true);
    setRecordingSeconds(0);
    recTimerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
  };

  /** Arrête l'enregistrement et passe en écran de prévisualisation (pas d'envoi direct). */
  const stopVoiceToPreview = async () => {
    if (!recorder.isRecording) return;
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    setIsRecordingVoice(false);
    const dur = recordingSeconds;
    setRecordingSeconds(0);
    await recorder.stop();
    const uri = recorder.uri;
    if (uri) setVoicePreview({ uri, duration: dur });
    // Retour en session de LECTURE : sans ça, iOS reste en « lecture +
    // enregistrement » et tout le son de l'app (fil, reels, stories) devient
    // quasi inaudible jusqu'au redémarrage.
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
  };

  const cancelVoice = async () => {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    if (recorder.isRecording) await recorder.stop();
    setIsRecordingVoice(false);
    setRecordingSeconds(0);
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
  };

  /** Rejoue/pause l'extrait en attente d'envoi. */
  const togglePreviewPlayback = async () => {
    if (!voicePreview) return;
    if (previewSoundRef.current) {
      if (previewPlaying) {
        previewSoundRef.current.pause();
        setPreviewPlaying(false);
      } else {
        await previewSoundRef.current.seekTo(0);
        previewSoundRef.current.play();
        setPreviewPlaying(true);
      }
      return;
    }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    const player = createAudioPlayer(voicePreview.uri);
    previewSoundRef.current = player;
    player.addListener('playbackStatusUpdate', (st) => {
      if (st.didJustFinish) setPreviewPlaying(false);
    });
    player.play();
    setPreviewPlaying(true);
  };

  const stopPreviewSound = async () => {
    if (previewSoundRef.current) {
      previewSoundRef.current.pause();
      previewSoundRef.current.remove();
      previewSoundRef.current = null;
    }
    setPreviewPlaying(false);
  };

  /** Jette l'extrait enregistré sans l'envoyer. */
  const discardVoicePreview = async () => {
    await stopPreviewSound();
    setVoicePreview(null);
  };

  /** Envoie réellement l'extrait prévisualisé. */
  const confirmSendVoice = async () => {
    if (!voicePreview || !accessToken || !convId) return;
    await stopPreviewSound();
    const { uri, duration: dur } = voicePreview;
    setVoicePreview(null);
    setSending(true);
    try {
      const form = new FormData();
      appendFile(form, 'file', uri);
      const up = await fetch(`${API}/posts/upload`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form });
      if (!up.ok) return;
      const { url } = await up.json() as { url: string };
      const res = await fetch(`${API}/chat/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ content: t('chat_voice_message'), type: 'audio', audioUrl: url, duration: dur }),
      });
      if (res.ok) {
        const msg: Message = await res.json();
        setMessages((prev) => [...prev, msg]);
        lastMsgDate.current = msg.createdAt;
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
      }
    } finally { setSending(false); }
  };

  // ─── Appel ────────────────────────────────────────────────────────────────
  const startCall = (type: 'voice' | 'video') => {
    if (!partner) return;
    allowOutgoingCall(convId, partner.id);
    router.push(`/call?convId=${convId}&partnerId=${partner.id}&partnerName=${encodeURIComponent(partner.displayName)}&partnerPhoto=${encodeURIComponent(partner.photoUrl ?? '')}&type=${type}` as never);
  };

  const callback = () => startCall('voice');

  const myId = user?.id ?? '';

  const getDisplayContent = (msg: Message) => {
    if (msg.type === 'encrypted') return decrypted.get(msg.id) ?? '🔒';
    return msg.content;
  };

  // ─── Réaction emoji (appui long → choisir) ────────────────────────────────
  const react = async (msg: Message, emoji: string) => {
    setActionMsg(null);
    if (!accessToken) return;
    const res = await fetch(`${API}/chat/messages/${msg.id}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ emoji }),
    });
    if (res.ok) {
      const { reactions } = await res.json() as { reactions: MessageReaction[] };
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, reactions } : m));
    }
  };

  // ─── Suppression (réservée à ses propres messages) ─────────────────────────
  const deleteMessage = async (msg: Message) => {
    setActionMsg(null);
    if (!accessToken) return;
    const res = await fetch(`${API}/chat/messages/${msg.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    } else {
      Alert.alert(t('chat_delete_error_title'), t('chat_delete_error_body'));
    }
  };

  /**
   * Active, change ou désactive les messages éphémères.
   *
   * Ne touche que les messages À VENIR : ceux déjà envoyés gardent la règle en
   * vigueur au moment de leur envoi (côté serveur, l'échéance est posée à
   * l'envoi). Désactiver ne ressuscite donc rien.
   */
  const applyEphemeral = async (ttlSec: number | null) => {
    if (!accessToken || !convId) return;
    setShowEphemeral(false);
    const previous = ephemeralTtl;
    setEphemeralTtl(ttlSec);
    try {
      const res = await fetch(`${API}/chat/conversations/${convId}/ephemeral`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ ttlSec }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setEphemeralTtl(previous);
      Alert.alert(t('chat_delete_error_title'), t('chat_ephemeral_error'));
    }
  };

  /** Agrège les réactions d'un message : { '❤️': 2, '😂': 1 } */
  const reactionSummary = (msg: Message) => {
    const counts = new Map<string, number>();
    for (const r of msg.reactions ?? []) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
    return [...counts.entries()];
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      {/* En-tête en verre : retour, interlocuteur (anneau de marque), appels. */}
      <View style={styles.header}>
        <GlassCircle onPress={() => router.back()} size={38}>
          <Text style={styles.backTxt}>←</Text>
        </GlassCircle>

        <Pressable style={styles.partnerInfo} onPress={() => partner && router.push(`/user/${partner.id}` as never)}>
          <GradientRing size={HEADER_RING} active ring={2} background={HEADER_BG}>
            <Avatar
              uri={partner?.photoUrl}
              size={ringInner(HEADER_RING, 2, 1.5)}
              placeholderColor={colors.surfaceElevated}
              fallback={
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                  {(partner?.displayName ?? '?')[0].toUpperCase()}
                </Text>
              }
            />
          </GradientRing>
          <View style={{ flexShrink: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.partnerName} numberOfLines={1}>{partner?.displayName ?? '...'}</Text>
              <PlanBadgeIcon plan={partner?.plan} size={16} />
            </View>
            {e2eActive && <Text style={styles.encLabel}>{t('chat_encrypted_badge')}</Text>}
          </View>
        </Pressable>

        <View style={styles.headerActions}>
          <GlassCircle onPress={() => startCall('voice')} size={38}>
            <Text style={styles.headerActionIcon}>📞</Text>
          </GlassCircle>
          <GlassCircle onPress={() => startCall('video')} size={38}>
            <Text style={styles.headerActionIcon}>📹</Text>
          </GlassCircle>
          {/* Messages éphémères — actif = sablier plein sur pastille de marque. */}
          <GlassCircle
            onPress={() => setShowEphemeral(true)}
            size={38}
            active={!!ephemeralTtl}
            accessibilityLabel={t('chat_ephemeral_title')}
          >
            <Text style={styles.headerActionIcon}>{ephemeralTtl ? '⏳' : '⌛'}</Text>
          </GlassCircle>
        </View>
      </View>

      {ephemeralTtl ? (
        <Pressable style={styles.ephemeralBanner} onPress={() => setShowEphemeral(true)}>
          <Text style={styles.ephemeralBannerTxt}>
            ⏳ {t('chat_ephemeral_on').replace('{duration}', ephemeralLabel(t, ephemeralTtl))}
          </Text>
        </Pressable>
      ) : null}

      {/* ── Messages ────────────────────────────────────────────────────────── */}
      {/* Padding mesuré par événement plutôt que KeyboardAvoidingView natif —
          plus fiable avec les claviers tiers munis d'un panneau additionnel
          (voir commentaire sur keyboardHeight). Fonctionne identiquement sur
          les deux plateformes puisqu'on mesure nous-mêmes la hauteur réelle. */}
      <View style={{ flex: 1, paddingBottom: keyboardHeight }}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.messageList}
          renderItem={({ item, index }) => {
            const isMe = item.senderId === myId;
            const prev = messages[index - 1];
            const showDate = !prev || new Date(item.createdAt).toDateString() !== new Date(prev.createdAt).toDateString();
            // Le backend renvoie l'URL dans `mediaUrl` (l'alias `audioUrl` n'est
            // présent que sur le message optimiste local) → tester les deux, sinon
            // le vocal qu'on vient d'envoyer s'affiche en bulle texte non lisible.
            const isAudio = item.type === 'audio' && (item.audioUrl || item.mediaUrl);
            const isImage = item.type === 'image' && item.mediaUrl;
            const isVideo = item.type === 'video' && item.mediaUrl;
            const isCall = item.type === 'call';
            const isEnc = item.type === 'encrypted';
            const translation = translations.get(item.id);
            // Entrée discrète réservée au message qui vient d'arriver en bas
            // de liste (envoyé ou reçu) : jamais sur l'historique, pour qu'une
            // longue conversation s'ouvre et défile sans saccade.
            const fresh = index === messages.length - 1
              && Date.now() - new Date(item.createdAt).getTime() < FRESH_MS;
            const entering = fresh ? FadeInDown.duration(motion.duration.fast) : undefined;

            return (
              <>
                {showDate && (
                  <DatePill
                    label={new Date(item.createdAt).toLocaleDateString(INTL_LOCALE[locale] ?? 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}
                  />
                )}
                {isCall ? (
                  <Animated.View entering={entering} style={[styles.msgRow, isMe && styles.msgRowMe]}>
                    {isMe && <View style={styles.meBar} />}
                    <CallEventBubble msg={item} onCallback={callback} />
                  </Animated.View>
                ) : (
                  <Animated.View entering={entering} style={[styles.msgRow, isMe && styles.msgRowMe]}>
                    {isAudio ? (
                      <VoiceBubble
                        audioUrl={(item.audioUrl ?? item.mediaUrl)!}
                        duration={item.duration ?? item.durationSec ?? undefined}
                        isMe={isMe}
                        onLongPress={() => setActionMsg(item)}
                      />
                    ) : isImage ? (
                      <Pressable
                        style={styles.mediaBubble}
                        onPress={() => setViewerPhotos([item.mediaUrl!])}
                        onLongPress={() => setActionMsg(item)}
                      >
                        <Image source={{ uri: item.mediaUrl! }} style={styles.mediaContent} />
                      </Pressable>
                    ) : isVideo ? (
                      <VideoBubble url={item.mediaUrl!} onLongPress={() => setActionMsg(item)} />
                    ) : (
                      <Pressable
                        onLongPress={() => setActionMsg(item)}
                        style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}
                      >
                        {/* Mes bulles : dégradé de marque ; les siennes : verre sombre. */}
                        {isMe ? <BrandFill /> : null}
                        {/* Message cité (réponse) */}
                        {item.replyTo ? (
                          <View style={[styles.quoteBox, isMe && styles.quoteBoxMe]}>
                            <Text style={[styles.quoteTxt, isMe && { color: 'rgba(255,255,255,0.8)' }]} numberOfLines={1}>
                              ↩︎ {item.replyTo.content}
                            </Text>
                          </View>
                        ) : null}

                        {/* Réponse à une story → vignette */}
                        {item.type === 'story_reply' && item.mediaUrl ? (
                          <View style={{ marginBottom: 6 }}>
                            <Text style={[styles.storyReplyLabel, isMe && { color: 'rgba(255,255,255,0.75)' }]}>
                              {isMe ? t('chat_story_reply_mine') : t('chat_story_reply_theirs')}
                            </Text>
                            <Image source={{ uri: item.mediaUrl }} style={styles.storyReplyThumb} />
                          </View>
                        ) : null}

                        {/* Post partagé → carte cliquable */}
                        {item.sharedPost ? (
                          <Pressable
                            style={styles.sharedPostCard}
                            onPress={() => router.push(`/post/${item.sharedPost!.id}` as never)}
                          >
                            {item.sharedPost.mediaUrls[0] ? (
                              <Image source={{ uri: item.sharedPost.mediaUrls[0] }} style={styles.sharedPostImg} />
                            ) : null}
                            {item.sharedPost.caption ? (
                              <Text style={styles.sharedPostCaption} numberOfLines={2}>{item.sharedPost.caption}</Text>
                            ) : null}
                          </Pressable>
                        ) : null}

                        <Text style={[styles.bubbleTxt, isMe && styles.bubbleTxtMe]}>
                          {getDisplayContent(item)}
                        </Text>
                        {translatingId === item.id ? (
                          <Text style={[styles.translationTxt, isMe && styles.translationTxtMe]}>
                            {t('chat_translate_loading')}
                          </Text>
                        ) : translation ? (
                          <View style={[styles.translationBox, isMe && styles.translationBoxMe]}>
                            <Text style={[styles.translationLabel, isMe && { color: 'rgba(255,255,255,0.6)' }]}>
                              {t('chat_translated_label')}
                            </Text>
                            <Text style={[styles.translationTxt, isMe && styles.translationTxtMe]}>
                              {translation}
                            </Text>
                          </View>
                        ) : null}
                        <View style={styles.bubbleFooter}>
                          {(isEnc) && <Text style={[styles.encIcon, isMe && { color: 'rgba(255,255,255,0.5)' }]}>🔐</Text>}
                          <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>{formatTime(item.createdAt, locale)}</Text>
                        </View>

                        {/* Réactions */}
                        {(item.reactions?.length ?? 0) > 0 && (
                          <View style={[styles.reactionsRow, isMe && { alignSelf: 'flex-start' }]}>
                            {reactionSummary(item).map(([emoji, count]) => (
                              <Text key={emoji} style={styles.reactionChip}>{emoji}{count > 1 ? ` ${count}` : ''}</Text>
                            ))}
                          </View>
                        )}
                      </Pressable>
                    )}
                  </Animated.View>
                )}
              </>
            );
          }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />

        {/* ── Barre d'enregistrement vocal ────────────────────────────────── */}
        {isRecordingVoice ? (
          <View style={[styles.voiceBar, { paddingBottom: keyboardHeight > 0 ? 8 : insets.bottom + 8 }]}>
            <Pressable style={styles.voiceCancelBtn} onPress={cancelVoice}>
              <Text style={styles.voiceCancelTxt}>✕</Text>
            </Pressable>
            <View style={styles.voiceIndicator}>
              <View style={styles.voiceRecDot} />
              <Text style={styles.voiceRecTime}>{fmtSec(recordingSeconds)}</Text>
              <Text style={styles.voiceRecLabel}>{t('chat_recording_label')}</Text>
            </View>
            {/* Arrête l'enregistrement et passe en écoute avant envoi (pas d'envoi direct). */}
            <Pressable style={styles.voiceSendBtn} onPress={() => void stopVoiceToPreview()}>
              <BrandFill />
              <Text style={{ fontSize: 20, color: '#fff' }}>⏹</Text>
            </Pressable>
          </View>
        ) : voicePreview ? (
          /* ── Prévisualisation avant envoi (façon Snapchat) ────────────────── */
          <View style={[styles.voiceBar, { paddingBottom: keyboardHeight > 0 ? 8 : insets.bottom + 8 }]}>
            <Pressable style={styles.voiceCancelBtn} onPress={() => void discardVoicePreview()}>
              <Text style={styles.voiceCancelTxt}>🗑️</Text>
            </Pressable>
            <Pressable style={styles.voiceIndicator} onPress={() => void togglePreviewPlayback()}>
              <Text style={{ fontSize: 18 }}>{previewPlaying ? '⏸' : '▶️'}</Text>
              <Text style={styles.voiceRecTime}>{fmtSec(voicePreview.duration)}</Text>
              <Text style={styles.voiceRecLabel}>{previewPlaying ? t('chat_playing_label') : t('chat_listen_label')}</Text>
            </Pressable>
            <Pressable style={styles.voiceSendBtn} onPress={() => void confirmSendVoice()} disabled={sending}>
              <BrandFill />
              {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ fontSize: 22, color: '#fff' }}>↑</Text>}
            </Pressable>
          </View>
        ) : (
          /* ── Barre de saisie ──────────────────────────────────────────── */
          <View>
            {replyTo ? (
              <View style={styles.replyBanner}>
                <Text style={styles.replyBannerTxt} numberOfLines={1}>
                  {t('chat_reply_to_prefix')} {
                    replyTo.type === 'audio' ? t('chat_voice_message')
                    : replyTo.type === 'image' ? t('chat_image_message')
                    : replyTo.type === 'video' ? t('chat_video_message')
                    : getDisplayContent(replyTo)
                  }
                </Text>
                <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                  <Text style={{ color: colors.textMuted, fontSize: 15 }}>✕</Text>
                </Pressable>
              </View>
            ) : null}
          <View style={[styles.inputRow, { paddingBottom: keyboardHeight > 0 ? 8 : insets.bottom + 8 }]}>
            <Pressable
              style={styles.inputIconBtn}
              onPress={() => { Keyboard.dismiss(); setShowEmoji(false); setShowAttachSheet(true); }}
            >
              {uploadingMedia ? <ActivityIndicator color={colors.brand} size="small" /> : <Text style={{ fontSize: 24 }}>➕</Text>}
            </Pressable>
            <View style={styles.inputPill}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                onFocus={() => setShowEmoji(false)}
                placeholder={e2eActive ? t('chat_encrypted_placeholder') : t('chat_placeholder')}
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={1000}
              />
              <Pressable
                style={styles.emojiToggleBtn}
                onPress={handleTranslateInput}
                onLongPress={() => { Keyboard.dismiss(); setShowEmoji(false); setShowLangPicker(true); }}
                disabled={translatingInput}
              >
                {translatingInput ? (
                  <ActivityIndicator color={colors.brand} size="small" />
                ) : (
                  <Text style={{ fontSize: 18 }}>
                    {translateTarget ? (SUPPORTED_LOCALES.find((l) => l.code === translateTarget)?.flag ?? '🌐') : '🌐'}
                  </Text>
                )}
              </Pressable>
              <Pressable
                style={styles.emojiToggleBtn}
                onPress={() => { Keyboard.dismiss(); setShowAttachSheet(false); setShowEmoji((v) => !v); }}
              >
                <Text style={{ fontSize: 20 }}>{showEmoji ? '⌨️' : '🙂'}</Text>
              </Pressable>
            </View>
            {input.trim() ? (
              <Pressable style={[styles.sendBtn, sending && styles.sendBtnDisabled]} onPress={send}>
                <BrandFill />
                <Text style={styles.sendIcon}>↑</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.micBtn} onPressIn={startVoice}>
                <Text style={{ fontSize: 22 }}>🎤</Text>
              </Pressable>
            )}
          </View>
          {showEmoji ? (
            <EmojiPicker onSelect={(emoji) => setInput((prev) => prev + emoji)} />
          ) : null}
          </View>
        )}
      </View>

      {/* ── Photo/vidéo plein écran ─────────────────────────────────────────── */}
      {viewerPhotos ? (
        <PhotoViewer photos={viewerPhotos} visible onClose={() => setViewerPhotos(null)} />
      ) : null}

      {/* ── Feuille "+" : pièces jointes ────────────────────────────────────── */}
      <Modal visible={showAttachSheet} transparent animationType="fade" onRequestClose={() => setShowAttachSheet(false)}>
        <Pressable style={styles.actionOverlay} onPress={() => setShowAttachSheet(false)}>
          <View style={styles.attachSheet}>
            <Text style={styles.attachTitle}>{t('chat_attach_title')}</Text>
            <Pressable
              style={styles.attachRow}
              onPress={() => void pickAndSendMedia('image', 'camera')}
            >
              <View style={styles.attachIconBox}><Text style={{ fontSize: 20 }}>📷</Text></View>
              <Text style={styles.attachRowTxt}>{t('chat_attach_camera')}</Text>
            </Pressable>
            <Pressable style={styles.attachRow} onPress={() => void pickAndSendMedia('image')}>
              <View style={styles.attachIconBox}><Text style={{ fontSize: 20 }}>🖼️</Text></View>
              <Text style={styles.attachRowTxt}>{t('chat_attach_photo')}</Text>
            </Pressable>
            <Pressable style={styles.attachRow} onPress={() => void pickAndSendMedia('video')}>
              <View style={styles.attachIconBox}><Text style={{ fontSize: 20 }}>🎬</Text></View>
              <Text style={styles.attachRowTxt}>{t('chat_attach_video')}</Text>
            </Pressable>
            <Pressable style={styles.attachCancelBtn} onPress={() => setShowAttachSheet(false)}>
              <Text style={styles.attachCancelTxt}>{t('chat_cancel')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* ── Messages éphémères ──────────────────────────────────────────────── */}
      <Modal visible={showEphemeral} transparent animationType="fade" onRequestClose={() => setShowEphemeral(false)}>
        <Pressable style={styles.actionOverlay} onPress={() => setShowEphemeral(false)}>
          <View style={styles.attachSheet}>
            <Text style={styles.attachTitle}>{t('chat_ephemeral_title')}</Text>
            <Text style={styles.ephemeralHint}>{t('chat_ephemeral_hint')}</Text>
            {EPHEMERAL_OPTIONS.map((opt) => {
              const active = ephemeralTtl === opt;
              return (
                <Pressable
                  key={String(opt)}
                  style={styles.attachRow}
                  onPress={() => void applyEphemeral(opt)}
                >
                  <Text style={[styles.attachRowTxt, active && { color: colors.brand }]}>
                    {opt === null ? t('chat_ephemeral_off') : ephemeralLabel(t, opt)}{active ? '  ✓' : ''}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable style={styles.attachCancelBtn} onPress={() => setShowEphemeral(false)}>
              <Text style={styles.attachCancelTxt}>{t('chat_cancel')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* ── Choix de la langue de traduction (bouton 🌐) ─────────────────────── */}
      <Modal visible={showLangPicker} transparent animationType="fade" onRequestClose={() => setShowLangPicker(false)}>
        <Pressable style={styles.actionOverlay} onPress={() => setShowLangPicker(false)}>
          <View style={styles.attachSheet}>
            <Text style={styles.attachTitle}>{t('chat_translate_action')}</Text>
            <View style={styles.langGrid}>
              {SUPPORTED_LOCALES.map((loc) => (
                <Pressable
                  key={loc.code}
                  style={[styles.langTile, translateTarget === loc.code && styles.langTileActive]}
                  onPress={() => chooseTranslateTarget(loc.code)}
                >
                  <Text style={{ fontSize: 22 }}>{loc.flag}</Text>
                  <Text style={styles.langTileLabel} numberOfLines={1}>{loc.nativeLabel}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={styles.attachCancelBtn} onPress={() => setShowLangPicker(false)}>
              <Text style={styles.attachCancelTxt}>{t('chat_cancel')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* ── Menu appui long : réactions + répondre ─────────────────────────── */}
      <Modal visible={actionMsg !== null} transparent animationType="fade" onRequestClose={() => setActionMsg(null)}>
        <Pressable style={styles.actionOverlay} onPress={() => setActionMsg(null)}>
          <View style={styles.actionSheet}>
            <View style={styles.reactionPicker}>
              {REACTION_EMOJIS.map((e) => (
                <Pressable key={e} onPress={() => actionMsg && void react(actionMsg, e)} hitSlop={6}>
                  <Text style={styles.reactionPickerEmoji}>{e}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={styles.actionRow}
              onPress={() => { setReplyTo(actionMsg); setActionMsg(null); }}
            >
              <Text style={styles.actionRowTxt}>{t('chat_action_reply')}</Text>
            </Pressable>
            {actionMsg && (actionMsg.type === 'text' || actionMsg.type === 'encrypted') ? (
              <Pressable
                style={styles.actionRow}
                onPress={() => void handleTranslate(actionMsg)}
              >
                <Text style={styles.actionRowTxt}>
                  {translations.has(actionMsg.id) ? t('chat_translate_hide') : t('chat_translate_action')}
                </Text>
              </Pressable>
            ) : null}
            {actionMsg && (actionMsg.type === 'image' || actionMsg.type === 'video') && actionMsg.mediaUrl ? (
              <Pressable
                style={styles.actionRow}
                onPress={() => {
                  const url = actionMsg.mediaUrl!;
                  setActionMsg(null);
                  void saveRemoteMediaToGallery(url).then((r) => {
                    if (r === 'saved') Alert.alert(t('sv_saved_title'), t('chat_saved_body'));
                    else if (r === 'denied') Alert.alert(t('sv_perm_denied_title'), t('sv_perm_denied_body'));
                    else Alert.alert(t('sv_error'), t('chat_save_error'));
                  });
                }}
              >
                <Text style={styles.actionRowTxt}>{t('chat_action_save')}</Text>
              </Pressable>
            ) : null}
            {actionMsg && actionMsg.senderId !== myId && actionMsg.type !== 'call' ? (
              <Pressable
                style={styles.actionRow}
                onPress={() => {
                  const msg = actionMsg;
                  setActionMsg(null);
                  // Laisse le menu se refermer : iOS refuse de présenter la
                  // feuille des motifs pendant qu'une modale se ferme.
                  setTimeout(() => promptReport({
                    accessToken,
                    targetType: 'message',
                    targetId: msg.id,
                    t,
                    titleKey: 'report_message_title',
                    details: msg.type === 'encrypted' ? decrypted.get(msg.id) : undefined,
                  }), 350);
                }}
              >
                <Text style={[styles.actionRowTxt, { color: colors.danger }]}>{t('report_content_action')}</Text>
              </Pressable>
            ) : null}
            {actionMsg?.senderId === myId ? (
              <Pressable
                style={styles.actionRow}
                onPress={() => {
                  const msg = actionMsg;
                  setActionMsg(null);
                  Alert.alert(t('chat_delete_confirm_title'), t('chat_delete_confirm_body'), [
                    { text: t('chat_cancel'), style: 'cancel' },
                    { text: t('chat_delete'), style: 'destructive', onPress: () => msg && void deleteMessage(msg) },
                  ]);
                }}
              >
                <Text style={[styles.actionRowTxt, { color: colors.danger }]}>{t('chat_action_delete')}</Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CHAT_BG },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: 10, gap: 10,
    backgroundColor: HEADER_BG,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: CHAT_HAIRLINE,
  },
  backTxt: { fontSize: 19, color: '#fff', fontWeight: '700' },
  partnerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  headerAvatar: { width: 38, height: 38, borderRadius: 19 },
  headerAvatarFallback: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  partnerName: { fontSize: 17, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.3, flexShrink: 1 },
  encLabel: { fontSize: 11, color: colors.brandSoft, fontWeight: '700', marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: 6 },
  headerActionIcon: { fontSize: 17 },

  // Messages
  messageList: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  msgRow: { flexDirection: 'row', marginBottom: 6, alignItems: 'flex-end' },
  msgRowMe: { justifyContent: 'flex-end' },
  meBar: { width: 3, borderRadius: 2, backgroundColor: colors.brand, marginRight: 8, alignSelf: 'stretch' },
  // Coin « queue » côté expéditeur ; start/end suivent le sens de lecture
  // (RTL inclus). overflow hidden : le dégradé épouse les coins.
  bubble: { maxWidth: '76%', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 14, overflow: 'hidden' },
  bubbleMe: { backgroundColor: colors.brand, borderBottomEndRadius: 6 },
  bubbleOther: {
    backgroundColor: CHAT_GLASS, borderBottomStartRadius: 6,
    borderWidth: StyleSheet.hairlineWidth, borderColor: CHAT_HAIRLINE,
  },
  bubbleTxt: { fontSize: 15.5, color: colors.textPrimary, lineHeight: 21 },
  bubbleTxtMe: { color: '#fff' },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 },
  encIcon: { fontSize: 10, color: 'rgba(255,255,255,0.4)' },
  bubbleTime: { fontSize: 10, color: colors.textMuted },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.75)' },

  // Traduction à la demande
  translationBox: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.08)' },
  translationBoxMe: { borderTopColor: 'rgba(255,255,255,0.25)' },
  translationLabel: { fontSize: 10, fontWeight: '700', color: colors.brand, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  translationTxt: { fontSize: 14, color: colors.text, fontStyle: 'italic', lineHeight: 19 },
  translationTxtMe: { color: 'rgba(255,255,255,0.92)' },

  // Bulle média (photo / vidéo)
  mediaBubble: {
    width: 224, height: 270, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surfaceElevated, position: 'relative',
    borderWidth: StyleSheet.hairlineWidth, borderColor: CHAT_HAIRLINE,
  },
  mediaContent: { width: '100%', height: '100%' },
  mediaPlayOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.2)',
  },

  // Call event
  callEvent: {
    maxWidth: '85%', borderRadius: 20, backgroundColor: CHAT_GLASS, overflow: 'hidden', marginBottom: 4,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  callEventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  callIconBox: { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  callIconBoxMissed: { backgroundColor: 'rgba(229,72,77,0.12)' },
  missedArrow: { position: 'absolute', bottom: 2, right: 2 },
  callEventLabel: { fontSize: 14, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 },
  callEventLabelMissed: { color: '#E5484D' },
  callEventTime: { fontSize: 12, color: colors.textMuted },
  callbackBtn: { marginHorizontal: 12, marginBottom: 12, borderRadius: radius.pill, paddingVertical: 10, alignItems: 'center', overflow: 'hidden' },
  callbackBtnTxt: { fontWeight: '800', color: '#fff', fontSize: 14 },

  // Input — style Apple : pill translucide, boutons circulaires flottants
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: spacing.md, paddingTop: 10,
    backgroundColor: HEADER_BG, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CHAT_HAIRLINE,
  },
  inputIconBtn: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: CHAT_GLASS, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)', marginBottom: 3,
  },
  inputPill: {
    flex: 1, flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: CHAT_BG, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
    paddingLeft: 16, paddingRight: 6, minHeight: 44,
  },
  input: { flex: 1, color: colors.textPrimary, fontSize: 16, maxHeight: 110, paddingVertical: 11 },
  emojiToggleBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brand, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', marginBottom: 3,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendIcon: { color: '#fff', fontSize: 19, fontWeight: '900' },
  micBtn: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: CHAT_GLASS, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)', marginBottom: 3,
  },

  // Feuille "+" pièces jointes
  attachSheet: {
    backgroundColor: colors.surfaceElevated, borderRadius: radius.xl, padding: spacing.md, width: '84%', gap: 4,
    borderWidth: StyleSheet.hairlineWidth, borderColor: CHAT_HAIRLINE, ...elevation.high,
  },
  attachTitle: { fontSize: 12, fontWeight: '800', color: colors.textSecondary, textAlign: 'center', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1.6 },
  attachRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 6 },
  attachIconBox: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: CHAT_BG, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  attachRowTxt: { fontSize: 15.5, fontWeight: '700', color: colors.textPrimary },
  attachCancelBtn: { marginTop: 8, paddingVertical: 12, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CHAT_HAIRLINE },
  attachCancelTxt: { fontSize: 15, fontWeight: '700', color: colors.danger },

  // Choix de langue de traduction
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, maxHeight: 320 },
  langTile: {
    width: '31%', aspectRatio: 1.3, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  langTileActive: { borderColor: colors.brand, backgroundColor: `${colors.brand}22` },
  langTileLabel: { fontSize: 11, fontWeight: '600', color: colors.text, textAlign: 'center' },

  // Voice bar
  voiceBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CHAT_HAIRLINE, backgroundColor: HEADER_BG,
  },
  voiceCancelBtn: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: CHAT_GLASS, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)',
  },
  voiceCancelTxt: { fontSize: 20, color: colors.textMuted },
  voiceIndicator: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  voiceRecDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF3040' },
  voiceRecTime: { fontSize: 17, fontWeight: '900', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  voiceRecLabel: { fontSize: 13, color: colors.textMuted },
  voiceSendBtn: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brand, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },

  // Réponse / citation
  replyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: spacing.md, marginTop: 6,
    backgroundColor: CHAT_GLASS, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8,
    borderStartWidth: 3, borderStartColor: colors.brand,
  },
  replyBannerTxt: { flex: 1, fontSize: 12, color: colors.textMuted },
  quoteBox: { backgroundColor: 'rgba(0,0,0,0.22)', borderStartWidth: 3, borderStartColor: colors.brand, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6 },
  quoteBoxMe: { backgroundColor: 'rgba(0,0,0,0.18)', borderStartColor: '#fff' },
  quoteTxt: { fontSize: 12, color: colors.textMuted },
  // Story reply / post partagé
  storyReplyLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 4, fontStyle: 'italic' },
  storyReplyThumb: { width: 90, height: 140, borderRadius: radius.md },
  sharedPostCard: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.15)', marginBottom: 6, width: 200 },
  sharedPostImg: { width: 200, height: 200 },
  sharedPostCaption: { fontSize: 12, color: colors.text, padding: 8 },
  // Réactions
  reactionsRow: { flexDirection: 'row', gap: 4, marginTop: 6, alignSelf: 'flex-end' },
  reactionChip: {
    backgroundColor: 'rgba(14,14,18,0.7)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, fontSize: 12,
    color: colors.textPrimary, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
  },
  actionOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center' },
  actionSheet: {
    backgroundColor: colors.surfaceElevated, borderRadius: radius.xl, padding: spacing.md, width: '82%', gap: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: CHAT_HAIRLINE, ...elevation.high,
  },
  ephemeralBanner: {
    backgroundColor: HEADER_BG, paddingVertical: 6, alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: CHAT_HAIRLINE,
  },
  ephemeralBannerTxt: { color: colors.brandSoft, fontSize: 12, fontWeight: '700' },
  ephemeralHint: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  reactionPicker: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 6 },
  reactionPickerEmoji: { fontSize: 30 },
  actionRow: { paddingVertical: 12, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CHAT_HAIRLINE },
  actionRowTxt: { color: colors.textPrimary, fontWeight: '800', fontSize: 15 },
  // Voice bubble
  voiceBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 10, width: 230, maxWidth: '76%', borderRadius: 20,
    paddingVertical: 10, paddingHorizontal: 14, overflow: 'hidden',
  },
  voiceBubbleMe: { backgroundColor: colors.brand, borderBottomEndRadius: 6 },
  voiceBubbleOther: {
    backgroundColor: CHAT_GLASS, borderBottomStartRadius: 6,
    borderWidth: StyleSheet.hairlineWidth, borderColor: CHAT_HAIRLINE,
  },
  voicePlayIcon: { fontSize: 20, color: colors.brandSoft, width: 24, textAlign: 'center' },
  voiceWave: { flex: 1 },
  voiceTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  voiceFill: { height: '100%', borderRadius: 2 },
  voiceTime: { fontSize: 11, color: colors.textMuted, minWidth: 36, textAlign: 'right' },
});
