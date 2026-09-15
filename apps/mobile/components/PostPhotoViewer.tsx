/**
 * Photo d'une publication en plein écran, avec ses actions.
 *
 * `PhotoViewer` reste l'afficheur nu, utilisé par le chat et les fiches de
 * lieu où il n'y a rien à aimer ni à commenter. Ici on ajoute ce qu'une
 * publication apporte : auteur, légende, j'aime, commentaires, partage,
 * enregistrement.
 *
 * Deux principes de mise en page :
 *  - **La photo reste la plus grande possible.** Les actions flottent par
 *    dessus, sur un dégradé, et ne rognent rien.
 *  - **Un appui sur l'image efface tout.** On revient à la photo seule, sans
 *    quitter l'écran — c'est le geste attendu quand on veut vraiment la voir.
 *
 * Les actions sont exécutées ici plutôt que déléguées à l'écran appelant :
 * c'est ce qui permet d'ouvrir cette visionneuse depuis le fil ET depuis les
 * deux écrans de profil sans que chacun ait à câbler les mêmes appels.
 */
import { useCallback, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { feedApi, type FeedPost } from '../lib/feed-api';
import { formatCount } from '../lib/format-count';

interface Props {
  post: FeedPost;
  /** Image affichée à l'ouverture, quand la publication en compte plusieurs. */
  initialIndex?: number;
  onClose: () => void;
  /** Remonte le nouvel état à l'écran appelant, pour que sa liste suive. */
  onChange?: (patch: Partial<FeedPost>) => void;
}

export function PostPhotoViewer({ post, initialIndex = 0, onClose, onChange }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();

  const [index, setIndex] = useState(initialIndex);
  const [chrome, setChrome] = useState(true);
  const [liked, setLiked] = useState(post.likedByMe);
  const [likes, setLikes] = useState(post.likesCount);
  const [saved, setSaved] = useState(post.savedByMe);

  const toggleLike = useCallback(async () => {
    if (!accessToken) return;
    // Optimiste : le cœur réagit au doigt, pas au réseau.
    const next = !liked;
    const nextCount = likes + (next ? 1 : -1);
    setLiked(next);
    setLikes(nextCount);
    onChange?.({ likedByMe: next, likesCount: nextCount });

    const res = await feedApi.toggleLike(accessToken, post.id);
    setLiked(res.liked);
    setLikes(res.likesCount);
    onChange?.({ likedByMe: res.liked, likesCount: res.likesCount });
  }, [accessToken, liked, likes, post.id, onChange]);

  const toggleSave = useCallback(async () => {
    if (!accessToken) return;
    const next = !saved;
    setSaved(next);
    onChange?.({ savedByMe: next });
    const res = await feedApi.toggleSave(accessToken, post.id);
    setSaved(res.saved);
    onChange?.({ savedByMe: res.saved });
  }, [accessToken, saved, post.id, onChange]);

  /** Les commentaires vivent sur la page de la publication : on y va. */
  const openComments = useCallback(() => {
    onClose();
    router.push(`/post/${post.id}` as never);
  }, [onClose, router, post.id]);

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.screen}>
        {Platform.OS === 'android' ? <StatusBar hidden /> : null}

        <FlatList
          data={post.mediaUrls}
          keyExtractor={(uri, i) => `${uri}-${i}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            <Pressable style={{ width, height }} onPress={() => setChrome((c) => !c)}>
              <Image
                source={{ uri: item }}
                style={{ width, height }}
                contentFit="contain"
                cachePolicy="memory-disk"
                recyclingKey={item}
              />
            </Pressable>
          )}
        />

        {chrome ? (
          <>
            <Pressable style={[styles.close, { top: insets.top + 12 }]} onPress={onClose} hitSlop={12}>
              <Text style={styles.closeIcon}>✕</Text>
            </Pressable>

            {post.mediaUrls.length > 1 ? (
              <View style={[styles.counter, { top: insets.top + 12 }]}>
                <Text style={styles.counterText}>{index + 1} / {post.mediaUrls.length}</Text>
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
              {post.caption ? (
                <Text style={styles.caption} numberOfLines={3}>{post.caption}</Text>
              ) : null}

              <View style={styles.actions}>
                <Pressable style={styles.action} onPress={() => void toggleLike()} hitSlop={8}>
                  <Text style={styles.icon}>{liked ? '❤️' : '🤍'}</Text>
                  {!post.hideLikeCount ? <Text style={styles.count}>{formatCount(likes)}</Text> : null}
                </Pressable>

                {!post.commentsDisabled ? (
                  <Pressable style={styles.action} onPress={openComments} hitSlop={8}>
                    <Text style={styles.icon}>💬</Text>
                    <Text style={styles.count}>{formatCount(post.commentsCount)}</Text>
                  </Pressable>
                ) : null}

                <View style={styles.action}>
                  <Text style={styles.icon}>👁</Text>
                  <Text style={styles.count}>{formatCount(post.viewsCount)}</Text>
                </View>

                <View style={{ flex: 1 }} />

                <Pressable style={styles.action} onPress={() => void toggleSave()} hitSlop={8}>
                  <Text style={styles.icon}>{saved ? '🔖' : '📑'}</Text>
                </Pressable>
              </View>
            </LinearGradient>
          </>
        ) : null}
      </View>
    </Modal>
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
