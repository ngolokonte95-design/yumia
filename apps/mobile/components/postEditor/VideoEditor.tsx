/**
 * Éditeur de vidéo façon CapCut, pour la création d'une publication.
 *
 * Aucun traitement vidéo réel n'a lieu ici : texte et dessins sont des
 * DONNÉES (position en %, tracé SVG) recomposées à la lecture par
 * `PostOverlays`, partout où le post s'affiche ensuite — même principe que
 * les stickers de Story. Le fichier vidéo lui-même n'est jamais modifié.
 * C'est ce qui permet de livrer cette fonctionnalité sans nouveau moteur
 * vidéo natif ni build supplémentaire.
 */
import { useRef, useState } from 'react';
import {
  Animated, Modal, PanResponder, Pressable, StyleSheet, Text, TextInput, View,
  type GestureResponderEvent, type PanResponderGestureState,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Audio } from 'expo-av';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { MusicPickerModal, type MusicTrack } from '../MusicPicker';
import type { PostOverlay } from '../../lib/feed-api';
import { useI18n } from '../../lib/useI18n';

const COLORS = ['#fff', '#E5484D', '#F2B705', '#2BB673', '#5C4ECC', '#000'];

let idSeq = 0;
const nextId = () => `ov-${Date.now()}-${idSeq++}`;

export interface VideoEditorResult {
  overlays: PostOverlay[];
  videoMuted: boolean;
  voiceTrackUri: string | null;
  music: MusicTrack | null;
}

