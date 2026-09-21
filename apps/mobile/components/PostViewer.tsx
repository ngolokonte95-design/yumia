/**
 * Publications en plein écran, avec leurs actions, et défilement vertical
 * d'une publication à l'autre.
 *
 * `PhotoViewer` reste l'afficheur nu, utilisé par le chat et les fiches de
 * lieu où il n'y a rien à aimer ni à commenter. Ici on ajoute ce qu'une
 * publication apporte — auteur, légende, j'aime, commentaires, vues,
 * enregistrement — et de quoi parcourir tout un compte sans revenir à la
 * grille.
 *
 * Trois principes de mise en page :
 *  - **Le média reste le plus grand possible.** Les actions flottent par
 *    dessus, sur un dégradé, et ne rognent rien.
 *  - **Un appui sur l'image efface tout.** On revient au média seul, sans
 *    quitter l'écran — c'est le geste attendu quand on veut vraiment le voir.
 *    Sur une vidéo, l'appui est réservé à la lecture : ce sont ses propres
 *    commandes qui priment.
 *  - **Photos et vidéos défilent ensemble**, dans l'ordre de la grille. Une
 *    publication à plusieurs images garde en plus son défilement horizontal.
 *
 * Les actions sont exécutées ici plutôt que déléguées à l'écran appelant :
 * c'est ce qui permet d'ouvrir cette visionneuse depuis le fil ET depuis les
 * deux écrans de profil sans que chacun ait à câbler les mêmes appels.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type ViewToken,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { feedApi, type FeedPost } from '../lib/feed-api';
import { formatCount } from '../lib/format-count';
import type { MusicMeta } from '../lib/music-track';
import { PostVideo } from './PostVideo';
import { parseMusicTrack, isPlayableAudioUrl } from '../lib/music-track';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/** Même détection que le fil et les profils : le backend n'envoie pas de type. */
function isVideoUrl(url?: string | null): boolean {
  return !!url && /\.(mp4|mov|m4v|webm|avi|mkv)(\?|$)/i.test(url);
}

interface Props {
  /** Les publications parcourables, dans l'ordre où elles s'affichaient. */
  posts: FeedPost[];
  /** Celle sur laquelle on a appuyé. */
  initialIndex?: number;
  /**
   * Image d'ouverture au sein de cette publication.
   *
   * Depuis le fil, on appuie sur une image précise d'un carrousel : c'est
   * celle-là qu'on veut voir en grand, pas la première.
   */
  initialImageIndex?: number;
  onClose: () => void;
  /** Remonte le nouvel état à l'écran appelant, pour que sa liste suive. */
  onChange?: (postId: string, patch: Partial<FeedPost>) => void;
}

