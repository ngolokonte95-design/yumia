import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Dimensions, Image, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { feedApi, type StoryGroup } from '../lib/feed-api';
import { colors, spacing } from '../theme/tokens';

const { width } = Dimensions.get('window');
const STORY_MS = 5000;

export default function StoryViewerScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [group, setGroup] = useState<StoryGroup | null>(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!accessToken || !userId) return;
    void (async () => {
      const groups = await feedApi.globalStories(accessToken);
      setGroup(groups.find((g) => g.user?.id === userId) ?? null);
      setLoading(false);
    })();
  }, [accessToken, userId]);

  const close = useCallback(() => router.back(), [router]);

  const next = useCallback(() => {
    setIndex((i) => {
      if (!group) return i;
      if (i + 1 >= group.stories.length) { close(); return i; }
      return i + 1;
    });
  }, [group, close]);

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Auto-avance + marque comme vue
  useEffect(() => {
    if (!group || !group.stories[index]) return;
    if (accessToken) void feedApi.markStoryViewed(accessToken, group.stories[index].id);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(next, STORY_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [group, index, next, accessToken]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#fff" /></View>;
  }
  if (!group || group.stories.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Aucune story active</Text>
        <Pressable onPress={close} style={styles.closeFallback}><Text style={styles.closeTxt}>Fermer</Text></Pressable>
      </View>
    );
  }

  const story = group.stories[index];

  return (
    <View style={styles.container}>
      <Image source={{ uri: story.mediaUrl }} style={styles.media} resizeMode="cover" />

      {/* Barres de progression */}
      <View style={[styles.progressRow, { top: insets.top + 8 }]}>
        {group.stories.map((s, i) => (
          <View key={s.id} style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: i < index ? '100%' : i === index ? '100%' : '0%' }]} />
          </View>
        ))}
      </View>

      {/* En-tête auteur */}
      <View style={[styles.topBar, { top: insets.top + 20 }]}>
        {group.user.photoUrl ? (
          <Image source={{ uri: group.user.photoUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{group.user.displayName[0]}</Text>
          </View>
        )}
        <Text style={styles.name}>{group.user.displayName}</Text>
        <Pressable onPress={close} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
      </View>

      {story.caption ? (
        <View style={[styles.captionWrap, { bottom: insets.bottom + 40 }]}>
          <Text style={styles.caption}>{story.caption}</Text>
        </View>
      ) : null}

      {/* Zones tactiles précédent / suivant */}
      <Pressable style={styles.tapLeft} onPress={prev} />
      <Pressable style={styles.tapRight} onPress={next} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', gap: 16 },
  empty: { color: '#fff', fontSize: 16 },
  closeFallback: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.surface, borderRadius: 999 },
  closeTxt: { color: '#fff', fontWeight: '700' },
  media: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  progressRow: { position: 'absolute', left: spacing.sm, right: spacing.sm, flexDirection: 'row', gap: 4 },
  progressTrack: { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: '#fff' },
  topBar: { position: 'absolute', left: spacing.md, right: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 15 },
  close: { color: '#fff', fontSize: 22, fontWeight: '700' },
  captionWrap: { position: 'absolute', left: spacing.md, right: spacing.md, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: 12 },
  caption: { color: '#fff', fontSize: 15, textAlign: 'center' },
  tapLeft: { position: 'absolute', left: 0, top: 80, bottom: 0, width: width * 0.3 },
  tapRight: { position: 'absolute', right: 0, top: 80, bottom: 0, width: width * 0.7 },
});
