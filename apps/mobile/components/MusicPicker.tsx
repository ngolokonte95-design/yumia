/**
 * Sélecteur de musique — iTunes (Apple Music) + Deezer.
 * Aucune clé API requise : les deux sources sont publiques et gratuites.
 * Previews 30 secondes pour chaque source.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, FlatList, Image, Modal,
  PanResponder, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Audio } from 'expo-av';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';

const PREVIEW_S = 30;
const WAVEFORM_W = 288;
const WAVEFORM_H = 72;
const BAR_COUNT = 52;

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

function ClipSelector({
  track, onConfirm, onBack,
}: {
  track: SearchResult;
  onConfirm: (startMs: number, durationMs: number) => void | Promise<void>;
  onBack: () => void;
}) {
  const [clipSec, setClipSec] = useState(15);
  const [startSec, setStartSec] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const animX = useRef(new Animated.Value(0)).current;
  const offsetRef = useRef(0);
  const maxXRef = useRef(0);
  const startSecRef = useRef(0);
  const bars = useMemo(() => generateBars(track.id), [track.id]);
  const winW = (clipSec / PREVIEW_S) * WAVEFORM_W;

  useEffect(() => {
    maxXRef.current = Math.max(0, WAVEFORM_W - winW);
    const clamped = Math.min(offsetRef.current, maxXRef.current);
    offsetRef.current = clamped;
    animX.setValue(clamped);
    const sec = Math.round((clamped / WAVEFORM_W) * PREVIEW_S);
    startSecRef.current = sec;
    setStartSec(sec);
  }, [clipSec, winW, animX]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        const x = Math.max(0, Math.min(maxXRef.current, offsetRef.current + g.dx));
        animX.setValue(x);
      },
      onPanResponderRelease: (_, g) => {
        const x = Math.max(0, Math.min(maxXRef.current, offsetRef.current + g.dx));
        offsetRef.current = x;
        animX.setValue(x);
        const sec = Math.round((x / WAVEFORM_W) * PREVIEW_S);
        startSecRef.current = sec;
        setStartSec(sec);
        if (soundRef.current) void soundRef.current.setPositionAsync(sec * 1000);
      },
    }),
  ).current;

  const stopSound = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => null);
      await soundRef.current.unloadAsync().catch(() => null);
      soundRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(async () => {
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      if (isPlaying) {
        await soundRef.current?.pauseAsync();
        setIsPlaying(false);
        return;
      }
      if (soundRef.current) {
        await soundRef.current.playFromPositionAsync(startSecRef.current * 1000);
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
      setIsPlaying(true);
    } catch { setIsPlaying(false); }
  }, [isPlaying, track.previewUrl]);

  useEffect(() => () => { void stopSound(); }, [stopSound]);

  const handleConfirm = async () => {
    await stopSound();
    onConfirm(startSecRef.current * 1000, clipSec * 1000);
  };

  const endSec = Math.min(startSec + clipSec, PREVIEW_S);

  return (
    <View style={cs.container}>
      <View style={cs.header}>
        <Pressable onPress={() => { void stopSound(); onBack(); }}>
          <Text style={cs.back}>← Retour</Text>
        </Pressable>
        <Text style={cs.title}>Sélectionner un extrait</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={cs.trackRow}>
        <Image source={{ uri: track.artworkUrl }} style={cs.artwork} />
        <View style={{ flex: 1 }}>
          <Text style={cs.trackName} numberOfLines={1}>{track.trackName}</Text>
          <Text style={cs.artistName} numberOfLines={1}>{track.artistName}</Text>
        </View>
      </View>

      <View style={cs.durationRow}>
        {[10, 15, 30].map((d) => (
          <Pressable key={d} style={[cs.chip, clipSec === d && cs.chipActive]} onPress={() => setClipSec(d)}>
            <Text style={[cs.chipTxt, clipSec === d && cs.chipTxtActive]}>{d}s</Text>
          </Pressable>
        ))}
      </View>

      {/* Waveform */}
      <View style={cs.waveContainer}>
        <View style={cs.barsRow}>
          {bars.map((h, i) => (
            <View key={i} style={[cs.bar, { height: (h / 96) * WAVEFORM_H, opacity: 0.35 }]} />
          ))}
        </View>
        <Animated.View
          style={[cs.selWindow, { width: winW, transform: [{ translateX: animX }] }]}
          {...panResponder.panHandlers}
        >
          <View style={cs.barsRowOverlay}>
            {bars.map((h, i) => {
              const bx = (i / BAR_COUNT) * WAVEFORM_W;
              if (bx > winW) return null;
              return <View key={i} style={[cs.bar, { height: (h / 96) * WAVEFORM_H, backgroundColor: '#fff' }]} />;
            })}
          </View>
          <View style={cs.handle} />
          <View style={[cs.handle, { right: 0, left: undefined }]} />
        </Animated.View>
      </View>

      <View style={cs.timerRow}>
        <Text style={cs.timer}>{fmtSec(startSec)}</Text>
        <Text style={cs.timerSep}>—</Text>
        <Text style={cs.timer}>{fmtSec(endSec)}</Text>
      </View>

      <Pressable style={cs.playBtn} onPress={() => void togglePlay()}>
        <Text style={cs.playBtnTxt}>{isPlaying ? '⏸ Pause' : '▶ Écouter l\'extrait'}</Text>
      </Pressable>

      <Pressable style={cs.confirmBtn} onPress={() => void handleConfirm()}>
        <Text style={cs.confirmTxt}>✓ Utiliser cet extrait ({clipSec}s)</Text>
      </Pressable>
    </View>
  );
}