export function PostViewer({ posts, initialIndex = 0, initialImageIndex = 0, onClose, onChange }: Props) {
  const { width, height: windowHeight } = useWindowDimensions();
  // Hauteur RÉELLE de la visionneuse, mesurée. Sur Android, la hauteur de
  // fenêtre exclut selon les versions la barre d'état et/ou la barre de
  // navigation, alors que la modale (statusBarTranslucent) les recouvre : des
  // pages plus courtes que l'écran, et deux publications visibles à la fois
  // après un swipe. Tant que rien n'est mesuré, on part de la fenêtre.
  //
  // Mesurée UNE fois : sur Android, le premier rendu de la modale peut être
  // suivi d'un second passage de mise en page (barre d'état masquée après
  // coup), et refaire la liste à ce moment-là la remontait en plein
  // défilement — d'où un défilement emballé qui sautait des publications.
  /**
   * Hauteur réelle de l'écran, mesurée sur la vue racine.
   *
   * On garde la PLUS GRANDE mesure, jamais la première : sur Android, à
   * l'ouverture, la première arrive avant la prise en compte de la barre
   * d'état translucide (774 au lieu de 806, vu au journal), la bonne juste
   * après. Ne retenir que la première donnait des pages plus courtes que
   * l'écran — un bout de la publication suivante visible sous chacune — et
   * un défaut intermittent, selon l'ordre d'arrivée des deux mesures.
   *
   * La liste n'est posée qu'une fois la valeur stable (`stableHeight`) : sa
   * géométrie ne doit pas bouger sous les doigts, c'est ce qui emballait le
   * défilement quand on re-mesurait en continu.
   */
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const [stableHeight, setStableHeight] = useState<number | null>(null);
  useEffect(() => {
    if (measuredHeight === null) return undefined;
    const timer = setTimeout(() => setStableHeight(measuredHeight), 80);
    return () => clearTimeout(timer);
  }, [measuredHeight]);
  const height = stableHeight ?? windowHeight;
  // Si la hauteur stable change APRÈS la pose de la liste (mesure plus grande
  // arrivée tard), les pages sont recalculées : on réaligne sur la page
  // courante, sinon le défilement resterait à l'ancienne position.
  const listRef = useRef<FlatList<FeedPost>>(null);
  const lastAppliedHeight = useRef<number | null>(null);
  useEffect(() => {
    if (stableHeight === null) return;
    if (lastAppliedHeight.current !== null && lastAppliedHeight.current !== stableHeight) {
      listRef.current?.scrollToOffset({ offset: current * stableHeight, animated: false });
    }
    lastAppliedHeight.current = stableHeight;
    // `current` volontairement hors dépendances : on ne réaligne que sur un
    // changement de hauteur, pas à chaque page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableHeight]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();

  const [current, setCurrent] = useState(initialIndex);
  /**
   * Page sur laquelle on s'est ARRÊTÉ depuis au moins 1,2 s. Les voisins ne
   * montent leur lecteur que par rapport à elle : créer un lecteur natif
   * pendant que la vidéo courante démarre la figeait ~0,7 s (même cause que
   * dans les reels, cf. reels.tsx `settledIndex`).
   */
  /**
   * Page dont la vidéo JOUE — posée à la fin du momentum, jamais à 60 % de
   * visibilité comme `current`. Activer un lecteur (et charger sa musique)
   * pendant l'animation lui faisait perdre une image : le saut ressenti à la
   * transition. Même règle que les reels (cf. reels.tsx `playIndex`).
   * Repli 600 ms : iOS n'émet pas toujours la fin de momentum quand on
   * relâche pile sur une page.
   */
  const [playIndex, setPlayIndex] = useState(initialIndex);
  useEffect(() => {
    const timer = setTimeout(() => setPlayIndex(current), 600);
    return () => clearTimeout(timer);
  }, [current]);

  const [settledIndex, setSettledIndex] = useState(initialIndex);
  useEffect(() => {
    const timer = setTimeout(() => setSettledIndex(playIndex), 1200);
    return () => clearTimeout(timer);
  }, [playIndex]);
  const [chrome, setChrome] = useState(true);
  /**
   * État local des actions, par publication.
   *
   * Le cœur doit réagir au doigt et non au réseau ; `posts` vient de l'écran
   * appelant et ne se met pas à jour tout seul.
   */
  const [patches, setPatches] = useState<Record<string, Partial<FeedPost>>>({});

  /**
   * Musique de la publication regardée.
   *
   * Sans elle, ouvrir une photo en plein écran coupait le son que l'on
   * entendait une seconde plus tôt dans le fil. Une seule piste joue à la
   * fois : celle de la publication à l'écran.
   */
  const soundRef = useRef<AudioPlayer | null>(null);
  const [musicPaused, setMusicPaused] = useState(false);

  const stopMusic = useCallback(() => {
    soundRef.current?.pause();
    soundRef.current?.remove();
    soundRef.current = null;
  }, []);

  const currentPost = posts[playIndex] as FeedPost | undefined;
  const currentMusic = parseMusicTrack(currentPost?.musicTrack);

  useEffect(() => {
    const url = currentMusic?.previewUrl;
    stopMusic();
    setMusicPaused(false);
    if (!url || !isPlayableAudioUrl(url)) return;

    let cancelled = false;
    void (async () => {
      try {
        await setAudioModeAsync({ playsInSilentMode: true });
        const sound = createAudioPlayer(url);
        if (cancelled) { sound.remove(); return; }
        sound.loop = true;
        soundRef.current = sound;
        sound.play();
      } catch {
        // Piste illisible : la publication reste visible, sans son.
      }
    })();

    return () => { cancelled = true; };
    // `currentMusic` est reconstruit à chaque rendu : on suit l'URL, qui ne
    // change que lorsqu'on passe à une autre publication.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMusic?.previewUrl, stopMusic]);

  // Quitter la visionneuse coupe le son : sans ça, la piste continuerait par
  // dessus l'écran d'où l'on vient.
  useEffect(() => stopMusic, [stopMusic]);

  const toggleMusic = useCallback(() => {
    const sound = soundRef.current;
    if (!sound) return;
    setMusicPaused((paused) => {
      if (paused) sound.play();
      else sound.pause();
      return !paused;
    });
  }, []);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) setCurrent(viewableItems[0].index ?? 0);
  }).current;

  const apply = useCallback((postId: string, patch: Partial<FeedPost>) => {
    setPatches((prev) => ({ ...prev, [postId]: { ...prev[postId], ...patch } }));
    onChange?.(postId, patch);
  }, [onChange]);

  const toggleLike = useCallback(async (post: FeedPost) => {
    if (!accessToken) return;
    const liked = patches[post.id]?.likedByMe ?? post.likedByMe;
    const count = patches[post.id]?.likesCount ?? post.likesCount;
    apply(post.id, { likedByMe: !liked, likesCount: count + (liked ? -1 : 1) });

    const res = await feedApi.toggleLike(accessToken, post.id);
    apply(post.id, { likedByMe: res.liked, likesCount: res.likesCount });
  }, [accessToken, patches, apply]);

  const toggleSave = useCallback(async (post: FeedPost) => {
    if (!accessToken) return;
    const saved = patches[post.id]?.savedByMe ?? post.savedByMe;
    apply(post.id, { savedByMe: !saved });
    const res = await feedApi.toggleSave(accessToken, post.id);
    apply(post.id, { savedByMe: res.saved });
  }, [accessToken, patches, apply]);

  /** Les commentaires vivent sur la page de la publication : on y va. */
  const openComments = useCallback((postId: string) => {
    onClose();
    router.push(`/post/${postId}` as never);
  }, [onClose, router]);

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View
        style={styles.screen}
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          // Diagnostic (Android : une page atterrit parfois décalée, on voit
          // un bout de la suivante) : toute mesure est journalisée, même
          // celles qu'on ignore — si la première était fausse, ça se verra.
          console.warn(`[viewer] mesure=${h} fenêtre=${Math.round(windowHeight)} retenue=${Math.max(measuredHeight ?? 0, h)}`);
          if (h > 0) setMeasuredHeight((prev) => (prev === null || h > prev ? h : prev));
        }}
      >
        {Platform.OS === 'android' ? <StatusBar hidden /> : null}

        {/* La liste n'est posée qu'une fois la hauteur connue : sa géométrie
            (pages, alignement du swipe) ne change plus ensuite. */}
        {stableHeight === null ? null : (
        <FlatList
          ref={listRef}
          data={posts}
          keyExtractor={(p) => p.id}
          // Un seul mécanisme de pagination. `pagingEnabled` cale les pages
          // sur la hauteur de la VUE de liste, `snapToInterval` sur la
          // hauteur MESURÉE : sur iOS le second l'emporte, sur Android les
          // deux tirent, et quand elles diffèrent (barre d'état translucide)
          // une page atterrit décalée — on voyait un bout de la suivante.
          snapToInterval={height}
          snapToAlignment="start"
          disableIntervalMomentum
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
          // Une page de chaque côté reste montée : la vidéo suivante se
          // précharge en coulisses (son lecteur existe, en pause), sans les
          // ~21 écrans que FlatList garde par défaut — autant de lecteurs
          // natifs qui, sur Android, saccadent la lecture.
          windowSize={3}
          maxToRenderPerBatch={2}
          initialNumToRender={2}
          removeClippedSubviews={Platform.OS === 'android'}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          // Le défilement est posé : c'est maintenant que la page s'active.
          onMomentumScrollEnd={(e) => {
            const y = e.nativeEvent.contentOffset.y;
            const index = Math.round(y / height);
            // Écart au cran : 0 = page parfaitement calée ; sinon, de combien.
            console.warn(`[viewer] arrêt y=${Math.round(y)} page=${index} écart=${Math.round(y - index * height)}px hauteur=${height}`);
            setPlayIndex(index);
          }}
          renderItem={({ item, index }) => (
            <PostPage
              post={{ ...item, ...patches[item.id] }}
              width={width}
              height={height}
              active={index === playIndex}
              mountPlayer={
                index === playIndex
                || (settledIndex === playIndex && Math.abs(index - settledIndex) <= 1)
              }
              chrome={chrome}
              onToggleChrome={() => setChrome((c) => !c)}
              insets={insets}
              initialImageIndex={index === initialIndex ? initialImageIndex : 0}
              music={index === playIndex ? currentMusic : null}
              musicPaused={musicPaused}
              onToggleMusic={toggleMusic}
              onLike={() => void toggleLike(item)}
              onSave={() => void toggleSave(item)}
              onComment={() => openComments(item.id)}
            />
          )}
        />
        )}

        {chrome ? (
          <Pressable style={[styles.close, { top: insets.top + 12 }]} onPress={onClose} hitSlop={12}>
            <Text style={styles.closeIcon}>✕</Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

/** Une publication occupant tout l'écran. */
function PostPage({
  post, width, height, active, mountPlayer, chrome, onToggleChrome, insets, initialImageIndex,
  music, musicPaused, onToggleMusic, onLike, onSave, onComment,
}: {
  post: FeedPost;
  width: number;
  height: number;
  active: boolean;
  /** Faux tant que la page est un voisin fraîchement arrivé : pas de lecteur, la couverture suffit. */
  mountPlayer: boolean;
  chrome: boolean;
  onToggleChrome: () => void;
  insets: { top: number; bottom: number };
  initialImageIndex: number;
  /** Piste de cette publication, seulement quand c'est elle qu'on regarde. */
  music: MusicMeta | null;
  musicPaused: boolean;
  onToggleMusic: () => void;
  onLike: () => void;
  onSave: () => void;
  onComment: () => void;
}) {
  // PostPage ne naviguait pas jusqu'ici ; le lieu mène à sa fiche.
  const router = useRouter();
  const [imageIndex, setImageIndex] = useState(initialImageIndex);
  const media = post.mediaUrls.length ? post.mediaUrls : (post.videoUrl ? [post.videoUrl] : []);

  return (
    <View style={{ width, height }}>
      <FlatList
        data={media}
        keyExtractor={(uri, i) => `${uri}-${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialImageIndex}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(e) => setImageIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item: uri, index }) =>
          isVideoUrl(uri) && !mountPlayer ? (
            // Voisin fraîchement arrivé : la couverture, sans lecteur natif.
            // Le lecteur viendra une fois la page courante stabilisée.
            <View style={{ width, height, backgroundColor: '#111' }}>
              {post.coverUrl ? (
                <Image source={{ uri: post.coverUrl }} style={{ width, height }} contentFit="cover" />
              ) : null}
            </View>
          ) : isVideoUrl(uri) ? (
            // Le lecteur n'est actif que sur la publication affichée ET sur la
            // diapositive regardée : deux vidéos ne jouent jamais ensemble.
            <View style={{ width, height }}>
              <PostVideo
                uri={uri}
                style={{ width, height }}
                active={active && index === imageIndex}
                posterUri={post.coverUrl}
                overlays={post.overlays}
                // Une musique ajoutée remplace le son d'origine : les deux
                // ne doivent jamais jouer ensemble.
                videoMuted={post.videoMuted || !!music}
              />
            </View>
          ) : (
            <Pressable style={{ width, height }} onPress={onToggleChrome}>
              <Image
                source={{ uri }}
                style={{ width, height }}
                contentFit="contain"
                cachePolicy="memory-disk"
                recyclingKey={uri}
              />
            </Pressable>
          )
        }
      />

      {chrome ? (
        <>
          {media.length > 1 ? (
            <View style={[styles.counter, { top: insets.top + 12 }]}>
              <Text style={styles.counterText}>{imageIndex + 1} / {media.length}</Text>
            </View>
          ) : null}

          {/* Dégradé : les textes blancs restent lisibles sur une photo claire. */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.85)']}
            style={[styles.bottom, { paddingBottom: insets.bottom + spacing.md }]}
          >
            {music ? (
              <View style={styles.music}>
                {music.artworkUrl ? (
                  <Image source={{ uri: music.artworkUrl }} style={styles.musicArtwork} />
                ) : (
                  <Text style={{ fontSize: 14 }}>🎵</Text>
                )}
                <View style={{ flex: 1, overflow: 'hidden' }}>
                  <Text style={styles.musicTitle} numberOfLines={1}>{music.title}</Text>
                  {music.artist ? (
                    <Text style={styles.musicArtist} numberOfLines={1}>{music.artist}</Text>
                  ) : null}
                </View>
                <Pressable onPress={onToggleMusic} hitSlop={10} style={styles.musicToggle}>
                  <Text style={styles.musicToggleIcon}>{musicPaused ? '▶' : '❚❚'}</Text>
                </Pressable>
              </View>
            ) : null}

            {post.user?.displayName ? (
              <Text style={styles.author} numberOfLines={1}>{post.user.displayName}</Text>
            ) : null}
            {/* Lieu, comme dans les reels : le plein écran du profil montre la
                même publication, il doit donner les mêmes repères. */}
            {post.place ? (
              <Pressable
                onPress={() => post.place?.id && router.push(`/place?id=${post.place.id}` as never)}
                hitSlop={6}
              >
                <Text style={styles.place} numberOfLines={1}>📍 {post.place.name}</Text>
              </Pressable>
            ) : null}
            {post.caption ? <Text style={styles.caption} numberOfLines={3}>{post.caption}</Text> : null}

            <View style={styles.actions}>
              <Pressable style={styles.action} onPress={onLike} hitSlop={8}>
                <Text style={styles.icon}>{post.likedByMe ? '❤️' : '🤍'}</Text>
                {!post.hideLikeCount ? <Text style={styles.count}>{formatCount(post.likesCount)}</Text> : null}
              </Pressable>

              {!post.commentsDisabled ? (
                <Pressable style={styles.action} onPress={onComment} hitSlop={8}>
                  <Text style={styles.icon}>💬</Text>
                  <Text style={styles.count}>{formatCount(post.commentsCount)}</Text>
                </Pressable>
              ) : null}

              <View style={styles.action}>
                <Text style={styles.icon}>👁</Text>
                <Text style={styles.count}>{formatCount(post.viewsCount)}</Text>
              </View>

              <View style={{ flex: 1 }} />

              <Pressable style={styles.action} onPress={onSave} hitSlop={8}>
                <Text style={styles.icon}>{post.savedByMe ? '🔖' : '📑'}</Text>
              </Pressable>
            </View>
          </LinearGradient>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  close: {
    position: 'absolute',
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 10,
  },
  closeIcon: { color: '#fff', fontSize: 18, fontWeight: '600' },
  counter: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  counterText: { color: '#fff', ...typography.caption },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
    gap: 4,
  },
  music: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    maxWidth: '85%',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    marginBottom: 6,
  },
  musicArtwork: { width: 24, height: 24, borderRadius: 4 },
  musicTitle: { color: '#fff', ...typography.caption, fontWeight: '700' },
  musicArtist: { color: 'rgba(255,255,255,0.75)', ...typography.caption },
  musicToggle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  musicToggleIcon: { color: '#fff', fontSize: 10, fontWeight: '700' },
  author: { color: '#fff', ...typography.body, fontWeight: '700' },
  caption: { color: 'rgba(255,255,255,0.9)', ...typography.caption, lineHeight: 18 },
  place: { color: '#fff', ...typography.caption, fontWeight: '600', marginBottom: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.sm },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  icon: { fontSize: 22 },
  count: { color: '#fff', ...typography.caption, fontWeight: '600' },
});
