import { useEffect, useRef, useState } from 'react';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Image } from 'expo-image';
import { Animated, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { PostOverlays } from './PostOverlays';
import type { PostOverlay } from '../lib/feed-api';
import { watchPlayerErrors } from '../lib/video-debug';
import { epochSource, useMediaEpoch } from '../lib/media-epoch';

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
  // Opacité du poster : fondu doux vers la vidéo au lieu d'un changement
  // brutal (qui se voyait comme un "saut" une fois le flash noir supprimé).
  const posterOpacity = useRef(new Animated.Value(1)).current;
  const voiceSoundRef = useRef<AudioPlayer | null>(null);
  /**
   * Pause demandée par un appui : le garde-fou ci-dessous ne doit pas la
   * défaire. Elle ne « colle » pas au défilement — quitter puis revenir sur
   * la vidéo la relance, comme dans les reels.
   */
  const manuallyPaused = useRef(false);

  // Après une réinitialisation du service média d'iOS, la source change et
  // le lecteur natif est recréé (cf. lib/media-epoch.ts).
  const mediaEpoch = useMediaEpoch();
  const player = useVideoPlayer(epochSource(uri, mediaEpoch), (p) => {
    p.loop = true;
    p.muted = videoMuted;
    p.audioMixingMode = 'doNotMix';
    if (active) p.play();
  });

  // Une erreur de lecteur peut signifier que le service média d'iOS a été
  // réinitialisé : tous les lecteurs sont alors à recréer (lib/media-epoch.ts).
  useEffect(() => watchPlayerErrors(player, 'PostVideo'), [player]);

  // La première image RÉELLEMENT peinte dans la vue, signalée par VideoView.
  // `readyToPlay` ne suffit pas : le lecteur se dit prêt, puis va chercher la
  // position demandée (`startAtSec`, reprise) avant d'afficher quoi que ce
  // soit — sa vue est noire entre-temps. Mesuré : 0,8 s de noir.
  const [firstFrame, setFirstFrame] = useState(false);

  // Le poster reste tant que la vidéo n'est pas à la fois ACTIVE et
  // peinte. Repli : si la vue ne signale jamais de première image, on se
  // rabat sur readyToPlay + 1,5 s plutôt que de garder le poster pour
  // toujours.
  useEffect(() => {
    if (!active) { setReady(false); return undefined; }
    if (firstFrame) { setReady(true); return undefined; }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fallback = () => { if (!timer) timer = setTimeout(() => setReady(true), 1500); };
    if (player.status === 'readyToPlay') fallback();
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') fallback();
    });
    return () => { sub.remove(); if (timer) clearTimeout(timer); };
  }, [player, active, firstFrame]);

  // Fondu du poster synchronisé sur `ready` — remplace le changement instantané
  // (poster affiché/retiré d'un coup) par une transition douce vers la vidéo.
  useEffect(() => {
    if (ready) {
      Animated.timing(posterOpacity, { toValue: 0, duration: 80, useNativeDriver: true }).start();
    } else {
      posterOpacity.stopAnimation();
      posterOpacity.setValue(1);
    }
  }, [ready, posterOpacity]);

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
      void voiceSoundRef.current?.seekTo(0).catch(() => null);
      onLoop?.();
    });
    return () => sub.remove();
  }, [player, onLoop]);

  // La voix off suit aussi la pause manuelle (tap) — même son chargé, juste
  // suspendu, pas de rechargement contrairement à l'effet actif/inactif ci-dessous.
  useEffect(() => {
    if (playing) voiceSoundRef.current?.play();
    else voiceSoundRef.current?.pause();
  }, [playing]);

  /**
   * Lecture automatique de la publication regardée.
   *
   * `play()` reçu avant que le lecteur soit `readyToPlay` est ignoré EN
   * SILENCE par expo-video : au swipe, la vidéo suivante est encore en
   * chargement, la commande se perd, et l'image restait figée — il fallait
   * appuyer pour la lancer. On relance donc dès qu'elle est prête, et un
   * garde-fou périodique rattrape toute lecture perdue tant que la vidéo est
   * affichée : le statut peut repasser par un rechargement de tampon bien
   * après le premier `readyToPlay`.
   *
   * Ce garde-fou avait été retiré par erreur en même temps que le tampon
   * raccourci (`SHORT_VIDEO_BUFFER`), qui était, lui, la vraie cause des
   * vidéos qui ne démarraient plus du tout. Il est sans danger : `resume()`
   * ne fait rien si la vidéo joue déjà, ou si un appui a demandé la pause.
   */
  useEffect(() => {
    manuallyPaused.current = false;
    if (!active) {
      player.pause();
      return undefined;
    }
    player.play();
    const resume = () => {
      if (!manuallyPaused.current && player.status === 'readyToPlay' && !player.playing) player.play();
    };
    const sub = player.addListener('statusChange', resume);
    const watchdog = setInterval(resume, 400);
    return () => { sub.remove(); clearInterval(watchdog); };
  }, [active, player]);

  // La voix off suit l'activité de la vidéo — chargée/déchargée à chaque
  // passage actif/inactif, comme la musique des reels (lib/reels.tsx).
  useEffect(() => {
    if (!voiceTrackUrl) return;
    let created: AudioPlayer | null = null;

    if (active) {
      const load = async () => {
        try {
          await setAudioModeAsync({ playsInSilentMode: true });
          const p = createAudioPlayer(voiceTrackUrl);
          p.loop = true;
          p.play();
          created = p;
          voiceSoundRef.current = p;
        } catch {
          // best-effort — une voix off manquante ne doit pas casser la vidéo
        }
      };
      void load();
    } else {
      voiceSoundRef.current?.pause();
      voiceSoundRef.current?.remove();
      voiceSoundRef.current = null;
    }

    return () => {
      created?.pause();
      created?.remove();
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
    if (player.playing) {
      manuallyPaused.current = true;
      player.pause();
    } else {
      manuallyPaused.current = false;
      player.play();
    }
    flashIcon();
  };

  return (
    <View style={style}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        onFirstFrameRender={() => setFirstFrame(true)}
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
          ne sert à rien. Fond neutre en repli quand il n'y a pas de miniature
          (vidéos publiées avant l'ajout des miniatures auto) : sans lui, le
          lecteur affichait son noir brut pendant le chargement, en scroll.
          Toujours montée (pas de montage/démontage conditionnel) et animée en
          opacité : un fondu doux plutôt qu'un changement brutal, qui se
          voyait comme un "saut" une fois le flash noir déjà supprimé. */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: posterOpacity }]} pointerEvents="none">
        {posterUri
          ? <Image source={{ uri: posterUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          : <View style={[StyleSheet.absoluteFill, styles.fallbackBg]} />}
      </Animated.View>
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
  // Repli quand il n'y a pas de miniature — un gris neutre est bien moins
  // brutal visuellement qu'un flash de noir pur pendant le scroll.
  fallbackBg: { backgroundColor: '#1c1c1e' },
  iconWrap: {
    ...StyleSheet.absoluteFill,
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