// ── Modale principale ─────────────────────────────────────────────────────────

export function MusicPickerModal({
  visible, onClose, onSelect, accessToken,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (track: MusicTrack) => void;
  accessToken?: string | null;
}) {
  const [phase, setPhase] = useState<'search' | 'clip'>('search');
  const [source, setSource] = useState<SourceTab>('deezer');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState<SearchResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setPhase('search'); setQuery(''); setResults([]); setPending(null); setUploading(false);
    }
  }, [visible]);

  useEffect(() => {
    setResults([]);
  }, [source]);

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

  const handleConfirm = async (startMs: number, durationMs: number) => {
    if (!pending) return;
    let finalPreviewUrl = pending.previewUrl;
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
          body: JSON.stringify({ url: pending.previewUrl }),
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
          'Musique indisponible',
          "Impossible d'enregistrer cet extrait pour l'instant. Réessaie dans un moment.",
        );
        return;
      }
    }
    onSelect({
      title: pending.trackName,
      artist: pending.artistName,
      artworkUrl: pending.artworkUrl,
      previewUrl: finalPreviewUrl,
      startMs,
      durationMs,
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {phase === 'clip' && pending ? (
        uploading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <ActivityIndicator color={colors.brand} size="large" />
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>Enregistrement de la musique…</Text>
          </View>
        ) : (
          <ClipSelector track={pending} onConfirm={handleConfirm} onBack={() => setPhase('search')} />
        )
      ) : (
        <View style={ms.container}>
          <View style={ms.header}>
            <Text style={ms.title}>🎵 Choisir une musique</Text>
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
              placeholder="Rechercher un titre, un artiste..."
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
                <View style={ms.empty}><Text style={ms.emptyText}>Aucun résultat pour « {query} »</Text></View>
              ) : !query.trim() ? (
                <View style={ms.empty}>
                  <Text style={ms.emptyEmoji}>🎧</Text>
                  <Text style={ms.emptyText}>Tape le nom d'une chanson ou d'un artiste</Text>
                  <Text style={ms.emptyHint}>
                    {source === 'deezer' ? 'Deezer · ~90 millions de titres' : 'Apple Music · ~100 millions de titres'}
                  </Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <Pressable style={ms.trackRow} onPress={() => { setPending(item); setPhase('clip'); }}>
                <Image source={{ uri: item.artworkUrl }} style={ms.artwork} />
                <View style={{ flex: 1 }}>
                  <Text style={ms.trackName} numberOfLines={1}>{item.trackName}</Text>
                  <Text style={ms.artistName} numberOfLines={1}>{item.artistName}</Text>
                </View>
                <Text style={{ fontSize: 18, color: colors.textMuted }}>›</Text>
              </Pressable>
            )}
          />
        </View>
      )}
    </Modal>
  );
}

// ── Styles clip selector ──────────────────────────────────────────────────────

const cs = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { color: colors.brand, fontSize: 16 },
  title: { ...typography.h3, color: colors.text },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  artwork: { width: 56, height: 56, borderRadius: 8 },
  trackName: { fontSize: 15, color: colors.text, fontWeight: '700' },
  artistName: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  durationRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  chip: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { borderColor: colors.brand, backgroundColor: colors.brand + '22' },
  chipTxt: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
  chipTxtActive: { color: colors.brand },
  waveContainer: { width: WAVEFORM_W, height: WAVEFORM_H, backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden', alignSelf: 'center', marginBottom: 12 },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', height: WAVEFORM_H, gap: 2, paddingHorizontal: 2 },
  barsRowOverlay: { position: 'absolute', flexDirection: 'row', alignItems: 'flex-end', height: WAVEFORM_H, gap: 2, paddingHorizontal: 2 },
  bar: { width: (WAVEFORM_W - BAR_COUNT * 2) / BAR_COUNT, backgroundColor: colors.textMuted, borderRadius: 2 },
  selWindow: { position: 'absolute', top: 0, left: 0, height: WAVEFORM_H, backgroundColor: colors.brand + '44', borderWidth: 2, borderColor: colors.brand, borderRadius: 4, overflow: 'hidden' },
  handle: { position: 'absolute', top: 0, left: 0, width: 4, height: WAVEFORM_H, backgroundColor: colors.brand },
  timerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 24 },
  timer: { fontSize: 16, color: colors.text, fontWeight: '600', fontVariant: ['tabular-nums'] },
  timerSep: { fontSize: 14, color: colors.textMuted },
  playBtn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.xl, paddingVertical: 12, alignItems: 'center', marginBottom: 12 },
  playBtnTxt: { color: colors.brand, fontWeight: '700', fontSize: 15 },
  confirmBtn: { backgroundColor: colors.brand, borderRadius: radius.xl, paddingVertical: 14, alignItems: 'center' },
  confirmTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
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
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  artwork: { width: 50, height: 50, borderRadius: 6 },
  trackName: { fontSize: 14, color: colors.text, fontWeight: '600' },
  artistName: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  emptyHint: { fontSize: 12, color: colors.textMuted + '99', marginTop: 6, textAlign: 'center' },
});
