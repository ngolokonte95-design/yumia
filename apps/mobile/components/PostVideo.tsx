import { useEffect, useRef, useState } from 'react';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Image } from 'expo-image';
import { Animated, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
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
  uri, style, active = true, onExpand, overlays, videoMuted = false, voiceTrackUrl, onPlayingChange, onLoop, posterUri,
}: {
  uri: string;
  style?: ViewStyle;
  active?: boolean;
  onExpand?: (currentTime: number) => void;
  /**
   * Image affichée derrière le lecteur tant que la première image de la
   * vidéo n'est pas prête — masque le flash noir au (re)montage (Android :
   * le lecteur est démonté/remonté à chaque changement de post actif, cf.
   * social.tsx/reels.tsx).
   */
  posterUri?: string | null;
  /** Texte et dessins superposés, choisis par l'auteur à la publication. */
  overlays?: PostOverlay[] | null;
  /**
   * Son de la vidéo coupé — choix de l'auteur, irréversible pour le
   * spectateur (différent du tap-pour-pause, qui contrôle la lecture).
   */
  videoMuted?: boolean;
  /** Voix off enregistrée, jouée en parallèle de la vidéo. */
  voiceTrackUrl?: string | null;
  /**
   * Prévient l'écran parent d'un tap pause/lecture — nécessaire pour la
   * musique du post, qui vit hors de ce composant (chargée par le fil pour
   * suivre le défilement) : sans ce callback, mettre la vidéo en pause ne
   * mettait pas la musique en pause, les deux continuaient indépendamment.
   */
  onPlayingChange?: (playing: boolean) => void;
  /**
   * Prévient l'écran parent à chaque bouclage de la vidéo (elle est en
   * lecture en boucle) — sert à faire redémarrer la musique du post en même
   * temps, sinon elle continue son propre cycle sans jamais se resynchroniser.
   */
  onLoop?: () => void;
}) {
  const [playing, setPlaying] = useState(true);
  const [showIcon, setShowIcon] = useState(false);
  const [ready, setReady] = useState(false);
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const voiceSoundRef = useRef<Audio.Sound | null>(null);

  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = videoMuted;
    p.audioMixingMode = 'doNotMix';
    if (active) p.play();
  });

  useEffect(() => {
    if (!posterUri) return;
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') setReady(true);
    });
    return () => sub.remove();
  }, [player, posterUri]);

  useEffect(() => {
    const sub = player.addListener('playingChange', ({ isPlaying }) => {
      setPlaying(isPlaying);
      onPlayingChange?.(isPlaying);
    });
    return () => sub.remove();
  }, [player, onPlayingChange]);

  // La vidéo boucle (`p.loop = true`) mais la musique/voix off, chargées à
  // part avec leur propre boucle, dérivaient au fil du temps — plus rien ne
  // les resynchronisait au redémarrage de la vidéo. `playToEnd` se déclenche
  // à chaque tour, boucle ou pas : on en profite pour tout remettre à zéro
  // ensemble, façon Story/Reel : la musique "dure" alors le temps de la vidéo.
  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      voiceSoundRef.current?.setPositionAsync(0).catch(() => null);
      onLoop?.();
    });
    return () => sub.remove();
  }, [player, onLoop]);

  // La voix off suit aussi la pause manuelle (tap) — même son chargé, juste
  // suspendu, pas de rechargement contrairement à l'effet actif/inactif ci-dessous.
  useEffect(() => {
    if (playing) voiceSoundRef.current?.playAsync().catch(() => null);
    else voiceSoundRef.current?.pauseAsync().catch(() => null);
  }, [playing]);

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
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        // Android : la SurfaceView par défaut ne se découpe pas toujours
        // proprement pendant un défilement rapide de liste, laissant une
        // vidéo "baver" par-dessus le contenu voisin le temps que le scroll
        // se stabilise. TextureView s'intègre correctement au rendu normal
        // des vues (léger coût de perf, sans impact ici : un seul lecteur
        // actif à la fois). Pas d'effet sur iOS (prop ignorée).
        {...(Platform.OS === 'android' ? { surfaceType: 'textureView' as const } : {})}
      />
      {/* Affichée PAR-DESSUS le lecteur (pas derrière) tant qu'il n'a pas de
          première image — sinon le rendu noir du lecteur la recouvre et elle
          ne sert à rien. */}
      {posterUri && !ready && (
        <Image source={{ uri: posterUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      )}
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