export function VideoEditor({
  visible, uri, initial, initialMusic, accessToken, onClose, onDone,
}: {
  visible: boolean;
  uri: string;
  initial: { overlays: PostOverlay[]; videoMuted: boolean; voiceTrackUri: string | null };
  initialMusic: MusicTrack | null;
  accessToken?: string | null;
  onClose: () => void;
  onDone: (result: VideoEditorResult) => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [overlays, setOverlays] = useState<PostOverlay[]>(initial.overlays);
  const [videoMuted, setVideoMuted] = useState(initial.videoMuted);
  const [voiceUri, setVoiceUri] = useState<string | null>(initial.voiceTrackUri);
  const [music, setMusic] = useState<MusicTrack | null>(initialMusic);

  const [tool, setTool] = useState<'none' | 'draw'>('none');
  const [drawColor, setDrawColor] = useState('#E5484D');
  const [textInputVisible, setTextInputVisible] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [musicModalVisible, setMusicModalVisible] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceSoundRef = useRef<Audio.Sound | null>(null);

  const size = useRef({ width: 1, height: 1 });

  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = videoMuted;
    p.play();
  });

  // ── Texte ────────────────────────────────────────────────────────────────
  const addText = () => {
    const text = textDraft.trim();
    if (!text) { setTextInputVisible(false); return; }
    const overlay: PostOverlay = {
      kind: 'text', id: nextId(), x: 50, y: 40, text,
      color: drawColor, fontSize: 26,
    };
    setOverlays((prev) => [...prev, overlay]);
    setTextDraft('');
    setTextInputVisible(false);
    setSelectedId(overlay.id);
  };

  const updateOverlay = (id: string, patch: Partial<PostOverlay>) => {
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } as PostOverlay : o)));
  };

  const removeOverlay = (id: string) => {
    setOverlays((prev) => prev.filter((o) => o.id !== id));
    setSelectedId(null);
  };

  // ── Dessin ───────────────────────────────────────────────────────────────
  const currentPath = useRef<string>('');
  const [livePath, setLivePath] = useState<string | null>(null);

  const toPct = (x: number, y: number) => {
    const w = size.current.width || 1;
    const h = size.current.height || 1;
    return `${((x / w) * 100).toFixed(2)} ${((y / h) * 100).toFixed(2)}`;
  };

  const drawResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => tool === 'draw',
      onMoveShouldSetPanResponder: () => tool === 'draw',
      onPanResponderGrant: (e: GestureResponderEvent) => {
        const { locationX, locationY } = e.nativeEvent;
        currentPath.current = `M ${toPct(locationX, locationY)}`;
        setLivePath(currentPath.current);
      },
      onPanResponderMove: (e: GestureResponderEvent, _g: PanResponderGestureState) => {
        const { locationX, locationY } = e.nativeEvent;
        currentPath.current += ` L ${toPct(locationX, locationY)}`;
        setLivePath(currentPath.current);
      },
      onPanResponderRelease: () => {
        if (currentPath.current.includes('L')) {
          setOverlays((prev) => [...prev, {
            kind: 'draw', id: nextId(), path: currentPath.current,
            color: drawColor, strokeWidth: 1.2,
          }]);
        }
        currentPath.current = '';
        setLivePath(null);
      },
    }),
  ).current;

  const undoLastStroke = () => {
    setOverlays((prev) => {
      const idx = [...prev].reverse().findIndex((o) => o.kind === 'draw');
      if (idx === -1) return prev;
      const realIdx = prev.length - 1 - idx;
      return prev.filter((_, i) => i !== realIdx);
    });
  };

  // ── Voix off ─────────────────────────────────────────────────────────────
  const startVoice = async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') return;
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    recordingRef.current = recording;
    setIsRecording(true);
    setRecSeconds(0);
    recTimerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
  };

  const stopVoice = async () => {
    if (!recordingRef.current) return;
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    setIsRecording(false);
    await recordingRef.current.stopAndUnloadAsync();
    const rec = recordingRef.current.getURI();
    recordingRef.current = null;
    if (rec) setVoiceUri(rec);
  };

  const previewVoice = async () => {
    if (!voiceUri) return;
    try {
      const { sound } = await Audio.Sound.createAsync({ uri: voiceUri }, { shouldPlay: true });
      voiceSoundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((st) => {
        if ('didJustFinish' in st && st.didJustFinish) void sound.unloadAsync();
      });
    } catch {}
  };

  const done = () => {
    // `overlays` est déjà l'état à jour ici — pas besoin de passer par le
    // "reducer" de setOverlays juste pour le lire. Appeler onDone() (qui
    // déclenche un setState du PARENT) depuis l'intérieur d'un updater de
    // setOverlays revient à modifier un composant pendant le rendu d'un
    // autre : React refuse, avec « Cannot update a component while
    // rendering a different component ».
    onDone({ overlays, videoMuted, voiceTrackUri: voiceUri, music });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View
          style={styles.stage}
          onLayout={(e) => { size.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height }; }}
        >
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />

          {/* Dessins déjà posés + trait en cours */}
          <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none" pointerEvents="none">
            {overlays.filter((o): o is Extract<PostOverlay, { kind: 'draw' }> => o.kind === 'draw').map((o) => (
              <Path key={o.id} d={o.path} stroke={o.color} strokeWidth={o.strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            ))}
            {livePath && (
              <Path d={livePath} stroke={drawColor} strokeWidth={1.2} fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            )}
          </Svg>

          {/* Zone tactile de dessin — capte les traits uniquement en mode "draw" */}
          {tool === 'draw' && <View style={StyleSheet.absoluteFill} {...drawResponder.panHandlers} />}

          {/* Textes déplaçables */}
          {tool !== 'draw' && overlays
            .filter((o): o is Extract<PostOverlay, { kind: 'text' }> => o.kind === 'text')
            .map((o) => (
              <DraggableText
                key={o.id}
                overlay={o}
                container={size}
                selected={selectedId === o.id}
                onSelect={() => setSelectedId(o.id)}
                onChange={(patch) => updateOverlay(o.id, patch)}
                onRemove={() => removeOverlay(o.id)}
              />
            ))}
        </View>

        {/* Barre du haut */}
        <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
          <Pressable onPress={onClose} style={styles.topBtn}>
            <Text style={styles.topBtnTxt}>✕</Text>
          </Pressable>
          {tool === 'draw' ? (
            <View style={styles.drawBar}>
              {COLORS.map((c) => (
                <Pressable key={c} onPress={() => setDrawColor(c)} style={[styles.colorDot, { backgroundColor: c }, drawColor === c && styles.colorDotActive]} />
              ))}
              <Pressable onPress={undoLastStroke} style={styles.topBtn}><Text style={styles.topBtnTxt}>↩︎</Text></Pressable>
              <Pressable onPress={() => setTool('none')} style={styles.doneSmallBtn}><Text style={styles.doneSmallTxt}>OK</Text></Pressable>
            </View>
          ) : (
            <Pressable onPress={done} style={styles.doneBtn}>
              <Text style={styles.doneTxt}>{t('ve_done')}</Text>
            </Pressable>
          )}
        </View>

        {/* Barre d'icônes à droite, façon CapCut */}
        {tool !== 'draw' && (
          <View style={[styles.rail, { top: insets.top + 60 }]}>
            <RailIcon icon="✏️" label={t('ve_rail_text')} onPress={() => setTextInputVisible(true)} />
            <RailIcon icon="🖊️" label={t('ve_rail_draw')} onPress={() => setTool('draw')} />
            <RailIcon icon="🎵" label={t('ve_rail_music')} onPress={() => setMusicModalVisible(true)} active={!!music} />
            <RailIcon
              icon={videoMuted ? '🔇' : '🔊'}
              label={t('ve_rail_sound')}
              onPress={() => {
                setVideoMuted((v) => { player.muted = !v; return !v; });
              }}
              active={videoMuted}
            />
            <RailIcon
              icon={voiceUri ? '🎙️' : '🎤'}
              label={t('ve_rail_voiceover')}
              onPress={() => (isRecording ? void stopVoice() : voiceUri ? void previewVoice() : void startVoice())}
              active={!!voiceUri || isRecording}
            />
            {voiceUri && (
              <RailIcon icon="✕" label={t('ve_rail_remove')} onPress={() => setVoiceUri(null)} />
            )}
          </View>
        )}

        {isRecording && (
          <View style={styles.recBanner}>
            <View style={styles.recDot} />
            <Text style={styles.recTxt}>{t('ve_recording').replace('{s}', String(recSeconds))}</Text>
            <Pressable onPress={() => void stopVoice()} style={styles.recStop}>
              <Text style={styles.recStopTxt}>{t('ve_stop')}</Text>
            </Pressable>
          </View>
        )}

        {selectedId && tool !== 'draw' && (
          <Pressable style={styles.deleteZone} onPress={() => removeOverlay(selectedId)}>
            <Text style={styles.deleteZoneTxt}>{t('ve_delete_selected_text')}</Text>
          </Pressable>
        )}
      </View>

      {/* Saisie du texte à ajouter */}
      <Modal visible={textInputVisible} transparent animationType="fade" onRequestClose={() => setTextInputVisible(false)}>
        <Pressable style={styles.textBackdrop} onPress={() => setTextInputVisible(false)}>
          <Pressable style={styles.textCard} onPress={() => undefined}>
            <TextInput
              style={styles.textInput}
              placeholder={t('ve_text_placeholder')}
              placeholderTextColor={colors.textMuted}
              value={textDraft}
              onChangeText={setTextDraft}
              autoFocus
              maxLength={80}
            />
            <View style={styles.textColors}>
              {COLORS.map((c) => (
                <Pressable key={c} onPress={() => setDrawColor(c)} style={[styles.colorDot, { backgroundColor: c }, drawColor === c && styles.colorDotActive]} />
              ))}
            </View>
            <Pressable style={styles.textAddBtn} onPress={addText}>
              <Text style={styles.textAddTxt}>{t('ve_add')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <MusicPickerModal
        visible={musicModalVisible}
        onClose={() => setMusicModalVisible(false)}
        onSelect={(track) => setMusic(track)}
        accessToken={accessToken}
        // Pas de découpage manuel pour une vidéo : sa durée audible est fixée
        // par la vidéo elle-même (la musique redémarre à chaque bouclage).
        allowTrim={false}
      />
    </Modal>
  );
}

