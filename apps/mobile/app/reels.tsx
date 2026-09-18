import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Dimensions, FlatList, Platform, Pressable,
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
import { useI18n } from '../lib/useI18n';
import { formatCount } from '../lib/format-count';
import { isVideoUrl } from '../lib/is-video-url';
import { SHORT_VIDEO_BUFFER } from '../lib/video-buffer';

const { width: W, height: H } = Dimensions.get('window');
const API = API_BASE_URL;

type ReelTab = 'foryou' | 'following';

// ── Lecteur vidéo d'un seul reel ─────────────────────────────────────────────
function ReelVideo({
  uri, active, isCurrent, muted, progressAnim, startAtSec, overlays, onLoop, posterUri,
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
  const player = useVideoPlayer(uri, (p) => {
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

  // Cf. PostVideo.tsx : le poster/fond neutre reste tant que le lecteur n'est
  // pas à la fois prêt ET actif — `readyToPlay` peut se déclencher pendant le
  // préchargement (montage anticipé en pause), avant l'activation, et
  // `play()` au moment de l'activation peut lui-même provoquer une frame
  // noire côté Android qu'un poster déjà caché ne masque plus.
  useEffect(() => {
    // `isCurrent` et non `active` : une PAUSE ne doit pas ramener le poster,
    // sinon l'écran montre la miniature (première image de la vidéo) au lieu
    // de l'image où l'on s'est arrêté.
    if (!isCurrent) { setReady(false); return; }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleHide = () => {
      if (timer) return;
      timer = setTimeout(() => setReady(true), 120);
    };
    if (player.status === 'readyToPlay') scheduleHide();
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') scheduleHide();
    });
    return () => { sub.remove(); if (timer) clearTimeout(timer); };
  }, [player, isCurrent]);

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
    try { player.muted = muted || !isCurrent; } catch {}
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
      const dur = player.duration;
      if (dur > 0) {
        const ratio = Math.min(1, Math.max(0, player.currentTime / dur));
        progressAnim.setValue(ratio);
      }
    }, 150);
    return () => clearInterval(interval);
  }, [active, player, progressAnim, startAtSec]);

  return (
    <>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
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
  const progressAnim = useRef(new Animated.Value(0)).current;
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
    const holdOff = Platform.OS === 'android' ? !playing && !shouldMount : !playing && isCarousel;
    if (holdOff) {
      return item.coverUrl ? (
        <Image source={{ uri: item.coverUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111' }]} />
      );
    }
    return (
      <ReelVideo
        uri={url}
        active={playing}
        isCurrent={active && pageActive}
        muted={effectiveMuted}
        progressAnim={progressAnim}
        startAtSec={startAtSec}
        overlays={item.overlays}
        onLoop={() => {
          void musicSoundRef.current?.seekTo(0).catch(() => null);
          void voiceSoundRef.current?.seekTo(0).catch(() => null);
        }}
        posterUri={item.coverUrl}
      />
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
      <View style={[styles.reelInfo, { paddingBottom: 24 + insets.bottom }]}>
        <Pressable style={styles.reelAuthorRow} onPress={() => item.user && onUserPress(item.user.id)}>
          <Text style={styles.reelAuthorName}>{item.user?.displayName ?? 'Yumia'}</Text>
          {/* Bouton Suivre inline */}
          <Pressable style={styles.reelFollowBtn} onPress={() => item.user && onFollow(item.user.id)}>
            <Text style={styles.reelFollowTxt}>{t('reels_follow')}</Text>
          </Pressable>
        </Pressable>
        {item.caption ? (
          <Text style={styles.reelCaption} numberOfLines={2}>{item.caption}</Text>
        ) : null}
        {musicMeta?.title ? (
          <Text style={styles.reelMusicRow} numberOfLines={1}>🎵 {musicMeta.title}{musicMeta.artist ? ` • ${musicMeta.artist}` : ''}</Text>
        ) : null}
      </View>

      {/* Carrousel : mêmes repères que dans le fil, juste au-dessus de la
          barre de progression. */}
      {isCarousel ? (
        <View style={[styles.reelDots, { bottom: insets.bottom + 18 }]} pointerEvents="none">
          {media.map((_, i) => (
            <View key={i} style={[styles.reelDot, i === imageIndex && styles.reelDotActive]} />
          ))}
        </View>
      ) : null}

      {/* Barre de progression — pleine largeur, indépendante du padding des
          infos ; suit la lecture pour une vidéo, pleine pour un reel photo. */}
      <View style={[styles.reelProgressBar, { bottom: insets.bottom + 10 }]}>
        {isVideo ? (
          <Animated.View
            style={[
              styles.reelProgressFill,
              { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
            ]}
          />
        ) : (
          <View style={[styles.reelProgressFill, { width: active ? '100%' : '0%' }]} />
        )}
      </View>

      {/* Icône son. Deux pistes possibles, jamais ensemble : le son d'origine
          de la vidéo, ou la musique ajoutée qui le remplace. Le bouton commande
          celle qui joue vraiment.

          Une vidéo dont l'auteur a coupé le son reste muette — ce choix ne se
          contourne pas. Mais s'il y a une musique, c'est elle qu'on entend :
          la rendre incoupable n'aurait servi personne. */}
      {!musicMeta && item.videoMuted ? (
        <View style={styles.muteBtn}>
          <Text style={{ fontSize: 20, color: '#fff' }}>🔇</Text>
        </View>
      ) : (
        <Pressable style={styles.muteBtn} onPress={() => setMuted((v) => !v)}>
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
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [screenFocused, setScreenFocused] = useState(true);
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
              active={index === activeIndex && screenFocused}
              // Précharge DEUX reels en avant (sens de lecture) et un en
              // arrière : au swipe, la vidéo suivante a déjà commencé à se
              // charger. Quatre lecteurs au plus, ce que le décodeur encaisse.
              shouldMount={index - activeIndex >= -1 && index - activeIndex <= 2}
              onLike={toggleLike}
              onComment={(id) => router.push(`/post/${id}` as never)}
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
  reelCaption: { color: '#fff', fontSize: 14, lineHeight: 20, marginBottom: 10 },
  reelProgressBar: {
    position: 'absolute', bottom: 10, left: 0, right: 0,
    height: 2, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 1,
  },
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
