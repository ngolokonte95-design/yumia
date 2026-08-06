import { useEffect, useRef, useState } from 'react';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Animated, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Audio } from 'expo-av';
import { PostOverlays } from './PostOverlays';
import type { PostOverlay } from '../lib/feed-api';

/**
 * Lecteur vidéo inline pour le feed. Son activé par défaut (contrôlé par le
 * volume du téléphone), boucle, autoplay sans bouton play visible (façon
 * Instagram). Tap au centre = pause/lecture, avec icône qui flashe brièvement.
 * `uri` doit être une URL http(s) accessible.
 */
export function PostVideo({
  uri, style, active = true, onExpand, overlays, videoMuted = false, voiceTrackUrl,
}: {
  uri: string;
  style?: ViewStyle;
  active?: boolean;
  onExpand?: (currentTime: number) => void;
  /** Texte et dessins superposés, choisis par l'auteur à la publication. */
  overlays?: PostOverlay[] | null;
  /**
   * Son de la vidéo coupé — choix de l'auteur, irréversible pour le
   * spectateur (différent du tap-pour-pause, qui contrôle la lecture).
   */
  videoMuted?: boolean;
  /** Voix off enregistrée, jouée en parallèle de la vidéo. */
  voiceTrackUrl?: string | null;
}) {
  const [playing, setPlaying] = useState(true);
  const [showIcon, setShowIcon] = useState(false);
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const voiceSoundRef = useRef<Audio.Sound | null>(null);

  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = videoMuted;
    p.audioMixingMode = 'doNotMix';
    if (active) p.play();
  });

  useEffect(() => {
    const sub = player.addListener('playingChange', ({ isPlaying }) => setPlaying(isPlaying));
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);

  // La voix off suit l'activité de la vidéo — chargée/déchargée à chaque
  // passage actif/inactif, comme la musique des reels (lib/reels.tsx).
  useEffect(() => {
    if (!voiceTrackUrl) return;
    let sound: Audio.Sound | null = null;

    if (active) {
      const load = async () => {
        try {
          await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
          const { sound: s } = await Audio.Sound.createAsync(
            { uri: voiceTrackUrl },
            { shouldPlay: true, isLooping: true },
          );
          sound = s;
          voiceSoundRef.current = s;
        } catch {
          // best-effort — une voix off manquante ne doit pas casser la vidéo
        }
      };
      void load();
    } else {
      voiceSoundRef.current?.stopAsync().catch(() => null);
      voiceSoundRef.current?.unloadAsync().catch(() => null);
      voiceSoundRef.current = null;
    }

    return () => {
      sound?.stopAsync().catch(() => null);
      sound?.unloadAsync().catch(() => null);
      voiceSoundRef.current = null;
    };
  }, [active, voiceTrackUrl]);

  const flashIcon = () => {
    setShowIcon(true);
    iconOpacity.stopAnimation();
    iconOpacity.setValue(1);
    Animated.timing(iconOpacity, {
      toValue: 0, duration: 450, delay: 350, useNativeDriver: true,
    }).start(({ finished }) => { if (finished) setShowIcon(false); });
  };

  const toggle = () => {
    if (player.playing) player.pause(); else player.play();
    flashIcon();
  };

  return (
    <View style={style}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      <PostOverlays overlays={overlays} />
      <Pressable style={StyleSheet.absoluteFill} onPress={toggle} />
      {onExpand && (
        <Pressable style={styles.expandBtn} onPress={() => onExpand(player.currentTime ?? 0)} hitSlop={10}>
          <Text style={styles.expandIcon}>⤢</Text>
        </Pressable>
      )}
      {showIcon && (
        <Animated.View style={[styles.iconWrap, { opacity: iconOpacity }]} pointerEvents="none">
          <View style={styles.iconCircle}>
            <Text style={styles.icon}>{playing ? '⏸' : '▶'}</Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  iconCircle: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  icon: { fontSize: 26, color: '#fff' },
  expandBtn: {
    position: 'absolute', top: 10, right: 10,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  expandIcon: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