// ── Texte déplaçable ─────────────────────────────────────────────────────────

function DraggableText({
  overlay, container, selected, onSelect, onChange, onRemove,
}: {
  overlay: Extract<PostOverlay, { kind: 'text' }>;
  container: { current: { width: number; height: number } };
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<PostOverlay>) => void;
  onRemove: () => void;
}) {
  const pan = useRef(new Animated.ValueXY({
    x: (overlay.x / 100) * container.current.width,
    y: (overlay.y / 100) * container.current.height,
  })).current;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        onSelect();
        // Lecture directe de la valeur courante : c'est l'idiome standard de
        // l'API Animated pour repartir de la position actuelle sans à-coup —
        // il n'existe pas d'accesseur public équivalent.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cur = pan as any;
        pan.setOffset({ x: cur.x._value, y: cur.y._value });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cur = pan as any;
        const w = container.current.width || 1;
        const h = container.current.height || 1;
        const x = Math.min(100, Math.max(0, (cur.x._value / w) * 100));
        const y = Math.min(100, Math.max(0, (cur.y._value / h) * 100));
        onChange({ x, y });
      },
    }),
  ).current;

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        styles.dragText,
        selected && styles.dragTextSelected,
        { transform: pan.getTranslateTransform() },
      ]}
    >
      <Text style={{ color: overlay.color, fontSize: overlay.fontSize, fontWeight: '700' }}>
        {overlay.text}
      </Text>
    </Animated.View>
  );
}

