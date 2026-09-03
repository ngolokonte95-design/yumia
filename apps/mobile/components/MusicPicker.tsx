/**
 * Sélecteur de musique — iTunes (Apple Music) + Deezer.
 * Aucune clé API requise : les deux sources sont publiques et gratuites.
 * Previews 30 secondes pour chaque source.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Easing, FlatList, Image, Modal,
  PanResponder, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Audio } from 'expo-av';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, spacing, typography } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';
import { useI18n } from '../lib/useI18n';

const PREVIEW_S = 30;
const WAVEFORM_W = 288;
const WAVEFORM_H = 72;
const BAR_COUNT = 52;
/** Largeur minimale de la fenêtre de sélection, en secondes puis en pixels. */
const MIN_CLIP_S = 3;
const MIN_WIN_PX = (MIN_CLIP_S / PREVIEW_S) * WAVEFORM_W;
/** Cible de saisie des poignées — plus large que le trait visuel, plus facile à attraper. */
const HANDLE_HIT_W = 26;

export interface MusicTrack {
  title: string;
  artist: string;
  artworkUrl: string;
  previewUrl: string;
  startMs: number;
  durationMs: number;
}

// ── Type unifié pour toutes les sources ─────────────────────────────────────

interface SearchResult {
  id: string;
  trackName: string;
  artistName: string;
  artworkUrl: string;
  previewUrl: string;
}

type SourceTab = 'itunes' | 'deezer';

// ── Fonctions de recherche ───────────────────────────────────────────────────

