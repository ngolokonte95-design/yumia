import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import {
  ActivityIndicator, Animated, Dimensions, FlatList, PanResponder, Platform, Pressable,
  Share, StyleSheet, Text, View,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAuth } from '../lib/auth-context';
import { promptReport } from '../lib/report-content';
import { colors, radius, spacing } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';
import { feedApi, type FeedPost, type PostOverlay } from '../lib/feed-api';
import { PostOverlays } from '../components/PostOverlays';
import { CommentsSheet } from '../components/CommentsSheet';
import { useI18n } from '../lib/useI18n';
import { formatCount } from '../lib/format-count';
import { isVideoUrl } from '../lib/is-video-url';
import { SHORT_VIDEO_BUFFER } from '../lib/video-buffer';
import { watchPlayerErrors } from '../lib/video-debug';
import { epochSource, useMediaEpoch } from '../lib/media-epoch';
import { restorePlaybackAudio } from '../lib/audio-session';
import { TranslatableText } from '../components/TranslatableText';
import { FeatureTip } from '../components/FeatureTip';

/** Écart entre le bouton son et le bloc auteur/légende, en px. */
const MUTE_GAP = 12;

const { width: W, height: H } = Dimensions.get('window');
const API = API_BASE_URL;

type ReelTab = 'foryou' | 'following';

