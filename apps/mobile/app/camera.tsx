import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Dimensions, Image, PanResponder,
  Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraMode, CameraType, CameraView, FlashMode, useCameraPermissions } from 'expo-camera';
import { useVideoPlayer, VideoView } from 'expo-video';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../lib/auth-context';
import { colors, radius, spacing } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';

const { width: SW } = Dimensions.get('window');
const API = API_BASE_URL;
const MEMORIES_KEY = 'yumia:memories';

type CaptureMode = 'picture' | 'video';
type PublishTarget = 'post' | 'story' | 'reel';
type BottomMode = 'photo' | 'video' | 'reel';

// Filtres style Instagram — overlay très subtil (4-9 % d'opacité)
// Les noms sont les mêmes que les vrais filtres photo reconnus
interface FilterDef { id: string; label: string; overlay: string; opacity: number }
const FILTERS: FilterDef[] = [
  { id: 'aucun',     label: 'Aucun',     overlay: 'transparent', opacity: 0    },
  { id: 'clarendon', label: 'Clarendon', overlay: '#FFFFFF',     opacity: 0.06 }, // luminosité douce
  { id: 'nashville', label: 'Nashville', overlay: '#FFE0C0',     opacity: 0.07 }, // chaud ambré
  { id: 'valencia',  label: 'Valence',   overlay: '#FFCC80',     opacity: 0.08 }, // soleil
  { id: 'lark',      label: 'Lark',      overlay: '#E8F4FF',     opacity: 0.07 }, // frais lumineux
  { id: 'juno',      label: 'Juno',      overlay: '#B0D8FF',     opacity: 0.05 }, // bleu doux
  { id: 'moon',      label: 'Moon',      overlay: '#A0A0A0',     opacity: 0.18 }, // noir & blanc
  { id: 'perpetua',  label: 'Perpetua',  overlay: '#A0E0C0',     opacity: 0.06 }, // vert satiné
  { id: 'gingham',   label: 'Gingham',   overlay: '#FFFEF0',     opacity: 0.06 }, // fade vintage
];

const ZOOM_OPTIONS = [
  { label: '.5', value: 0   },
  { label: '1×', value: 0   },
  { label: '5×', value: 0.8 },
];

const BOTTOM_MODES: { id: BottomMode; label: string }[] = [
  { id: 'photo', label: 'PHOTO' },
  { id: 'video', label: 'VIDÉO' },
  { id: 'reel',  label: 'REEL'  },
];

// ─── Composant Review plein écran ────────────────────────────────────────────
function ReviewScreen({
  preview, filterIdx, insets, onRetake, onSaveMemory, onNext,
}: {
  preview: { uri: string; type: 'picture' | 'video' };
  filterIdx: number;
  insets: { top: number; bottom: number };
  onRetake: () => void;
  onSaveMemory: () => Promise<void>;
  onNext: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const videoPlayer = useVideoPlayer(
    preview.type === 'video' ? preview.uri : null,
    (p) => { p.loop = true; p.play(); },
  );

  const handleSave = async () => {
    if (saved) return;
    await onSaveMemory();
    setSaved(true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Média plein écran */}
      {preview.type === 'picture' ? (
        <Image source={{ uri: preview.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <VideoView
          player={videoPlayer}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
        />
      )}

      {/* Overlay filtre */}
      {FILTERS[filterIdx].opacity > 0 && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: FILTERS[filterIdx].overlay, opacity: FILTERS[filterIdx].opacity }]} pointerEvents="none" />
      )}

      {/* Bouton retake (haut gauche) */}
      <View style={[reviewStyles.topRow, { paddingTop: insets.top + 8 }]}>
        <Pressable style={reviewStyles.circleBtn} onPress={onRetake}>
          <Text style={reviewStyles.circleBtnTxt}>✕</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        {/* Badge filtre */}
        {FILTERS[filterIdx].id !== 'aucun' && (
          <View style={reviewStyles.filterBadge}>
            <Text style={reviewStyles.filterBadgeTxt}>{FILTERS[filterIdx].label}</Text>
          </View>
        )}
      </View>

      {/* Actions bas */}
      <View style={[reviewStyles.bottomRow, { paddingBottom: insets.bottom + 20 }]}>
        {/* Enregistrer */}
        <Pressable style={reviewStyles.actionBtn} onPress={handleSave}>
          <Text style={{ fontSize: 26 }}>{saved ? '✅' : '💾'}</Text>
          <Text style={reviewStyles.actionLabel}>{saved ? 'Enregistré' : 'Souvenirs'}</Text>
        </Pressable>

        <View style={{ flex: 1 }} />

        {/* Suivant */}
        <Pressable style={reviewStyles.nextBtn} onPress={onNext}>
          <Text style={reviewStyles.nextBtnTxt}>Suivant →</Text>
        </Pressable>
      </View>
    </View>
  );
}

