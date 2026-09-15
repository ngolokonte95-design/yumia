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
import { useCallback, useRef, useState } from 'react';
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
import { PostVideo } from './PostVideo';

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
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();

  const [current, setCurrent] = useState(initialIndex);
  const [chrome, setChrome] = useState(true);
  /**
   * État local des actions, par publication.
   *
   * Le cœur doit réagir au doigt et non au réseau ; `posts` vient de l'écran
   * appelant et ne se met pas à jour tout seul.
   */
  const [patches, setPatches] = useState<Record<string, Partial<FeedPost>>>({});

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
      <View style={styles.screen}>
        {Platform.OS === 'android' ? <StatusBar hidden /> : null}

        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          renderItem={({ item, index }) => (
            <PostPage
              post={{ ...item, ...patches[item.id] }}
              width={width}
              height={height}
              active={index === current}
              chrome={chrome}
              onToggleChrome={() => setChrome((c) => !c)}
              insets={insets}
              initialImageIndex={index === initialIndex ? initialImageIndex : 0}
              onLike={() => void toggleLike(item)}
              onSave={() => void toggleSave(item)}
              onComment={() => openComments(item.id)}
            />
          )}
        />

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
  post, width, height, active, chrome, onToggleChrome, insets, initialImageIndex, onLike, onSave, onComment,
}: {
  post: FeedPost;
  width: number;
  height: number;
  active: boolean;
  chrome: boolean;
  onToggleChrome: () => void;
  insets: { top: number; bottom: number };
  initialImageIndex: number;
  onLike: () => void;
  onSave: () => void;
  onComment: () => void;
}) {
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
          isVideoUrl(uri) ? (
            // Le lecteur n'est actif que sur la publication affichée ET sur la
            // diapositive regardée : deux vidéos ne jouent jamais ensemble.
            <View style={{ width, height }}>
              <PostVideo
                uri={uri}
                style={{ width, height }}
                active={active && index === imageIndex}
                posterUri={post.coverUrl}
                overlays={post.overlays}
                videoMuted={post.videoMuted}
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
            {post.user?.displayName ? (
              <Text style={styles.author} numberOfLines={1}>{post.user.displayName}</Text>
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
  author: { color: '#fff', ...typography.body, fontWeight: '700' },
  caption: { color: 'rgba(255,255,255,0.9)', ...typography.caption, lineHeight: 18 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.sm },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  icon: { fontSize: 22 },
  count: { color: '#fff', ...typography.caption, fontWeight: '600' },
});