// ── Lecteur vidéo d'un seul reel ─────────────────────────────────────────────
function ReelVideo({
  uri, active, isCurrent, muted, progressAnim, startAtSec, overlays, onLoop, posterUri,
  seekRef, scrubbingRef, onReadyChange,
}: {
  uri: string;
  /** La vidéo doit jouer (reel regardé et non mis en pause). */
  active: boolean;
  /**
   * Ce reel est celui affiché, qu'il joue ou non.
   *
   * Distingue les deux raisons de ne pas jouer : mis en pause par un appui
   * (l'image doit rester là où on s'est arrêté), ou reel voisin (on précharge,
   * et le poster masque le lecteur).
   */
  isCurrent: boolean;
  muted: boolean;
  /** Avancement 0→1 de la lecture, piloté sans re-render (Animated.Value). */
  progressAnim: Animated.Value;
  /**
   * Rempli par ce composant : permet à la carte parente de déplacer la lecture
   * depuis la barre de progression, sans lui exposer le lecteur entier.
   */
  seekRef?: MutableRefObject<((ratio: number) => void) | null>;
  /**
   * Vrai pendant que le doigt déplace la barre. La position lue au lecteur ne
   * doit alors PAS écraser celle que le doigt impose, sinon la barre revient
   * en arrière à chaque rafraîchissement.
   */
  scrubbingRef?: MutableRefObject<boolean>;
  /**
   * Signale à la carte qu'une image est peinte (ou plus, au démontage). Elle
   * garde sa propre couverture par-dessus jusque-là, cf. `renderMedia`.
   */
  onReadyChange?: (ready: boolean) => void;
  /** Position de départ (continuité avec la lecture depuis le feed). */
  startAtSec?: number;
  /** Texte et dessins superposés à la publication d'origine. */
  overlays?: PostOverlay[] | null;
  /** La vidéo boucle — pour resynchroniser la musique/voix off du reel. */
  onLoop?: () => void;
  /** Cf. PostVideo — masque le flash noir au montage (Android : ce composant
   * n'est monté que pour le reel actif). */
  posterUri?: string | null;
}) {
  const [ready, setReady] = useState(false);
  // Cf. PostVideo.tsx : fondu doux du poster vers la vidéo, au lieu d'un
  // changement brutal (qui se voyait comme un "saut" une fois le flash noir
  // supprimé).
  const posterOpacity = useRef(new Animated.Value(1)).current;
  // Ref : la carte passe une fonction fléchée neuve à chaque rendu ; on ne
  // veut ni la mettre en dépendance, ni rappeler une version périmée.
  const onReadyChangeRef = useRef(onReadyChange);
  onReadyChangeRef.current = onReadyChange;
  useEffect(() => { onReadyChangeRef.current?.(ready); }, [ready]);
  useEffect(() => () => { onReadyChangeRef.current?.(false); }, []);
  // Après une réinitialisation du service média d'iOS, la source change et
  // le lecteur natif est recréé (cf. lib/media-epoch.ts).
  const mediaEpoch = useMediaEpoch();
  const player = useVideoPlayer(epochSource(uri, mediaEpoch), (p) => {
    p.loop = true;
    p.bufferOptions = SHORT_VIDEO_BUFFER;
    // Muet à la création : le préchargement ci-dessous fait jouer les reels
    // voisins quelques instants, et l'effet du son rétablit la valeur réelle
    // dès que ce reel devient celui qu'on regarde.
    p.muted = true;
    if (startAtSec) p.currentTime = startAtSec;
    // Démarrage muet et immédiat, même sur un reel pas encore affiché : c'est
    // ce qui remplit la mémoire tampon à l'avance. L'effet actif/inactif
    // ci-dessous remet en pause aussitôt s'il ne s'agit pas du reel regardé.
    // Sans ça, le téléchargement ne commençait qu'à l'arrivée sur la vidéo, et
    // les premières secondes se voyaient figées.
    p.play();
  });

  // Une erreur de lecteur peut signifier que le service média d'iOS a été
  // réinitialisé : tous les lecteurs sont alors à recréer (lib/media-epoch.ts).
  useEffect(() => watchPlayerErrors(player, 'ReelVideo'), [player]);

  // La première image RÉELLEMENT peinte dans la vue, signalée par VideoView.
  // `readyToPlay` ne suffit pas : le lecteur se dit prêt, puis va chercher la
  // position demandée (`startAtSec`, reprise) avant d'afficher quoi que ce
  // soit — sa vue est noire entre-temps. Mesuré : 0,8 s de noir.
  const [firstFrame, setFirstFrame] = useState(false);

  // Le poster reste tant que la vidéo n'est pas à la fois AFFICHÉE (`isCurrent`, pas `active` : une pause ne doit pas le ramener) et
  // peinte. Repli : si la vue ne signale jamais de première image, on se
  // rabat sur readyToPlay + 1,5 s plutôt que de garder le poster pour
  // toujours.
  useEffect(() => {
    if (!isCurrent) { setReady(false); return undefined; }
    if (firstFrame) { setReady(true); return undefined; }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fallback = () => { if (!timer) timer = setTimeout(() => setReady(true), 1500); };
    if (player.status === 'readyToPlay') fallback();
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') fallback();
    });
    return () => { sub.remove(); if (timer) clearTimeout(timer); };
  }, [player, isCurrent, firstFrame]);

  useEffect(() => {
    if (ready) {
      Animated.timing(posterOpacity, { toValue: 0, duration: 80, useNativeDriver: true }).start();
    } else {
      posterOpacity.stopAnimation();
      posterOpacity.setValue(1);
    }
  }, [ready, posterOpacity]);

  useEffect(() => {
    // Un reel voisin est TOUJOURS muet : il ne joue que pour remplir sa
    // mémoire tampon, son son ne doit jamais se superposer à celui du reel
    // regardé.
    try {
      player.muted = muted || !isCurrent;
      // Les reels voisins se préchargent en jouant en sourdine. Sur iOS, un
      // lecteur qui démarre s'empare de la session audio : sans ce partage
      // explicite, le dernier lecteur monté (un voisin) coupait le son du reel
      // regardé. Seul le reel affiché prend la session pour lui.
      player.audioMixingMode = isCurrent ? 'doNotMix' : 'mixWithOthers';
    } catch {}
  }, [muted, isCurrent, player]);

  // Sans ça, la musique/voix off (chargées à part, avec leur propre boucle)
  // dérivent au fil du temps et ne redémarrent plus avec la vidéo.
  useEffect(() => {
    const sub = player.addListener('playToEnd', () => onLoop?.());
    return () => sub.remove();
  }, [player, onLoop]);

  useEffect(() => {
    if (!active) {
      // Mis en pause par l'utilisateur : on s'arrête là, l'image reste celle
      // du moment de l'appui.
      if (isCurrent) {
        player.pause();
        return;
      }
      // Reel voisin : monté mais hors écran. Il a démarré muet à la création
      // pour remplir sa mémoire tampon ; on l'arrête dès qu'il est prêt. Au
      // swipe suivant, la vidéo repart d'un tampon déjà rempli.
      if (player.status === 'readyToPlay') {
        player.pause();
        return;
      }
      const sub = player.addListener('statusChange', ({ status }) => {
        if (status === 'readyToPlay') player.pause();
      });
      const stop = setTimeout(() => player.pause(), 1500);
      return () => { sub.remove(); clearTimeout(stop); };
    }
    // `play()` sur un lecteur pas encore prêt est ignoré : au swipe, la vidéo
    // suivante restait alors figée sur sa première image jusqu'à ce qu'on
    // appuie sur lecture. On rejoue donc dès qu'elle devient prête, tant
    // qu'elle est toujours la vidéo active.
    player.play();
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay' && !player.playing) player.play();
    });
    // Garde-fou : quelle que soit la raison pour laquelle la lecture s'est
    // perdue (ordre reçu trop tôt, retour de préchargement, interruption
    // système), un reel actif qui n'est pas en lecture est relancé. Sans ça,
    // il restait figé sur sa première image jusqu'à un appui sur lecture.
    const watchdog = setInterval(() => {
      if (player.status === 'readyToPlay' && !player.playing) player.play();
    }, 400);
    return () => { sub.remove(); clearInterval(watchdog); };
  }, [active, isCurrent, player]);

  // Déplacement de la lecture, piloté par la barre de progression.
  useEffect(() => {
    if (!seekRef) return undefined;
    seekRef.current = (ratio: number) => {
      const dur = player.duration;
      if (!(dur > 0)) return;
      // On s'arrête juste avant la fin : se poser exactement dessus déclenche
      // le bouclage, et la vidéo repartait de zéro au lieu de rester là.
      try { player.currentTime = Math.max(0, Math.min(dur - 0.05, ratio * dur)); } catch {}
    };
    return () => { seekRef.current = null; };
  }, [player, seekRef]);

  // Alimente la barre de progression en lisant directement la position réelle
  // du player à intervalle régulier (plutôt qu'un chrono figé type
  // Animated.timing, qui suppose une durée fixe depuis 0 et dérive dès que la
  // lecture ne démarre pas pile à 0 — ex : continuité depuis le feed via
  // `startAtSec`, mise en buffer, etc.). Se resynchronise donc automatiquement.
  useEffect(() => {
    if (!active) {
      progressAnim.setValue(startAtSec && player.duration > 0 ? startAtSec / player.duration : 0);
      return;
    }
    const interval = setInterval(() => {
      // Le doigt a la main : ne pas écraser sa position.
      if (scrubbingRef?.current) return;
      const dur = player.duration;
      if (dur > 0) {
        const ratio = Math.min(1, Math.max(0, player.currentTime / dur));
        progressAnim.setValue(ratio);
      }
    }, 150);
    return () => clearInterval(interval);
  }, [active, player, progressAnim, startAtSec, scrubbingRef]);

  return (
    <>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        onFirstFrameRender={() => setFirstFrame(true)}
        // Cf. le commentaire équivalent dans PostVideo.tsx : évite le "bleed"
        // d'une vidéo sur une autre pendant un défilement rapide sur Android.
        {...(Platform.OS === 'android' ? { surfaceType: 'textureView' as const } : {})}
      />
      {/* Par-dessus le lecteur (pas derrière), sinon son rendu noir la
          recouvre tant que la première image n'est pas prête. Fond neutre en
          repli si pas de miniature (reels publiés avant l'ajout des
          miniatures auto). Toujours monté, fondu en opacité (cf. PostVideo.tsx). */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: posterOpacity }]} pointerEvents="none">
        {posterUri
          ? <Image source={{ uri: posterUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          : <View style={[StyleSheet.absoluteFill, styles.videoFallbackBg]} />}
      </Animated.View>
      <PostOverlays overlays={overlays} />
    </>
  );
}