function RailIcon({
  icon, label, onPress, active,
}: {
  icon: string; label: string; onPress: () => void; active?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={styles.railItem}>
      <View style={[styles.railIconWrap, active && styles.railIconWrapActive]}>
        <Text style={styles.railIconTxt}>{icon}</Text>
      </View>
      <Text style={styles.railLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  stage: { flex: 1, position: 'relative', overflow: 'hidden' },

  topBar: {
    position: 'absolute', left: spacing.md, right: spacing.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  topBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  topBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  doneBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 9 },
  doneTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  doneSmallBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
  doneSmallTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },

  drawBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 6 },
  colorDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: 'transparent' },
  colorDotActive: { borderColor: '#fff' },

  rail: {
    position: 'absolute', right: spacing.sm, gap: spacing.md, alignItems: 'center',
  },
  railItem: { alignItems: 'center', gap: 3 },
  railIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  railIconWrapActive: { backgroundColor: colors.brand },
  railIconTxt: { fontSize: 18 },
  railLabel: { color: '#fff', fontSize: 10, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 3 },

  dragText: {
    position: 'absolute', padding: 6, borderRadius: radius.sm,
  },
  dragTextSelected: { borderWidth: 1.5, borderColor: colors.brand, borderStyle: 'dashed' },

  recBanner: {
    position: 'absolute', bottom: 100, left: spacing.md, right: spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: radius.lg, padding: spacing.sm,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  recTxt: { color: '#fff', flex: 1, fontSize: 13, fontWeight: '600' },
  recStop: { backgroundColor: colors.danger, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  recStopTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },

  deleteZone: {
    position: 'absolute', bottom: 40, alignSelf: 'center',
    backgroundColor: 'rgba(229,72,77,0.85)', borderRadius: radius.pill,
    paddingHorizontal: 16, paddingVertical: 9,
  },
  deleteZoneTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },

  textBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  textCard: {
    width: '85%', backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  textInput: { ...typography.body, color: colors.textPrimary, fontSize: 18, paddingVertical: 8 },
  textColors: { flexDirection: 'row', gap: spacing.sm },
  textAddBtn: { backgroundColor: colors.brand, borderRadius: radius.md, alignItems: 'center', paddingVertical: 12 },
  textAddTxt: { color: '#fff', fontWeight: '700' },
});