const reviewStyles = StyleSheet.create({
  topRow: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  circleBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  circleBtnTxt: { color: '#fff', fontSize: 18, fontWeight: '700' },
  filterBadge: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  filterBadgeTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  bottomRow: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  actionBtn: { alignItems: 'center', gap: 5 },
  actionLabel: { color: '#fff', fontSize: 11, fontWeight: '600' },
  nextBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 28, paddingVertical: 14 },
  nextBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});

// ─────────────────────────────────────────────────────────────────────────────
export default function CameraScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [captureMode, setCaptureMode] = useState<CaptureMode>(mode === 'reel' ? 'video' : 'picture');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [preview, setPreview] = useState<{ uri: string; type: CaptureMode } | null>(null);
  const [caption, setCaption] = useState('');
  const [publishTarget, setPublishTarget] = useState<PublishTarget>(
    mode === 'reel' ? 'reel' : mode === 'story' ? 'story' : 'post',
  );
  const [previewPhase, setPreviewPhase] = useState<'review' | 'publish'>('review');
  const [uploading, setUploading] = useState(false);
  const [timer, setTimer] = useState<3 | 10 | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pinToProfile, setPinToProfile] = useState(false);
  const [highlightTitle, setHighlightTitle] = useState('');
  const [saveToMemories, setSaveToMemories] = useState(true);

  // Contrôles caméra
  const [zoomIdx, setZoomIdx] = useState(1);
  const [showGrid, setShowGrid] = useState(false);
  const [filterIdx, setFilterIdx] = useState(0);
  const [hdMode, setHdMode] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [bottomMode, setBottomMode] = useState<BottomMode>(mode === 'reel' ? 'reel' : 'photo');

  // Animation du nom du filtre (apparaît 1,5s quand on swipe)
  const filterLabelOpacity = useRef(new Animated.Value(0)).current;
  const filterLabelTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cameraRef = useRef<CameraView>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (recordTimerRef.current) clearInterval(recordTimerRef.current); }, []);

  // ─── Geste swipe pour les filtres ────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5 && Math.abs(gs.dx) > 15,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -40) {
          setFilterIdx((i) => (i + 1) % FILTERS.length);
          showFilterLabel();
        } else if (gs.dx > 40) {
          setFilterIdx((i) => (i - 1 + FILTERS.length) % FILTERS.length);
          showFilterLabel();
        }
      },
    }),
  ).current;

  const showFilterLabel = () => {
    if (filterLabelTimeout.current) clearTimeout(filterLabelTimeout.current);
    filterLabelOpacity.setValue(1);
    filterLabelTimeout.current = setTimeout(() => {
      Animated.timing(filterLabelOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start();
    }, 1200);
  };

  const cycleFlash = () => setFlash((f) => f === 'off' ? 'on' : f === 'on' ? 'auto' : 'off');
  const cycleTimer = () => setTimer((t) => t === null ? 3 : t === 3 ? 10 : null);

  const switchMode = (m: BottomMode) => {
    setBottomMode(m);
    if (m === 'photo') { setCaptureMode('picture'); setPublishTarget(mode === 'story' ? 'story' : 'post'); }
    else if (m === 'video') { setCaptureMode('video'); setPublishTarget('post'); }
    else { setCaptureMode('video'); setPublishTarget('reel'); }
  };

  if (!permission) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;

  if (!permission.granted) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, backgroundColor: '#000' }]}>
        <Text style={styles.permEmoji}>📷</Text>
        <Text style={styles.permTitle}>Accès à la caméra requis</Text>
        <Text style={styles.permSub}>Yumia a besoin de ta caméra pour prendre des photos et vidéos.</Text>
        <Pressable style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnTxt}>Autoriser la caméra</Text>
        </Pressable>
        <Pressable style={{ marginTop: 16 }} onPress={() => router.back()}>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15 }}>Annuler</Text>
        </Pressable>
      </View>
    );
  }

  // ─── Photo ────────────────────────────────────────────────────────────────
  const takePhoto = async () => {
    if (!cameraRef.current || captureMode !== 'picture') return;
    if (timer) {
      let c = timer; setCountdown(c);
      await new Promise<void>((res) => {
        const iv = setInterval(() => { c--; if (c <= 0) { clearInterval(iv); setCountdown(null); res(); } else setCountdown(c); }, 1000);
      });
    }
    const photo = await cameraRef.current.takePictureAsync({ quality: hdMode ? 1 : 0.85 });
    if (photo) { setPreview({ uri: photo.uri, type: 'picture' }); setPreviewPhase('review'); }
  };

  // ─── Vidéo ────────────────────────────────────────────────────────────────
  const startRecording = async () => {
    if (!cameraRef.current || isRecording) return;
    setIsRecording(true); setRecordingSeconds(0);
    recordTimerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: 90 });
      if (video) { setPreview({ uri: video.uri, type: 'video' }); setPreviewPhase('review'); }
    } finally {
      setIsRecording(false);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    }
  };

  const stopRecording = () => cameraRef.current?.stopRecording();
  const handleShutter = () => {
    if (captureMode === 'picture') void takePhoto();
    else if (!isRecording) void startRecording();
    else stopRecording();
  };

  const fmtSec = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ─── Publication ──────────────────────────────────────────────────────────
  const publish = async () => {
    if (!preview || !accessToken) return;
    setUploading(true);
    try {
      const isVideo = preview.type === 'video';
      const form = new FormData();
      form.append('file', { uri: preview.uri, type: isVideo ? 'video/mp4' : 'image/jpeg', name: isVideo ? 'reel.mp4' : 'photo.jpg' } as never);

      const up = await fetch(`${API}/posts/upload`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form });
      if (!up.ok) {
        const txt = await up.text().catch(() => '');
        Alert.alert('Erreur', `Upload échoué (HTTP ${up.status}). ${txt.slice(0, 200)}`);
        return;
      }
      const { url } = await up.json() as { url: string };

      if (saveToMemories) {
        const existing = JSON.parse(await AsyncStorage.getItem(MEMORIES_KEY) ?? '[]') as unknown[];
        await AsyncStorage.setItem(MEMORIES_KEY, JSON.stringify([
          { uri: preview.uri, url, type: isVideo ? 'video' : 'photo', caption, filter: FILTERS[filterIdx].id, createdAt: new Date().toISOString() },
          ...existing,
        ]));
      }

      if (publishTarget === 'story') {
        const storyType = isVideo ? 'video' : 'photo';
        const sRes = await fetch(`${API}/stories`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ mediaUrl: url, type: storyType, caption }) });
        if (!sRes.ok) {
          const txt = await sRes.text().catch(() => '');
          Alert.alert('Erreur', `Publication de la story échouée (HTTP ${sRes.status}). ${txt.slice(0, 200)}`);
          return;
        }
        if (pinToProfile) {
          await fetch(`${API}/stories/highlights`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ title: highlightTitle.trim() || 'À la une', items: [{ mediaUrl: url, type: storyType, caption }] }) });
        }
        router.replace('/(tabs)/social' as never);
      } else {
        const pRes = await fetch(`${API}/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ mediaUrls: [url], caption, mediaType: isVideo ? 'video' : 'photo', isReel: publishTarget === 'reel' }) });
        if (!pRes.ok) {
          const txt = await pRes.text().catch(() => '');
          Alert.alert('Erreur', `Publication échouée (HTTP ${pRes.status}). ${txt.slice(0, 200)}`);
          return;
        }
        router.replace(publishTarget === 'reel' ? '/reels' : '/(tabs)/social' as never);
      }
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Échec de la publication.');
    } finally { setUploading(false); }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1 — Revue plein écran style Snapchat
  // ═══════════════════════════════════════════════════════════════════════════
  if (preview && previewPhase === 'review') {
    return <ReviewScreen
      preview={preview}
      filterIdx={filterIdx}
      insets={insets}
      onRetake={() => setPreview(null)}
      onSaveMemory={async () => {
        const existing = JSON.parse(await AsyncStorage.getItem(MEMORIES_KEY) ?? '[]') as unknown[];
        await AsyncStorage.setItem(MEMORIES_KEY, JSON.stringify([
          { uri: preview.uri, type: preview.type === 'video' ? 'video' : 'photo', filter: FILTERS[filterIdx].id, createdAt: new Date().toISOString() },
          ...existing,
        ]));
      }}
      onNext={() => setPreviewPhase('publish')}
    />;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — Formulaire de publication
  // ═══════════════════════════════════════════════════════════════════════════
  if (preview && previewPhase === 'publish') {
    return (
      <View style={[styles.publishContainer, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.publishHeader}>
          <Pressable onPress={() => setPreviewPhase('review')}>
            <Text style={styles.publishBack}>←</Text>
          </Pressable>
          <Text style={styles.publishTitle}>Nouvelle publication</Text>
          <Pressable onPress={publish} disabled={uploading} style={styles.publishHeaderBtn}>
            {uploading
              ? <ActivityIndicator color={colors.brand} size="small" />
              : <Text style={styles.publishHeaderBtnTxt}>Partager</Text>}
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
          {/* Miniature en haut */}
          <View style={styles.thumbRow}>
            <View style={styles.thumbWrap}>
              <Image source={{ uri: preview.uri }} style={styles.thumb} resizeMode="cover" />
              {FILTERS[filterIdx].opacity > 0 && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: FILTERS[filterIdx].overlay, opacity: FILTERS[filterIdx].opacity }]} pointerEvents="none" />
              )}
              {preview.type === 'video' && (
                <View style={styles.thumbPlayBadge}><Text style={{ color: '#fff', fontSize: 16 }}>▶</Text></View>
              )}
            </View>
            {FILTERS[filterIdx].id !== 'aucun' && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeTxt}>✦ {FILTERS[filterIdx].label}</Text>
              </View>
            )}
          </View>

          {/* Légende */}
          <TextInput
            style={styles.captionInput}
            placeholder="Ajoute une légende..."
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={300}
          />

          {/* Cible */}
          <Text style={styles.sectionLabel}>Publier en tant que</Text>
          <View style={styles.targetRow}>
            {(['post', 'story', 'reel'] as PublishTarget[]).map((t) => (
              <Pressable key={t} style={[styles.targetBtn, publishTarget === t && styles.targetBtnActive]} onPress={() => setPublishTarget(t)}>
                <Text style={styles.targetEmoji}>{t === 'post' ? '📸' : t === 'story' ? '⭕' : '🎬'}</Text>
                <Text style={[styles.targetLabel, publishTarget === t && { color: colors.brand }]}>
                  {t === 'post' ? 'Publication' : t === 'story' ? 'Story' : 'Reel'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* À la une (story) */}
          {publishTarget === 'story' && (
            <>
              <View style={styles.optRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optTitle}>📌 Enregistrer à la une</Text>
                  <Text style={styles.optHint}>Garde cette story sur ton profil après 24h</Text>
                </View>
                <Switch value={pinToProfile} onValueChange={setPinToProfile} trackColor={{ false: 'rgba(255,255,255,0.2)', true: colors.brand }} thumbColor="#fff" />
              </View>
              {pinToProfile && (
                <TextInput
                  style={styles.captionInput}
                  placeholder="Nom de la story à la une..."
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  value={highlightTitle}
                  onChangeText={setHighlightTitle}
                  maxLength={30}
                />
              )}
            </>
          )}

          {/* Souvenirs */}
          <View style={styles.optRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.optTitle}>💾 Enregistrer dans Souvenirs</Text>
              <Text style={styles.optHint}>Retrouve ce contenu dans tes Souvenirs</Text>
            </View>
            <Switch value={saveToMemories} onValueChange={setSaveToMemories} trackColor={{ false: 'rgba(255,255,255,0.2)', true: colors.brand }} thumbColor="#fff" />
          </View>
        </ScrollView>
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉCRAN CAMÉRA — style Snapchat/Instagram
  // ═══════════════════════════════════════════════════════════════════════════
  const activeFilter = FILTERS[filterIdx];

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      {/* Viewfinder */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        flash={flash}
        zoom={ZOOM_OPTIONS[zoomIdx].value}
        mode={captureMode as CameraMode}
      />

      {/* Overlay filtre couleur subtil */}
      {activeFilter.opacity > 0 && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: activeFilter.overlay, opacity: activeFilter.opacity }]} pointerEvents="none" />
      )}

      {/* Grille 3×3 */}
      {showGrid && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={[styles.gridV, { left: '33.33%' }]} />
          <View style={[styles.gridV, { left: '66.66%' }]} />
          <View style={[styles.gridH, { top: '33.33%' }]} />
          <View style={[styles.gridH, { top: '66.66%' }]} />
        </View>
      )}

      {/* Nom du filtre (apparaît brièvement au swipe) */}
      <Animated.View style={[styles.filterNameBadge, { opacity: filterLabelOpacity, bottom: insets.bottom + 160 }]} pointerEvents="none">
        <Text style={styles.filterNameTxt}>{activeFilter.label}</Text>
      </Animated.View>

      {/* Compte à rebours */}
      {countdown !== null && (
        <View style={styles.countdownOverlay} pointerEvents="none">
          <Text style={styles.countdownNum}>{countdown}</Text>
        </View>
      )}

      {/* Timer enregistrement */}
      {isRecording && (
        <View style={[styles.recTimer, { top: insets.top + 16 }]}>
          <View style={styles.recDot} />
          <Text style={styles.recTime}>{fmtSec(recordingSeconds)}</Text>
        </View>
      )}

      {/* ── BARRE DU HAUT ──────────────────────────────────────────────────── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.topBtn} onPress={() => router.back()}>
          <Text style={styles.topBtnTxt}>✕</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          {timer !== null && (
            <View style={styles.timerBadge}>
              <Text style={styles.timerBadgeTxt}>⏱ {timer}s</Text>
            </View>
          )}
        </View>
        <Pressable style={styles.topBtn} onPress={() => setFacing((f) => f === 'back' ? 'front' : 'back')}>
          <Text style={styles.topBtnTxt}>↺</Text>
        </Pressable>
      </View>

      {/* ── SIDEBAR DROITE — icônes seulement ─────────────────────────────── */}
      <View style={[styles.sideBar, { top: insets.top + 72 }]}>
        {/* Flash */}
        <Pressable style={[styles.sideBtn, flash !== 'off' && styles.sideBtnOn]} onPress={cycleFlash}>
          <Text style={styles.sideBtnTxt}>⚡</Text>
          {flash === 'off' && <View style={styles.sideStrike} />}
        </Pressable>
        {/* Timer */}
        <Pressable style={[styles.sideBtn, timer !== null && styles.sideBtnOn]} onPress={cycleTimer}>
          <Text style={styles.sideBtnTxt}>⏱</Text>
          {timer !== null && <Text style={styles.sideBadge}>{timer}</Text>}
        </Pressable>
        {/* HD */}
        <Pressable style={[styles.sideBtn, hdMode && styles.sideBtnOn]} onPress={() => setHdMode(!hdMode)}>
          <Text style={[styles.sideBtnTxt, { fontSize: 11, fontWeight: '900' }]}>HD</Text>
        </Pressable>
        {/* Grille */}
        <Pressable style={[styles.sideBtn, showGrid && styles.sideBtnOn]} onPress={() => setShowGrid(!showGrid)}>
          <Text style={styles.sideBtnTxt}>⊞</Text>
        </Pressable>
        {/* Muet */}
        <Pressable style={[styles.sideBtn, isMuted && styles.sideBtnOn]} onPress={() => setIsMuted(!isMuted)}>
          <Text style={styles.sideBtnTxt}>{isMuted ? '🔇' : '♪'}</Text>
        </Pressable>
      </View>

      {/* ── ZOOM ───────────────────────────────────────────────────────────── */}
      <View style={[styles.zoomPill, { bottom: insets.bottom + 210 }]}>
        {ZOOM_OPTIONS.map((z, i) => (
          <Pressable key={z.label} style={[styles.zoomBtn, zoomIdx === i && styles.zoomBtnActive]} onPress={() => setZoomIdx(i)}>
            <Text style={[styles.zoomTxt, zoomIdx === i && styles.zoomTxtActive]}>{z.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* ── CONTRÔLES DU BAS ───────────────────────────────────────────────── */}
      <View style={[styles.shutterRow, { bottom: insets.bottom + 105 }]}>
        <Pressable
          style={styles.shutterSide}
          onPress={() => router.push((mode === 'story' ? '/story/create' : '/post/create') as never)}
        >
          <Text style={{ fontSize: 30 }}>🖼️</Text>
          <Text style={styles.shutterSideLabel}>Galerie</Text>
        </Pressable>

        <Pressable
          style={[styles.shutter, captureMode === 'video' && isRecording && styles.shutterRec]}
          onPress={handleShutter}
        >
          {captureMode === 'video' && isRecording
            ? <View style={styles.shutterStop} />
            : captureMode === 'video'
              ? <View style={styles.shutterVideoIcon} />
              : <View style={styles.shutterPhotoInner} />}
        </Pressable>

        <Pressable style={styles.shutterSide} onPress={() => setFacing((f) => f === 'back' ? 'front' : 'back')}>
          <Text style={{ fontSize: 30 }}>🔄</Text>
          <Text style={styles.shutterSideLabel}>Retourner</Text>
        </Pressable>
      </View>

      {/* ── ONGLETS MODE ───────────────────────────────────────────────────── */}
      <View style={[styles.modeRow, { bottom: insets.bottom + 60 }]}>
        {BOTTOM_MODES.map((m) => (
          <Pressable key={m.id} onPress={() => switchMode(m.id)}>
            <Text style={[styles.modeTxt, bottomMode === m.id && styles.modeTxtActive]}>{m.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Indicateur de swipe filtre (discret, apparaît la 1ère fois) */}
      {filterIdx === 0 && (
        <View style={[styles.swipeHint, { bottom: insets.bottom + 30 }]} pointerEvents="none">
          <Text style={styles.swipeHintTxt}>← swipe pour changer de filtre →</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },

  // Permission
  permEmoji: { fontSize: 60, marginBottom: 16 },
  permTitle: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 10 },
  permSub:   { fontSize: 14, color: 'rgba(255,255,255,0.6)', textAlign: 'center', paddingHorizontal: 32, lineHeight: 22, marginBottom: 30 },
  permBtn:   { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 32, paddingVertical: 14 },
  permBtnTxt:{ color: '#fff', fontWeight: '700', fontSize: 16 },

  // Grid
  gridV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.25)' },
  gridH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.25)' },

  // Filtre nom badge
  filterNameBadge: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 7 },
  filterNameTxt: { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.5 },

  // Countdown
  countdownOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  countdownNum: { fontSize: 110, color: '#fff', fontWeight: '900' },

  // Recording
  recTimer: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6 },
  recDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3040' },
  recTime:  { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Top bar
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 10 },
  topBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20 },
  topBtnTxt: { fontSize: 18, color: '#fff', fontWeight: '700' },
  timerBadge: { alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 },
  timerBadgeTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Right sidebar
  sideBar: { position: 'absolute', right: 12, alignItems: 'center', gap: 14 },
  sideBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, overflow: 'visible' },
  sideBtnOn: { backgroundColor: 'rgba(255,255,255,0.22)' },
  sideBtnTxt: { fontSize: 17, color: '#fff' },
  sideStrike: { position: 'absolute', width: 26, height: 2, backgroundColor: '#fff', transform: [{ rotate: '-45deg' }] },
  sideBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: colors.brand, borderRadius: 8, width: 16, height: 16, fontSize: 10, color: '#fff', textAlign: 'center', lineHeight: 16, fontWeight: '700' },

  // Zoom pill
  zoomPill: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 22, overflow: 'hidden' },
  zoomBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  zoomBtnActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  zoomTxt: { color: 'rgba(255,255,255,0.55)', fontWeight: '700', fontSize: 14 },
  zoomTxtActive: { color: '#FFEC40', fontSize: 15 },

  // Shutter
  shutterRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: spacing.xl },
  shutterSide: { width: 60, alignItems: 'center', gap: 4 },
  shutterSideLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' },
  shutter: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
  shutterRec: { borderColor: '#FF3040', backgroundColor: 'rgba(255,48,64,0.2)' },
  shutterPhotoInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff' },
  shutterVideoIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FF3040' },
  shutterStop: { width: 28, height: 28, borderRadius: 5, backgroundColor: '#FF3040' },

  // Mode tabs
  modeRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 28 },
  modeTxt: { color: 'rgba(255,255,255,0.45)', fontWeight: '700', fontSize: 13, letterSpacing: 1 },
  modeTxtActive: { color: '#fff' },

  // Swipe hint
  swipeHint: { position: 'absolute', alignSelf: 'center' },
  swipeHintTxt: { color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: '600' },

  // Publish form screen (phase 2)
  publishContainer: { flex: 1, backgroundColor: colors.background },
  publishHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  publishBack: { fontSize: 22, color: colors.text, fontWeight: '700', width: 44 },
  publishTitle: { fontSize: 17, color: colors.text, fontWeight: '700' },
  publishHeaderBtn: { paddingHorizontal: 4 },
  publishHeaderBtnTxt: { color: colors.brand, fontWeight: '800', fontSize: 16 },
  thumbRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  thumbWrap: { width: 100, height: 100, borderRadius: radius.lg, overflow: 'hidden', position: 'relative' },
  thumb: { width: 100, height: 100 },
  thumbPlayBadge: { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  filterBadge: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
  filterBadgeTxt: { color: colors.brand, fontSize: 13, fontWeight: '700' },
  sectionLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '700', letterSpacing: 0.5, paddingHorizontal: spacing.md, paddingTop: 4, paddingBottom: 8, textTransform: 'uppercase' },
  targetRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  targetBtn: { flex: 1, alignItems: 'center', gap: 5, paddingVertical: 12, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  targetBtnActive: { borderColor: colors.brand, backgroundColor: colors.brand + '18' },
  targetEmoji: { fontSize: 22 },
  targetLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  captionInput: { marginHorizontal: spacing.md, marginBottom: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, color: colors.text, fontSize: 15, minHeight: 80, textAlignVertical: 'top', borderWidth: 1, borderColor: colors.border },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: spacing.md, marginBottom: 10, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border },
  optTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  optHint: { fontSize: 12, color: colors.textMuted, lineHeight: 16 },
  publishBtn: { marginHorizontal: spacing.md, backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center' },
  publishBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