// ── Carte d'un reel ──────────────────────────────────────────────────────────
/**
 * Une page de reel.
 *
 * Mémoïsée : `activeIndex` change à chaque image du défilement, et sans ce
 * filtre React re-rendait les trois pages montées à chaque fois — le travail
 * inutile qui hachait le glissement. Seule la page dont `active`,
 * `shouldMount` ou le contenu change est re-rendue.
 */
function ReelCardBase({
  item, active, shouldMount, onLike, onComment, onShare, onUserPress, onFollow,
  screenHeight, startAtSec, initialImageIndex,
}: {
  item: FeedPost;
  active: boolean;
  /**
   * Android : monte un vrai lecteur (en pause, muet) avant que ce reel ne
   * devienne actif — laisse le décodeur matériel s'initialiser et charger sa
   * première image à l'avance, pour ne plus avoir de flash noir au moment du
   * swipe. Toujours `true` sur iOS (peu importe, pas de démontage là-bas).
   */
  shouldMount: boolean;
  onLike: (id: string) => void;
  onComment: (id: string) => void;
  onShare: (item: FeedPost) => void;
  onUserPress: (id: string) => void;
  onFollow: (id: string) => void;
  screenHeight: number;
  startAtSec?: number;
  /** Média sur lequel ouvrir, quand la publication en porte plusieurs. */
  initialImageIndex?: number;
}) {
  const musicMeta = item.musicTrack ? (() => {
    try { return JSON.parse(item.musicTrack) as { title?: string; artist?: string; artworkUrl?: string; previewUrl?: string; startMs?: number }; }
    catch { return null; }
  })() : null;
  // `muted` décrit ce que le spectateur entend — pas l'état de la piste
  // vidéo. Une publication avec musique démarrait ici à `true` (la musique
  // remplace le son d'origine, qui doit donc être coupé) : le bouton
  // s'affichait barré pendant que la musique jouait. Couper la piste vidéo
  // dans ce cas est déjà assuré par `effectiveMuted` ci-dessous.
  const [muted, setMuted] = useState(false);
  // Sur iPhone, la barre de progression et les points du carrousel doivent
  // rester au-dessus de la zone du geste d'accueil (bord bas inutilisable) :
  // collés au bord, ils se confondaient avec l'indicateur du système.
  const insets = useSafeAreaInsets();
  // Le son d'origine de la vidéo est coupé pour de bon dès qu'une musique a été
  // ajoutée (elle la remplace, les deux ne doivent jamais jouer ensemble) — comme
  // le son coupé par l'auteur, ce n'est pas quelque chose que le spectateur peut
  // contourner avec l'icône son (qui ne contrôle alors que la musique).
  const effectiveMuted = muted || !!item.videoMuted || !!musicMeta;
  const [liked, setLiked] = useState(item.likedByMe);
  const [likes, setLikes] = useState(item.likesCount);
  const [paused, setPaused] = useState(false);
  const [showPlayIcon, setShowPlayIcon] = useState(false);
  const playIconOpacity = useRef(new Animated.Value(0)).current;
  const musicSoundRef = useRef<AudioPlayer | null>(null);
  const voiceSoundRef = useRef<AudioPlayer | null>(null);
  const diskAnim = useRef(new Animated.Value(0)).current;
  const diskLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const router = useRouter();
  const progressAnim = useRef(new Animated.Value(0)).current;
  // Déplacement manuel de la lecture depuis la barre du bas.
  const seekRef = useRef<((ratio: number) => void) | null>(null);
  const scrubbingRef = useRef(false);
  const [scrubbing, setScrubbing] = useState(false);
  const barWidthRef = useRef(0);
  // URLs dont le lecteur a peint une image : jusque-là, la couverture de la
  // carte reste par-dessus (cf. renderMedia). Par URL, car un carrousel peut
  // contenir plusieurs vidéos.
  const [paintedUrls, setPaintedUrls] = useState<Set<string>>(() => new Set());
  const markPainted = useCallback((url: string, painted: boolean) => {
    setPaintedUrls((prev) => {
      if (prev.has(url) === painted) return prev;
      const next = new Set(prev);
      if (painted) next.add(url); else next.delete(url);
      return next;
    });
  }, []);

  const applyScrub = useCallback((x: number) => {
    const w = barWidthRef.current;
    if (w <= 0) return;
    const ratio = Math.min(1, Math.max(0, x / w));
    // La barre suit le doigt immédiatement, sans attendre que le lecteur ait
    // effectué le déplacement — sinon elle traîne derrière le geste.
    progressAnim.setValue(ratio);
    seekRef.current?.(ratio);
  }, [progressAnim]);

  /**
   * Gestes sur la barre de progression.
   *
   * Le geste n'est pris qu'à partir d'un mouvement HORIZONTAL franc : un
   * appui simple continue d'atteindre la vidéo (pause), et un glissement
   * vertical parti du bas de l'écran passe toujours au reel suivant.
   */
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderGrant: () => { scrubbingRef.current = true; setScrubbing(true); },
    onPanResponderMove: (e) => applyScrub(e.nativeEvent.locationX),
    onPanResponderRelease: (e) => {
      applyScrub(e.nativeEvent.locationX);
      scrubbingRef.current = false;
      setScrubbing(false);
    },
    onPanResponderTerminate: () => { scrubbingRef.current = false; setScrubbing(false); },
  }), [applyScrub]);
  // Reprend en lecture automatique quand on revient sur ce reel après l'avoir
  // quitté (comme Instagram : la pause manuelle ne "colle" pas au scroll).
  useEffect(() => { if (!active) setPaused(false); }, [active]);
  const effectiveActive = active && !paused;

  const togglePause = () => {
    setPaused((v) => !v);
    setShowPlayIcon(true);
    playIconOpacity.stopAnimation();
    playIconOpacity.setValue(1);
    Animated.timing(playIconOpacity, {
      toValue: 0, duration: 450, delay: 350, useNativeDriver: true,
    }).start(({ finished }) => { if (finished) setShowPlayIcon(false); });
  };

  // Lecture de la piste musicale synchronisée avec l'activité du reel
  useEffect(() => {
    // Les URLs CDN Deezer/iTunes ne sont pas lisibles par expo-audio : on ignore
    // les anciennes pistes qui pointent encore vers ces CDN (sinon « Unable to open URL »).
    const playable = musicMeta?.previewUrl && !/dzcdn\.net|itunes\.apple\.com|mzstatic\.com/i.test(musicMeta.previewUrl);
    if (!playable) return;
    let created: AudioPlayer | null = null;
    if (active) {
      const load = async () => {
        try {
          await setAudioModeAsync({ playsInSilentMode: true });
          const p = createAudioPlayer(musicMeta.previewUrl!);
          p.loop = true;
          created = p;
          musicSoundRef.current = p;
          // Gère les erreurs async (URL AAC protégée, réseau, etc.)
          p.addListener('playbackStatusUpdate', (st) => {
            if (st.error) {
              p.remove();
              if (musicSoundRef.current === p) musicSoundRef.current = null;
            }
          });
          if (musicMeta.startMs) await p.seekTo(musicMeta.startMs / 1000);
          p.play();
        } catch {}
      };
      void load();
    } else {
      musicSoundRef.current?.pause();
      musicSoundRef.current?.remove();
      musicSoundRef.current = null;
    }
    return () => {
      created?.pause();
      created?.remove();
      musicSoundRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Seul endroit qui décide si la musique déjà chargée joue : mise en pause
  // manuelle du reel, ou son coupé par le spectateur. (Le montage/démontage
  // ci-dessus, lui, suit le scroll et recharge la piste.) Réunir les deux
  // conditions ici évite qu'elles se contredisent — couper le son, mettre en
  // pause puis reprendre relançait une musique censée être coupée.
  useEffect(() => {
    if (paused || muted) musicSoundRef.current?.pause();
    else if (active) musicSoundRef.current?.play();
  }, [paused, active, muted]);

  // Voix off enregistrée à la publication — même mécanisme que la musique,
  // jouée en parallèle (les deux peuvent coexister, comme une vraie piste
  // audio de vidéo).
  useEffect(() => {
    if (!item.voiceTrackUrl) return;
    let created: AudioPlayer | null = null;
    if (active) {
      const load = async () => {
        try {
          await setAudioModeAsync({ playsInSilentMode: true });
          const p = createAudioPlayer(item.voiceTrackUrl!);
          p.loop = true;
          created = p;
          voiceSoundRef.current = p;
          p.play();
        } catch {}
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, item.voiceTrackUrl]);

  useEffect(() => {
    if (paused) voiceSoundRef.current?.pause();
    else if (active) voiceSoundRef.current?.play();
  }, [paused, active]);

  // Rotation du disque vinyle
  useEffect(() => {
    diskLoopRef.current?.stop();
    diskAnim.setValue(0);
    if (effectiveActive && musicMeta) {
      diskLoopRef.current = Animated.loop(
        Animated.timing(diskAnim, { toValue: 1, duration: 4000, useNativeDriver: true }),
      );
      diskLoopRef.current.start();
    }
  }, [effectiveActive, musicMeta, diskAnim]);

  const handleLike = () => {
    setLiked((v) => !v);
    setLikes((v) => v + (liked ? -1 : 1));
    onLike(item.id);
  };

  const { t } = useI18n();
  const { accessToken } = useAuth();
  const media = item.mediaUrls ?? [];
  // Une publication du fil peut porter plusieurs médias (carrousel) : on ouvre
  // sur celui qui a été touché, pas systématiquement le premier.
  const [imageIndex, setImageIndex] = useState(
    initialImageIndex != null && initialImageIndex < media.length ? initialImageIndex : 0,
  );
  const mediaUrl = media[imageIndex];
  const isVideo = isVideoUrl(mediaUrl);
  const isCarousel = media.length > 1;
  // Hauteur du bloc auteur/légende/musique : elle varie d'une publication à
  // l'autre (légende sur une ou trois lignes, musique ou non) et selon la
  // barre système du téléphone. Le bouton son se cale au-dessus, à écart
  // constant — à une hauteur fixe, il finissait collé au nom de l'auteur.
  const [infoHeight, setInfoHeight] = useState(0);
  const muteStyle = [styles.muteBtn, infoHeight > 0 ? { bottom: infoHeight + MUTE_GAP } : null];

  /**
   * Rend un média en plein écran.
   *
   * `pageActive` distingue la page regardée des pages voisines d'un carrousel.
   * Une vidéo hors page ne monte pas de lecteur : un lecteur natif, même en
   * pause, garde un décodeur matériel alloué — pool très limité et partagé par
   * tout le système. C'est la raison qui fait qu'on ne monte pas non plus les
   * reels voisins sur Android (cf. `shouldMount`) ; un carrousel de vidéos les
   * empilerait de la même façon, dans une seule carte.
   */
  const renderMedia = (url: string, pageActive: boolean) => {
    if (!isVideoUrl(url)) {
      return <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" />;
    }
    const playing = effectiveActive && pageActive;
    // iOS était exempté de `shouldMount` : avec windowSize=5, chaque swipe
    // montait jusqu'à quatre lecteurs natifs voisins, lancés en sourdine.
    // Un décodeur matériel qui s'initialise pendant que la vidéo courante
    // démarre la fige ~0,7 s — vu image par image sur un enregistrement.
    const holdOff = !playing && (!shouldMount || (Platform.OS !== 'android' && isCarousel));
    const cover = item.coverUrl ? (
      <Image source={{ uri: item.coverUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
    ) : (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111' }]} />
    );
    // La couverture est rendue PAR-DESSUS le lecteur, et occupe la même
    // position dans l'arbre qu'il soit monté ou non : React la conserve d'un
    // état à l'autre. Sans ça, à l'arrivée sur la page, la vue vidéo
    // (noire jusqu'à sa première image) apparaissait avant que le poster de
    // ReelVideo ait fini de se charger — un flash noir d'une ou deux images.
    // Ici rien ne change à l'écran tant qu'aucune image n'est peinte.
    return (
      <View style={StyleSheet.absoluteFill}>
        {holdOff ? null : (
          <ReelVideo
            uri={url}
            active={playing}
            isCurrent={active && pageActive}
            muted={effectiveMuted}
            progressAnim={progressAnim}
            seekRef={seekRef}
            scrubbingRef={scrubbingRef}
            startAtSec={startAtSec}
            overlays={item.overlays}
            onLoop={() => {
              void musicSoundRef.current?.seekTo(0).catch(() => null);
              void voiceSoundRef.current?.seekTo(0).catch(() => null);
            }}
            posterUri={item.coverUrl}
            onReadyChange={(painted) => markPainted(url, painted)}
          />
        )}
        {holdOff || !paintedUrls.has(url) ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">{cover}</View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.reelCard, { height: screenHeight }]}>
      {/* Fond / vidéo */}
      {isCarousel ? (
        <FlatList
          data={media}
          keyExtractor={(u, i) => `${i}-${u}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={imageIndex}
          getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })}
          onMomentumScrollEnd={(e) => setImageIndex(Math.round(e.nativeEvent.contentOffset.x / W))}
          renderItem={({ item: url, index }) => (
            // Le tap pause/relit est porté par la page elle-même : le Pressable
            // plein écran utilisé plus bas intercepterait le glissement
            // horizontal du carrousel.
            <Pressable style={{ width: W, height: screenHeight }} onPress={togglePause}>
              {renderMedia(url, index === imageIndex)}
            </Pressable>
          )}
        />
      ) : mediaUrl ? (
        renderMedia(mediaUrl, true)
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111' }]} />
      )}

      {/* Overlay gradient bas */}
      <View style={styles.reelOverlay} />

      {/* Tap au milieu pour mettre pause / relire (façon Instagram) — sur un
          carrousel, c'est chaque page qui le porte (cf. plus haut). */}
      {isCarousel ? null : <Pressable style={StyleSheet.absoluteFill} onPress={togglePause} />}
      {showPlayIcon && (
        <Animated.View style={[styles.pauseIconWrap, { opacity: playIconOpacity }]} pointerEvents="none">
          <View style={styles.pauseIconCircle}>
            <Text style={styles.pauseIconTxt}>{paused ? '▶' : '⏸'}</Text>
          </View>
        </Animated.View>
      )}

      {/* Boutons droite */}
      <View style={[styles.reelActions, { bottom: 100 + insets.bottom }]}>
        {/* Avatar auteur */}
        <Pressable onPress={() => item.user && onUserPress(item.user.id)} style={styles.reelAvatarWrap}>
          {item.user?.photoUrl ? (
            <Image source={{ uri: item.user.photoUrl }} style={styles.reelAvatar} />
          ) : (
            <View style={[styles.reelAvatar, { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{item.user?.displayName[0]}</Text>
            </View>
          )}
          <Pressable style={styles.followBadge} onPress={() => item.user && onFollow(item.user.id)}>
            <Text style={styles.followBadgeTxt}>+</Text>
          </Pressable>
        </Pressable>

        {/* Like */}
        <Pressable style={styles.reelActionBtn} onPress={handleLike}>
          <Text style={[styles.reelActionIcon, liked && { color: '#FF3040' }]}>♥</Text>
          <Text style={styles.reelActionCount}>{formatCount(likes)}</Text>
        </Pressable>

        {/* Commentaire */}
        <Pressable style={styles.reelActionBtn} onPress={() => onComment(item.id)}>
          <Text style={styles.reelActionIcon}>💬</Text>
          <Text style={styles.reelActionCount}>{formatCount(item.commentsCount)}</Text>
        </Pressable>

        {/* Repost */}
        <Pressable style={styles.reelActionBtn}>
          <Text style={styles.reelActionIcon}>🔁</Text>
          <Text style={styles.reelActionCount}>{formatCount(item.repostsCount)}</Text>
        </Pressable>

        {/* Vues — information, pas action : pas de Pressable. */}
        <View style={styles.reelActionBtn}>
          <Text style={styles.reelActionIcon}>👁</Text>
          <Text style={styles.reelActionCount}>{formatCount(item.viewsCount)}</Text>
        </View>

        {/* Partager */}
        <Pressable style={styles.reelActionBtn} onPress={() => onShare(item)}>
          <Text style={styles.reelActionIcon}>↗</Text>
          <Text style={styles.reelActionCount}>12</Text>
        </Pressable>

        {/* Menu — signalement du contenu. Le bouton existait sans action ;
            un reel est le contenu le plus vu de l'app, il doit être
            signalable comme le reste (règle 1.2 de l'App Store). */}
        <Pressable
          style={styles.reelActionBtn}
          onPress={() => promptReport({ accessToken, targetType: 'post', targetId: item.id, t })}
        >
          <Text style={styles.reelActionIcon}>···</Text>
        </Pressable>

        {/* Disque vinyle animé */}
        <Animated.View style={[styles.musicDisk, {
          transform: [{ rotate: diskAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
        }]}>
          {musicMeta?.artworkUrl
            ? <Image source={{ uri: musicMeta.artworkUrl }} style={styles.musicDiskImg} />
            : <Text style={{ fontSize: 18 }}>🎵</Text>}
        </Animated.View>
      </View>

      {/* Infos bas */}
      {/* Les infos et les actions remontent du même cran que la barre de
          progression, sinon le nom et « Suivre » passaient dessous. */}
      <View
        style={[styles.reelInfo, { paddingBottom: 24 + insets.bottom }]}
        onLayout={(e) => setInfoHeight(e.nativeEvent.layout.height)}
      >
        <Pressable style={styles.reelAuthorRow} onPress={() => item.user && onUserPress(item.user.id)}>
          <Text style={styles.reelAuthorName}>{item.user?.displayName ?? 'Yumia'}</Text>
          {/* Bouton Suivre inline */}
          <Pressable style={styles.reelFollowBtn} onPress={() => item.user && onFollow(item.user.id)}>
            <Text style={styles.reelFollowTxt}>{t('reels_follow')}</Text>
          </Pressable>
        </Pressable>
        {/* Lieu : juste sous l'auteur, comme sur Instagram, et cliquable
            vers sa fiche. */}
        {item.place ? (
          <Pressable
            style={styles.reelPlaceRow}
            onPress={() => item.place?.id && router.push(`/place?id=${item.place.id}` as never)}
            hitSlop={6}
          >
            <Text style={styles.reelPlaceTxt} numberOfLines={1}>📍 {item.place.name}</Text>
          </Pressable>
        ) : null}
        {item.caption ? (
          <TranslatableText text={item.caption} style={styles.reelCaption} numberOfLines={2} tone="light" />
        ) : null}
        {musicMeta?.title ? (
          <Text style={styles.reelMusicRow} numberOfLines={1}>🎵 {musicMeta.title}{musicMeta.artist ? ` • ${musicMeta.artist}` : ''}</Text>
        ) : null}
      </View>

      {/* Carrousel : mêmes repères que dans le fil, là où serait la barre de
          progression d'une vidéo. */}
      {isCarousel ? (
        <View style={[styles.reelDots, { bottom: insets.bottom + 18 }]} pointerEvents="none">
          {media.map((_, i) => (
            <View key={i} style={[styles.reelDot, i === imageIndex && styles.reelDotActive]} />
          ))}
        </View>
      ) : null}

      {/* Barre de progression — vidéo seulement. Pleine largeur, indépendante
          du padding des infos. Elle se déplace au doigt pour avancer ou
          rembobiner : la zone tactile est bien plus haute que le trait, qui ne
          ferait que 2 px à viser. Une photo ne défile pas : la barre y restait
          pleine et immobile, un repère qui n'indiquait rien. */}
      {isVideo ? (
        <View
          style={[styles.reelProgressTouch, { bottom: insets.bottom + 10 }]}
          onLayout={(e) => { barWidthRef.current = e.nativeEvent.layout.width; }}
          {...panResponder.panHandlers}
        >
          <View style={[styles.reelProgressBar, scrubbing ? styles.reelProgressBarActive : null]}>
            <Animated.View
              style={[
                styles.reelProgressFill,
                { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
              ]}
            />
          </View>
        </View>
      ) : null}

      {/* Icône son. Deux pistes possibles, jamais ensemble : le son d'origine
          de la vidéo, ou la musique ajoutée qui le remplace. Le bouton commande
          celle qui joue vraiment.

          Une vidéo dont l'auteur a coupé le son reste muette — ce choix ne se
          contourne pas. Mais s'il y a une musique, c'est elle qu'on entend :
          la rendre incoupable n'aurait servi personne. */}
      {!musicMeta && item.videoMuted ? (
        <View style={muteStyle}>
          <Text style={{ fontSize: 20, color: '#fff' }}>🔇</Text>
        </View>
      ) : (
        <Pressable style={muteStyle} onPress={() => setMuted((v) => !v)}>
          <Text style={{ fontSize: 20, color: '#fff' }}>{muted ? '🔇' : '🔊'}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Écran principal Reels ────────────────────────────────────────────────────
const ReelCard = memo(ReelCardBase, (prev, next) =>
  prev.item === next.item
  && prev.active === next.active
  && prev.shouldMount === next.shouldMount
  && prev.initialImageIndex === next.initialImageIndex);

export default function ReelsScreen() {
  const { accessToken, user: me } = useAuth();
  const router = useRouter();
  const { postId, t, i } = useLocalSearchParams<{ postId?: string; t?: string; i?: string }>();
  const startAtSec = t ? parseFloat(t) : undefined;
  // Photo touchee dans un carrousel du fil : on ouvre sur celle-la.
  const openAtImage = i ? parseInt(i, 10) : undefined;
  // Alias `tr` : le paramètre de route `t` (position de départ, secondes)
  // masquerait le `t` de useI18n.
  const { t: tr } = useI18n();
  const insets = useSafeAreaInsets();
  const [reelTab, setReelTab] = useState<ReelTab>('foryou');
  const [reels, setReels] = useState<FeedPost[]>([]);
  // Reel dont la fenêtre des commentaires est ouverte (null = fermée). La
  // vidéo continue derrière, comme sur Instagram.
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [screenFocused, setScreenFocused] = useState(true);
  // Filet : un appel, un vocal ou un enregistrement vidéo laisse la sortie
  // audio en mode micro, et les vidéos deviennent inaudibles. Cf.
  // lib/audio-session.ts.
  useFocusEffect(useCallback(() => { restorePlaybackAudio(); }, []));
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const flatListRef = useRef<FlatList<FeedPost>>(null);
  /**
   * Reels déjà comptés pendant cette session.
   *
   * Sans ce garde-fou, revenir sur un reel en remontant le fil rajouterait une
   * vue à chaque passage : le compteur mesurerait les allers-retours du pouce,
   * pas l'audience.
   */
  const viewedRef = useRef<Set<string>>(new Set());

  // Stop tout l'audio quand l'utilisateur quitte l'écran reels
  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    return () => setScreenFocused(false);
  }, []));

  // Hauteur RÉELLEMENT disponible pour la liste, mesurée via onLayout — pas
  // `Dimensions.get('window')` (figée à l'import). Sur Android, cette valeur
  // peut légèrement différer de l'espace effectivement rendu (barres système,
  // affichage edge-to-edge) : chaque page de la liste se retrouvait alors
  // décalée de quelques pixels par rapport à l'écran réel, laissant la
  // publication suivante déborder en bas de l'écran après un swipe.
  const [screenH, setScreenH] = useState(H);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const feed = reelTab === 'foryou'
        ? await feedApi.globalFeed(accessToken, 30)
        : await feedApi.followingFeed(accessToken, 30);
      // On filtre les posts avec media (vidéos en priorité, photos aussi)
      let list = feed.filter((p) => p.mediaUrls?.length > 0);

      let targetIndex = 0;
      if (postId) {
        const existingIdx = list.findIndex((p) => p.id === postId);
        if (existingIdx >= 0) {
          targetIndex = existingIdx;
        } else {
          // Le post ouvert depuis le feed n'est pas dans les 30 premiers reels :
          // on le récupère et on l'insère en tête pour y arriver directement.
          try {
            const res = await fetch(`${API}/posts/${postId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
            if (res.ok) {
              const single = (await res.json()) as FeedPost;
              if (single?.mediaUrls?.length > 0) {
                list = [single, ...list];
                targetIndex = 0;
              }
            }
          } catch {}
        }
      }

      setReels(list);
      setActiveIndex(targetIndex);
      setPlayIndex(targetIndex);
    } catch {
      setReels([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, reelTab, postId]);

  useEffect(() => { void load(); }, [load]);

  /**
   * Page active déduite de la POSITION de défilement, pas de la visibilité.
   *
   * `onViewableItemsChanged` ne se déclenche qu'une fois le seuil de visibilité
   * franchi, et son premier élément visible peut encore être la page qu'on
   * quitte : l'ancienne vidéo continuait donc de jouer pendant le glissement,
   * et la nouvelle ne démarrait qu'après coup — le à-coup ressenti au scroll.
   * Ici, la page change dès qu'on a dépassé la moitié de l'écran, comme sur
   * TikTok ou Instagram.
   */
  /**
   * Index sur lequel on s'est ARRÊTÉ depuis au moins 1,2 s.
   *
   * Les voisins ne se montent que par rapport à lui, jamais à `activeIndex` :
   * monter un lecteur natif (et le lancer pour précharger) pendant que la
   * vidéo courante démarre la figeait le temps de l'initialisation. Qui
   * regarde plus d'une seconde garde le préchargement ; qui enchaîne les
   * swipes verra une miniature un instant, plutôt qu'un gel à chaque page.
   */
  /**
   * Page dont la vidéo JOUE. Ne change qu'une fois le défilement posé
   * (`onMomentumScrollEnd`), jamais à mi-écran : activer un lecteur pendant
   * l'animation lui faisait perdre une image — mesuré sur un enregistrement,
   * la décélération native passait de -128 à -232 px d'une image à l'autre,
   * le « saut » ressenti au retour sur une vidéo.
   *
   * Repli 600 ms après le franchissement de la mi-écran : iOS n'émet pas
   * toujours la fin de momentum quand on relâche pile sur une page.
   */
  const [playIndex, setPlayIndex] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setPlayIndex(activeIndex), 600);
    return () => clearTimeout(timer);
  }, [activeIndex]);

  const [settledIndex, setSettledIndex] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setSettledIndex(playIndex), 1200);
    return () => clearTimeout(timer);
  }, [playIndex]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.y / screenH);
    setActiveIndex((prev) => (prev === index ? prev : index));
  }, [screenH]);

  // Une vue est comptée pour le reel réellement affiché — celui qui occupe
  // l'écran une fois le glissement terminé (cf. onScroll), pas ceux qu'on
  // traverse en défilant vite : l'effet ne part qu'après stabilisation de
  // `activeIndex`.
  //
  // Regarder sa propre publication ne compte pas. Le serveur applique déjà la
  // règle ; sans le même test ici, l'incrément optimiste ferait monter le
  // nombre affiché à l'auteur — qui retomberait au rechargement suivant.
  useEffect(() => {
    const current = reels[activeIndex];
    if (!current || !accessToken || !screenFocused) return;
    if (current.userId === me?.id) return;
    if (viewedRef.current.has(current.id)) return;
    viewedRef.current.add(current.id);
    void feedApi.recordView(accessToken, current.id);
    setReels((prev) =>
      prev.map((r) => (r.id === current.id ? { ...r, viewsCount: (r.viewsCount ?? 0) + 1 } : r)),
    );
  }, [activeIndex, reels, accessToken, screenFocused, me?.id]);

  const toggleLike = async (postId: string) => {
    if (!accessToken) return;
    await feedApi.toggleLike(accessToken, postId);
  };

  const toggleFollow = async (targetId: string) => {
    if (!accessToken || targetId === me?.id) return;
    const isFollowing = following.has(targetId);
    await fetch(`${API}/social/follow/${targetId}`, {
      method: isFollowing ? 'DELETE' : 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    setFollowing((prev) => {
      const s = new Set(prev);
      if (isFollowing) s.delete(targetId); else s.add(targetId);
      return s;
    });
  };

  return (
    <View
      style={[styles.container, { backgroundColor: '#000' }]}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0 && Math.abs(h - screenH) > 0.5) setScreenH(h);
      }}
    >
      {/* Header flottant */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backTxt}>←</Text>
        </Pressable>
        <View style={styles.tabsRow}>
          <Pressable onPress={() => setReelTab('foryou')}>
            <Text style={[styles.tabTxt, reelTab === 'foryou' && styles.tabTxtActive]}>{tr('reels_tab_foryou')}</Text>
          </Pressable>
          <View style={styles.tabDivider} />
          <Pressable onPress={() => setReelTab('following')}>
            <Text style={[styles.tabTxt, reelTab === 'following' && styles.tabTxtActive]}>{tr('reels_tab_following')}</Text>
          </Pressable>
        </View>
        <Pressable style={styles.cameraBtn} onPress={() => router.push('/camera?mode=reel' as never)}>
          <Text style={{ fontSize: 22, color: '#fff' }}>📷</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#fff" size="large" /></View>
      ) : reels.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🎬</Text>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>{tr('reels_empty_title')}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', paddingHorizontal: 32, lineHeight: 22 }}>
            {tr('reels_empty_text')}
          </Text>
          <Pressable
            style={[styles.createReelBtn, { marginTop: 24 }]}
            onPress={() => router.push('/camera?mode=reel' as never)}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{tr('reels_create_btn')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={reels}
          keyExtractor={(p) => p.id}
          pagingEnabled
          snapToInterval={screenH}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          initialScrollIndex={activeIndex > 0 ? activeIndex : undefined}
          getItemLayout={(_, index) => ({ length: screenH, offset: screenH * index, index })}
          onScrollToIndexFailed={({ index }) => {
            setTimeout(() => flatListRef.current?.scrollToIndex({ index, animated: false }), 50);
          }}
          onScroll={onScroll}
          scrollEventThrottle={16}
          // Le défilement est posé : c'est maintenant que la vidéo de la page
          // s'active, cf. `playIndex`.
          onMomentumScrollEnd={(e) => setPlayIndex(Math.round(e.nativeEvent.contentOffset.y / screenH))}
          // Fenêtre serrée : 3 pages montées au plus (la précédente, l'actuelle,
          // la suivante). Au-delà, autant de lecteurs vidéo natifs vivants, que
          // le décodeur du téléphone finit par ne plus suivre.
          windowSize={5}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={Platform.OS === 'android'}
          // Le rendu d'une page hors écran ne doit pas retarder le glissement.
          disableIntervalMomentum
          renderItem={({ item, index }) => (
            <ReelCard
              item={item}
              active={index === playIndex && screenFocused}
              // La page courante, toujours. Les voisins (un devant, un
              // derrière) seulement une fois posé sur une page depuis 1,2 s,
              // cf. `settledIndex` : leur montage ne doit pas coïncider avec
              // le démarrage de la vidéo qu'on regarde.
              shouldMount={
                index === playIndex
                || (settledIndex === playIndex && Math.abs(index - settledIndex) <= 1)
              }
              onLike={toggleLike}
              onComment={(id) => setCommentsFor(id)}
              onShare={() => void Share.share({ message: tr('reels_share_message') })}
              onUserPress={(id) => router.push(`/user/${id}` as never)}
              onFollow={toggleFollow}
              startAtSec={item.id === postId ? startAtSec : undefined}
              initialImageIndex={item.id === postId ? openAtImage : undefined}
              screenHeight={screenH}
            />
          )}
        />
      )}

      <CommentsSheet
        postId={commentsFor}
        onClose={() => setCommentsFor(null)}
        onCountChange={(id, delta) => setReels((prev) => prev.map((p) => (
          p.id === id ? { ...p, commentsCount: Math.max(0, p.commentsCount + delta) } : p
        )))}
      />
      <FeatureTip feature="reels" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Repli quand un reel n'a pas de miniature — gris neutre plutôt qu'un
  // flash de noir pur pendant le swipe.
  videoFallbackBg: { backgroundColor: '#1c1c1e' },

  // Header
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingBottom: 12,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  backTxt: { fontSize: 24, color: '#fff', fontWeight: '700' },
  tabsRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  tabTxt: { fontSize: 16, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  tabTxtActive: { color: '#fff', fontWeight: '700', textDecorationLine: 'underline' },
  tabDivider: { width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.3)' },
  cameraBtn: { width: 40, alignItems: 'flex-end' },

  // Reel card
  reelCard: { width: W, backgroundColor: '#000', position: 'relative' },
  reelOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 240,
    // gradient simulé via opacité
    backgroundColor: 'transparent',
  },

  // Actions droite
  reelActions: {
    position: 'absolute', right: 12, bottom: 100,
    alignItems: 'center', gap: 20,
    // `bottom` ajusté à l'affichage (insets.bottom), cf. reelInfo.
  },
  reelAvatarWrap: { position: 'relative', marginBottom: 4 },
  reelAvatar: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: '#fff' },
  followBadge: {
    position: 'absolute', bottom: -8, left: '50%',
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#fff',
    transform: [{ translateX: -10 }],
  },
  followBadgeTxt: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 18 },
  reelActionBtn: { alignItems: 'center', gap: 3 },
  reelActionIcon: { fontSize: 28, color: '#fff' },
  reelActionCount: { fontSize: 13, color: '#fff', fontWeight: '600' },
  musicDisk: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  musicDiskImg: { width: 44, height: 44, borderRadius: 22 },
  reelMusicRow: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginBottom: 6 },

  // Infos bas
  reelInfo: {
    position: 'absolute', bottom: 0, left: 0, right: 70,
    padding: spacing.md, paddingBottom: 24,
  },
  reelAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  reelAuthorName: { color: '#fff', fontWeight: '700', fontSize: 15 },
  reelFollowBtn: {
    borderWidth: 1.5, borderColor: '#fff', borderRadius: radius.pill,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  reelFollowTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  reelPlaceRow: { alignSelf: 'flex-start', marginBottom: 6 },
  // Fond sombre translucide : le nom d'un lieu doit rester lisible sur une
  // vidéo claire, sans alourdir l'image.
  reelPlaceTxt: {
    color: '#fff', fontSize: 13, fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    overflow: 'hidden',
  },
  reelCaption: { color: '#fff', fontSize: 14, lineHeight: 20, marginBottom: 10 },
  // Zone de saisie : transparente et haute de 22 px, pour attraper un trait
  // de 2 px au doigt. Le trait reste collé en bas de cette zone.
  reelProgressTouch: {
    position: 'absolute', left: 0, right: 0,
    height: 22, justifyContent: 'flex-end',
  },
  reelProgressBar: {
    height: 2, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 1,
  },
  // Pendant le déplacement : trait épaissi, pour qu'on voie ce qu'on manipule.
  reelProgressBarActive: { height: 4, borderRadius: 2 },
  reelProgressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 1 },
  reelDots: {
    position: 'absolute', bottom: 18, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 5,
  },
  reelDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' },
  reelDotActive: { backgroundColor: '#fff', width: 7, height: 7, borderRadius: 3.5 },

  // Icône pause/lecture (tap au milieu)
  pauseIconWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center', justifyContent: 'center',
  },
  pauseIconCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  pauseIconTxt: { fontSize: 28, color: '#fff' },

  // Mute
  muteBtn: {
    position: 'absolute', bottom: 100, left: 14,
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20,
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
  },

  createReelBtn: {
    backgroundColor: colors.brand, borderRadius: radius.pill,
    paddingHorizontal: 24, paddingVertical: 12,
  },
});
