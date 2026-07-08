import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, radius, spacing, typography } from '../../theme/tokens';

const API = process.env.EXPO_PUBLIC_API_URL ?? '';

interface Post {
  id: string;
  userId: string;
  caption?: string;
  mediaUrls: string[];
  likesCount: number;
  likedByMe: boolean;
  createdAt: string;
  user: { id: string; displayName: string; photoUrl?: string } | null;
  place?: { name: string; universe: string; city?: string } | null;
  comments: Array<{
    id: string; content: string; createdAt: string;
    user: { id: string; displayName: string; photoUrl?: string } | null;
  }>;
}

function formatAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'À l\'instant';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}j`;
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    const res = await fetch(`${API}/posts/${id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) setPost(await res.json());
    setLoading(false);
  }, [accessToken, id]);

  useEffect(() => { void load(); }, [load]);

  const toggleLike = async () => {
    if (!post || !accessToken) return;
    const res = await fetch(`${API}/posts/${post.id}/like`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const data = await res.json() as { liked: boolean; likesCount: number };
      setPost((p) => p ? { ...p, likedByMe: data.liked, likesCount: data.likesCount } : p);
    }
  };

  const sendComment = async () => {
    if (!comment.trim() || !post || !accessToken) return;
    setPosting(true);
    const res = await fetch(`${API}/posts/${post.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ content: comment.trim() }),
    });
    if (res.ok) {
      setComment('');
      void load();
    }
    setPosting(false);
  };

  if (loading) return <View style={[styles.center, { paddingTop: insets.top }]}><ActivityIndicator color={colors.brand} /></View>;
  if (!post) return <View style={[styles.center, { paddingTop: insets.top }]}><Text style={{ color: colors.textMuted }}>Post introuvable</Text></View>;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>←</Text></Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>
        {/* Author */}
        <Pressable style={styles.author} onPress={() => router.push(`/user/${post.user?.id}`)}>
          {post.user?.photoUrl ? (
            <Image source={{ uri: post.user.photoUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{post.user?.displayName[0]}</Text>
            </View>
          )}
          <View>
            <Text style={styles.authorName}>{post.user?.displayName}</Text>
            {post.place && <Text style={styles.placeName}>📍 {post.place.name}</Text>}
          </View>
          <Text style={styles.ago}>{formatAgo(post.createdAt)}</Text>
        </Pressable>

        {/* Images carousel */}
        {post.mediaUrls.length > 0 && (
          <View>
            <ScrollView
              horizontal pagingEnabled showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setImgIdx(Math.round(e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width))}
            >
              {post.mediaUrls.map((uri, i) => (
                <Image key={i} source={{ uri }} style={styles.postImage} />
              ))}
            </ScrollView>
            {post.mediaUrls.length > 1 && (
              <View style={styles.dots}>
                {post.mediaUrls.map((_, i) => (
                  <View key={i} style={[styles.dot, i === imgIdx && styles.dotActive]} />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable style={styles.likeBtn} onPress={toggleLike}>
            <Text style={[styles.likeIcon, post.likedByMe && styles.likeIconActive]}>
              {post.likedByMe ? '❤️' : '🤍'}
            </Text>
            <Text style={styles.likeCount}>{post.likesCount}</Text>
          </Pressable>
          <Text style={styles.commentCount}>💬 {post.comments.length}</Text>
        </View>

        {post.caption ? <Text style={styles.caption}><Text style={styles.captionUser}>{post.user?.displayName} </Text>{post.caption}</Text> : null}

        {/* Comments */}
        <View style={styles.commentsSection}>
          <Text style={styles.commentsTitle}>Commentaires</Text>
          {post.comments.map((c) => (
            <View key={c.id} style={styles.commentRow}>
              <View style={[styles.commentAvatar, { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }]}>
                {c.user?.photoUrl ? (
                  <Image source={{ uri: c.user.photoUrl }} style={styles.commentAvatar} />
                ) : (
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{c.user?.displayName[0]}</Text>
                )}
              </View>
              <View style={styles.commentBubble}>
                <Text style={styles.commentUser}>{c.user?.displayName}</Text>
                <Text style={styles.commentText}>{c.content}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Comment input */}
      <View style={[styles.commentBox, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.commentInput}
          placeholder="Ajouter un commentaire..."
          placeholderTextColor={colors.textMuted}
          value={comment}
          onChangeText={setComment}
        />
        <Pressable onPress={sendComment} disabled={!comment.trim() || posting} style={styles.sendBtn}>
          {posting ? <ActivityIndicator color={colors.brand} size="small" /> : <Text style={styles.sendTxt}>Envoyer</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: spacing.md, paddingVertical: 12 },
  back: { fontSize: 22, color: colors.brand },
  author: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  authorName: { fontWeight: '700', color: colors.text, fontSize: 14 },
  placeName: { fontSize: 12, color: colors.textMuted },
  ago: { marginLeft: 'auto', fontSize: 12, color: colors.textMuted },
  postImage: { width: 375, height: 375 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.brand },
  actions: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: 16 },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  likeIcon: { fontSize: 24 },
  likeIconActive: {},
  likeCount: { fontWeight: '700', color: colors.text, fontSize: 15 },
  commentCount: { fontSize: 15, color: colors.textMuted },
  caption: { paddingHorizontal: spacing.md, fontSize: 14, color: colors.text, lineHeight: 20, marginBottom: 8 },
  captionUser: { fontWeight: '700' },
  commentsSection: { paddingHorizontal: spacing.md },
  commentsTitle: { ...typography.h3, color: colors.text, marginBottom: 12 },
  commentRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  commentAvatar: { width: 30, height: 30, borderRadius: 15 },
  commentBubble: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 10 },
  commentUser: { fontWeight: '700', color: colors.text, fontSize: 13, marginBottom: 2 },
  commentText: { color: colors.text, fontSize: 14 },
  commentBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: spacing.md, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background,
  },
  commentInput: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.full,
    paddingHorizontal: 16, paddingVertical: 10, color: colors.text, fontSize: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  sendBtn: { paddingHorizontal: 14, paddingVertical: 10 },
  sendTxt: { color: colors.brand, fontWeight: '700', fontSize: 14 },
});