async function searchItunes(query: string): Promise<SearchResult[]> {
  const r = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=20&media=music`,
  );
  const d = await r.json() as {
    results: Array<{ trackId: number; trackName: string; artistName: string; artworkUrl100: string; previewUrl: string }>
  };
  return (d.results ?? [])
    .filter((t) => t.previewUrl)
    .map((t) => ({
      id: String(t.trackId),
      trackName: t.trackName,
      artistName: t.artistName,
      artworkUrl: t.artworkUrl100.replace('100x100', '300x300'),
      previewUrl: t.previewUrl,
    }));
}

async function searchDeezer(query: string): Promise<SearchResult[]> {
  const r = await fetch(
    `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=20`,
  );
  const d = await r.json() as {
    data?: Array<{
      id: number;
      title: string;
      artist: { name: string };
      album: { cover_medium: string };
      preview: string;
    }>
  };
  return (d.data ?? [])
    .filter((t) => t.preview)
    .map((t) => ({
      id: String(t.id),
      trackName: t.title,
      artistName: t.artist.name,
      artworkUrl: t.album.cover_medium,
      previewUrl: t.preview,
    }));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateBars(id: string): number[] {
  const seed = parseInt(id, 10) || id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const x = Math.abs(((seed * 48_271 + i * 16_807) >>> 0) % 80);
    return 16 + x;
  });
}

function fmtSec(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── Sélecteur de clip ─────────────────────────────────────────────────────────

/** Aperçu vidéo muet, en fond du sélecteur — juste un décor, pas de son ni de contrôle. */
function ClipBackdropVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = true; p.muted = true; p.play(); });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

function ClipSelector({
  track, onConfirm, onBack, mediaUri, mediaType,
}: {
  track: SearchResult;
  onConfirm: (startMs: number, durationMs: number) => void | Promise<void>;
  onBack: () => void;
  /** Aperçu de la publication en cours, affiché en fond — comme sur Instagram. */
  mediaUri?: string;
  mediaType?: 'photo' | 'video';
}) {
  const { t } = useI18n();
  // Bords gauche/droit de la fenêtre de sélection, en pixels le long du
  // waveform — chacun déplaçable indépendamment (au lieu de 3 durées figées),
  // pour choisir librement le début ET la longueur de l'extrait.
  const [leftX, setLeftX] = useState(0);
  const [rightX, setRightX] = useState((15 / PREVIEW_S) * WAVEFORM_W);
  const [isPlaying, setIsPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const bars = useMemo(() => generateBars(track.id), [track.id]);

  // Refs à jour à chaque rendu — lues depuis les callbacks de PanResponder
  // (qui, sans ça, ne verraient que les valeurs figées au premier rendu).
  const leftXRef = useRef(leftX);
  leftXRef.current = leftX;
  const rightXRef = useRef(rightX);
  rightXRef.current = rightX;
  const grantRef = useRef({ left: 0, right: 0 });

  const startSec = Math.round((leftX / WAVEFORM_W) * PREVIEW_S);
  const endSec = Math.round((rightX / WAVEFORM_W) * PREVIEW_S);
  const clipSec = Math.max(1, endSec - startSec);
  const startSecRef = useRef(startSec);
  startSecRef.current = startSec;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  // Curseur de lecture — un trait qui défile de gauche à droite pendant la
  // lecture, pour se repérer dans l'extrait choisi. Une simple animation
  // chronométrée sur la durée de l'extrait (pas un suivi de position audio
  // en direct, trop saccadé vu la fréquence des mises à jour d'expo-av).
  const [hasPlayed, setHasPlayed] = useState(false);
  const playheadAnim = useRef(new Animated.Value(0)).current;
  const playAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const stopPlayheadAnim = () => { playAnimRef.current?.stop(); };

  const animatePlayheadFrom = (fromX: number) => {
    stopPlayheadAnim();
    setHasPlayed(true);
    const remainingSec = Math.max(0, ((rightXRef.current - fromX) / WAVEFORM_W) * PREVIEW_S);
    playheadAnim.setValue(fromX);
    const anim = Animated.timing(playheadAnim, {
      toValue: rightXRef.current,
      duration: remainingSec * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    playAnimRef.current = anim;
    anim.start(({ finished }) => {
      // Arrivé au bout de la sélection : on arrête aussi le son, sinon il
      // continuerait à jouer au-delà de l'extrait pendant que le curseur,
      // lui, resterait figé au bord droit — incohérent avec ce qu'on montre.
      if (finished) {
        soundRef.current?.pauseAsync().catch(() => null);
        setIsPlaying(false);
      }
    });
  };

  const seekIfLoaded = (sec: number) => { if (soundRef.current) void soundRef.current.setPositionAsync(sec * 1000); };
  const reseekPlayhead = () => { if (isPlayingRef.current) animatePlayheadFrom(leftXRef.current); };

  // Glisser le corps de la fenêtre : déplace les deux bords ensemble, largeur inchangée.
  const bodyPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 2,
      onPanResponderGrant: () => { grantRef.current = { left: leftXRef.current, right: rightXRef.current }; },
      onPanResponderMove: (_, g) => {
        const width = grantRef.current.right - grantRef.current.left;
        const nl = Math.max(0, Math.min(WAVEFORM_W - width, grantRef.current.left + g.dx));
        setLeftX(nl);
        setRightX(nl + width);
      },
      onPanResponderRelease: () => {
        seekIfLoaded(Math.round((leftXRef.current / WAVEFORM_W) * PREVIEW_S));
        reseekPlayhead();
      },
    }),
  ).current;

  // Poignée gauche : déplace le début, la fin ne bouge pas.
  const leftPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { grantRef.current.left = leftXRef.current; },
      onPanResponderMove: (_, g) => {
        const nl = Math.max(0, Math.min(rightXRef.current - MIN_WIN_PX, grantRef.current.left + g.dx));
        setLeftX(nl);
      },
      onPanResponderRelease: () => {
        seekIfLoaded(Math.round((leftXRef.current / WAVEFORM_W) * PREVIEW_S));
        reseekPlayhead();
      },
    }),
  ).current;

  // Poignée droite : déplace la fin (donc la durée), le début ne bouge pas.
  const rightPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { grantRef.current.right = rightXRef.current; },
      onPanResponderMove: (_, g) => {
        const nr = Math.max(leftXRef.current + MIN_WIN_PX, Math.min(WAVEFORM_W, grantRef.current.right + g.dx));
        setRightX(nr);
      },
      onPanResponderRelease: reseekPlayhead,
    }),
  ).current;

  const stopSound = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => null);
      await soundRef.current.unloadAsync().catch(() => null);
      soundRef.current = null;
    }
    stopPlayheadAnim();
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(async () => {
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      if (isPlaying) {
        await soundRef.current?.pauseAsync();
        stopPlayheadAnim();
        setIsPlaying(false);
        return;
      }
      if (soundRef.current) {
        await soundRef.current.playFromPositionAsync(startSecRef.current * 1000);
        animatePlayheadFrom(leftXRef.current);
        setIsPlaying(true);
        return;
      }
      if (!track.previewUrl) return;
      const { sound } = await Audio.Sound.createAsync(
        { uri: track.previewUrl },
        { shouldPlay: true, positionMillis: startSecRef.current * 1000 },
      );
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((st) => { if (st.isLoaded && !st.isPlaying) setIsPlaying(false); });
      animatePlayheadFrom(leftXRef.current);
      setIsPlaying(true);
    } catch { setIsPlaying(false); }
  }, [isPlaying, track.previewUrl]);

  useEffect(() => () => { void stopSound(); }, [stopSound]);

  const handleConfirm = async () => {
    await stopSound();
    onConfirm(startSecRef.current * 1000, clipSec * 1000);
  };

  const winWidth = rightX - leftX;

  return (
    <View style={cs.container}>
      {/* Aperçu réel de la publication en fond, comme Instagram — pas juste un fond noir. */}
      {mediaType === 'video' && mediaUri ? (
        <ClipBackdropVideo uri={mediaUri} />
      ) : mediaUri ? (
        <Image source={{ uri: mediaUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}
      <View style={cs.scrim} />

      <View style={cs.header}>
        <Pressable onPress={() => { void stopSound(); onBack(); }} hitSlop={10}>
          <Text style={cs.cancelTxt}>{t('mp_cancel')}</Text>
        </Pressable>
        <Image source={{ uri: track.artworkUrl }} style={cs.headerArt} />
        <Pressable onPress={() => void handleConfirm()} hitSlop={10}>
          <Text style={cs.doneTxt}>{t('mp_done')}</Text>
        </Pressable>
      </View>

      <View style={cs.panel}>
        <View style={cs.trackRow}>
          <Image source={{ uri: track.artworkUrl }} style={cs.artwork} />
          <View style={{ flex: 1 }}>
            <Text style={cs.trackName} numberOfLines={1}>{track.trackName}</Text>
            <Text style={cs.artistName} numberOfLines={1}>{track.artistName}</Text>
          </View>
          <Pressable onPress={() => void togglePlay()} style={cs.playCircle} hitSlop={8}>
            <Text style={cs.playCircleTxt}>{isPlaying ? '⏸' : '▶'}</Text>
          </Pressable>
        </View>

        {/* Waveform en dégradé de marque — deux poignées indépendantes */}
        <View style={cs.waveContainer}>
          <View style={cs.barsRow}>
            {bars.map((h, i) => (
              <View key={i} style={[cs.bar, { height: (h / 96) * WAVEFORM_H, opacity: 0.3 }]} />
            ))}
          </View>

          <View style={[cs.selWindow, { left: leftX, width: winWidth }]}>
            <LinearGradient
              colors={gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={cs.barsRowOverlay} {...bodyPan.panHandlers}>
              {bars.map((h, i) => {
                const bx = (i / BAR_COUNT) * WAVEFORM_W;
                if (bx > winWidth) return null;
                return <View key={i} style={[cs.bar, { height: (h / 96) * WAVEFORM_H, backgroundColor: 'rgba(255,255,255,0.85)' }]} />;
              })}
            </View>
          </View>

          <View style={[cs.handleHit, { left: leftX - HANDLE_HIT_W / 2 }]} {...leftPan.panHandlers}>
            <View style={cs.handleBar} />
          </View>
          <View style={[cs.handleHit, { left: rightX - HANDLE_HIT_W / 2 }]} {...rightPan.panHandlers}>
            <View style={cs.handleBar} />
          </View>

          {/* Curseur de lecture — défile entre les deux bords pendant l'écoute. */}
          {hasPlayed && (
            <Animated.View pointerEvents="none" style={[cs.playhead, { left: playheadAnim }]} />
          )}
        </View>

        <View style={cs.timerRow}>
          <Text style={cs.timer}>{fmtSec(startSec)}</Text>
          <Text style={cs.timerSep}>—</Text>
          <Text style={cs.timer}>{fmtSec(endSec)}</Text>
          <Text style={cs.timerDuration}>{clipSec}s</Text>
        </View>
      </View>
    </View>
  );
}

// ── Modale principale ─────────────────────────────────────────────────────────

export function MusicPickerModal({
  visible, onClose, onSelect, accessToken, allowTrim = true, mediaUri, mediaType,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (track: MusicTrack) => void;
  accessToken?: string | null;
  /**
   * Étape de découpage (début/durée déplaçables librement) — pertinente pour
   * une photo, où la musique tourne en boucle pour la durée choisie. Pour une
   * vidéo, elle n'a plus de sens : la musique est maintenant resynchronisée
   * au bouclage de la vidéo elle-même (voir PostVideo/ReelVideo `onLoop`), sa
   * durée « dure » donc déjà le temps de la vidéo, pas un temps choisi à part.
   * `false` saute directement à l'extrait complet (30s).
   */
  allowTrim?: boolean;
  /** Aperçu de la publication en cours, affiché en fond de l'étape de découpage. */
  mediaUri?: string;
  mediaType?: 'photo' | 'video';
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<'search' | 'clip'>('search');
  const [source, setSource] = useState<SourceTab>('deezer');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState<SearchResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pré-écoute directement sur la liste, avant de choisir un morceau — un
  // Pressable dédié par ligne (bouton ▶/⏸), séparé du tap sur la ligne qui
  // sélectionne le morceau.
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const previewSoundRef = useRef<Audio.Sound | null>(null);

  const stopPreview = useCallback(async () => {
    if (previewSoundRef.current) {
      await previewSoundRef.current.stopAsync().catch(() => null);
      await previewSoundRef.current.unloadAsync().catch(() => null);
      previewSoundRef.current = null;
    }
    setPreviewingId(null);
  }, []);

  const togglePreview = useCallback(async (item: SearchResult) => {
    if (previewingId === item.id) { await stopPreview(); return; }
    await stopPreview();
    if (!item.previewUrl) return;
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: item.previewUrl }, { shouldPlay: true });
      previewSoundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((st) => {
        if (!st.isLoaded) { if (st.error) setPreviewingId(null); return; }
        if (!st.isPlaying && !st.isBuffering) setPreviewingId(null);
      });
      setPreviewingId(item.id);
    } catch { setPreviewingId(null); }
  }, [previewingId, stopPreview]);

  useEffect(() => () => { void stopPreview(); }, [stopPreview]);

  useEffect(() => {
    if (!visible) {
      setPhase('search'); setQuery(''); setResults([]); setPending(null); setUploading(false);
      void stopPreview();
    }
  }, [visible, stopPreview]);

  useEffect(() => {
    setResults([]);
    void stopPreview();
  }, [source, stopPreview]);

  useEffect(() => {
    if (timeout.current) clearTimeout(timeout.current);
    if (!query.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    timeout.current = setTimeout(async () => {
      try {
        const res = source === 'deezer'
          ? await searchDeezer(query)
          : await searchItunes(query);
        setResults(res);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 400);
  }, [query, source]);

  // Prend le morceau en paramètre explicite plutôt que de lire `pending` :
  // appelé juste après `setPending(item)` (sélection directe, sans étape de
  // découpage), l'état ne serait pas encore à jour dans cette même fonction.
  const confirmTrack = async (track: SearchResult, startMs: number, durationMs: number) => {
    let finalPreviewUrl = track.previewUrl;
    if (accessToken) {
      setUploading(true);
      let proxyOk = false;
      try {
        const resp = await fetch(`${API_BASE_URL}/posts/audio-proxy`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ url: track.previewUrl }),
        });
        if (resp.ok) {
          const json = await resp.json() as { url: string };
          finalPreviewUrl = json.url;
          proxyOk = true;
        }
      } catch { /* réseau KO */ }
      finally { setUploading(false); }
      // Sans URL permanente, la lecture échouera (le CDN bloque expo-av) :
      // on prévient plutôt que de stocker une piste injouable en silence.
      if (!proxyOk) {
        Alert.alert(
          t('mp_unavailable_title'),
          t('mp_unavailable_body'),
        );
        return;
      }
    }
    onSelect({
      title: track.trackName,
      artist: track.artistName,
      artworkUrl: track.artworkUrl,
      previewUrl: finalPreviewUrl,
      startMs,
      durationMs,
    });
    onClose();
  };

  const handleConfirm = async (startMs: number, durationMs: number) => {
    if (!pending) return;
    await confirmTrack(pending, startMs, durationMs);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {uploading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>{t('mp_saving')}</Text>
        </View>
      ) : phase === 'clip' && pending ? (
        <ClipSelector
          track={pending}
          onConfirm={handleConfirm}
          onBack={() => setPhase('search')}
          mediaUri={mediaUri}
          mediaType={mediaType}
        />
      ) : (
        <View style={ms.container}>
          <View style={ms.header}>
            <Text style={ms.title}>{t('mp_title')}</Text>
            <Pressable onPress={onClose}><Text style={ms.close}>✕</Text></Pressable>
          </View>

          {/* Onglets source */}
          <View style={ms.sourceTabs}>
            {(['itunes', 'deezer'] as SourceTab[]).map((s) => (
              <Pressable
                key={s}
                style={[ms.sourceTab, source === s && ms.sourceTabActive]}
                onPress={() => setSource(s)}
              >
                <Text style={[ms.sourceTabText, source === s && ms.sourceTabTextActive]}>
                  {s === 'itunes' ? '🍎 Apple Music' : '🟢 Deezer'}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={ms.searchRow}>
            <TextInput
              style={ms.searchInput}
              placeholder={t('mp_search_placeholder')}
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
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 40 }}
            ListEmptyComponent={
              query.trim() && !searching ? (
                <View style={ms.empty}><Text style={ms.emptyText}>{t('mp_no_results').replace('{query}', query)}</Text></View>
              ) : !query.trim() ? (
                <View style={ms.empty}>
                  <Text style={ms.emptyEmoji}>🎧</Text>
                  <Text style={ms.emptyText}>{t('mp_empty_hint')}</Text>
                  <Text style={ms.emptyHint}>
                    {source === 'deezer' ? t('mp_source_deezer') : t('mp_source_itunes')}
                  </Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <View style={ms.trackRow}>
                <Pressable
                  style={ms.trackRowMain}
                  onPress={() => {
                    void stopPreview();
                    if (allowTrim) { setPending(item); setPhase('clip'); return; }
                    void confirmTrack(item, 0, PREVIEW_S * 1000);
                  }}
                >
                  <Image source={{ uri: item.artworkUrl }} style={ms.artwork} />
                  <View style={{ flex: 1 }}>
                    <Text style={ms.trackName} numberOfLines={1}>{item.trackName}</Text>
                    <Text style={ms.artistName} numberOfLines={1}>{item.artistName}</Text>
                  </View>
                </Pressable>
                {item.previewUrl ? (
                  <Pressable onPress={() => void togglePreview(item)} style={ms.previewBtn} hitSlop={10}>
                    <Text style={ms.previewBtnTxt}>{previewingId === item.id ? '⏸' : '▶'}</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          />
        </View>
      )}
    </Modal>
  );
}

// ── Styles clip selector ──────────────────────────────────────────────────────

const cs = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  // Voile sombre entre le média de fond et les contrôles, pour la lisibilité.
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingTop: 54, paddingBottom: 14,
  },
  cancelTxt: { color: '#fff', fontSize: 15, fontWeight: '600' },
  doneTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  headerArt: { width: 34, height: 34, borderRadius: 6 },

  // Bandeau de contrôle en bas, sur fond semi-opaque — le média reste visible au-dessus.
  panel: {
    marginTop: 'auto',
    backgroundColor: 'rgba(12,12,16,0.82)',
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xl,
  },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: spacing.lg },
  artwork: { width: 48, height: 48, borderRadius: 8 },
  trackName: { fontSize: 15, color: '#fff', fontWeight: '700' },
  artistName: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  playCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center',
  },
  playCircleTxt: { color: '#fff', fontSize: 15 },

  waveContainer: { width: WAVEFORM_W, height: WAVEFORM_H, alignSelf: 'center', marginBottom: spacing.md },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', height: WAVEFORM_H, gap: 2, paddingHorizontal: 2 },
  barsRowOverlay: { flexDirection: 'row', alignItems: 'flex-end', height: WAVEFORM_H, gap: 2, paddingHorizontal: 2 },
  bar: { width: (WAVEFORM_W - BAR_COUNT * 2) / BAR_COUNT, backgroundColor: colors.textMuted, borderRadius: 2 },
  // Fenêtre de sélection — dégradé de marque en fond, bords déplaçables séparément.
  selWindow: { position: 'absolute', top: 0, height: WAVEFORM_H, borderRadius: 6, overflow: 'hidden' },
  handleHit: { position: 'absolute', top: 0, width: HANDLE_HIT_W, height: WAVEFORM_H, alignItems: 'center', justifyContent: 'center' },
  handleBar: { width: 4, height: WAVEFORM_H, borderRadius: 2, backgroundColor: '#fff' },
  playhead: {
    position: 'absolute', top: -4, width: 2, height: WAVEFORM_H + 8,
    backgroundColor: '#fff', borderRadius: 1,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 2, shadowOffset: { width: 0, height: 0 },
  },

  timerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  timer: { fontSize: 15, color: '#fff', fontWeight: '600', fontVariant: ['tabular-nums'] },
  timerSep: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  timerDuration: { fontSize: 13, color: colors.brandSoft, fontWeight: '700', marginLeft: 6 },
});

// ── Styles modale de recherche ────────────────────────────────────────────────

const ms = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { ...typography.h3, color: colors.text },
  close: { fontSize: 20, color: colors.textMuted, paddingHorizontal: 8 },
  sourceTabs: { flexDirection: 'row', marginHorizontal: spacing.md, marginTop: spacing.sm, marginBottom: 4, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 4 },
  sourceTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.md },
  sourceTabActive: { backgroundColor: colors.background },
  sourceTabText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  sourceTabTextActive: { color: colors.brand, fontWeight: '700' },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.md, marginVertical: spacing.sm },
  searchInput: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border },
  trackRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  trackRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  artwork: { width: 50, height: 50, borderRadius: 6 },
  trackName: { fontSize: 14, color: colors.text, fontWeight: '600' },
  artistName: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  previewBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  previewBtnTxt: { fontSize: 13, color: colors.brand },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  emptyHint: { fontSize: 12, color: colors.textMuted + '99', marginTop: 6, textAlign: 'center' },
});
