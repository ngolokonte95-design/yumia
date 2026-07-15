import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Image, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';

const API = API_BASE_URL;
const { width: SCREEN_W } = Dimensions.get('window');
const GRID_ITEM = (SCREEN_W - 3) / 3;

interface Post { id: string; mediaUrls: string[]; caption?: string | null }

/** Archivés & brouillons — posts masqués sans suppression + posts non publiés. */
export default function ArchiveScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'archived' | 'drafts'>('archived');
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    const res = await fetch(`${API}/posts/${tab}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) setPosts(await res.json());
    setLoading(false);
  }, [accessToken, tab]);

  useEffect(() => { void load(); }, [load]);

  const act = (post: Post) => {
    if (!accessToken) return;
    const h = { Authorization: `Bearer ${accessToken}` };
    if (tab === 'archived') {
      Alert.alert(post.caption ?? 'Publication archivée', undefined, [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Restaurer sur le profil',
          onPress: async () => { await fetch(`${API}/posts/${post.id}/archive`, { method: 'POST', headers: h }); void load(); },
        },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => { await fetch(`${API}/posts/${post.id}`, { method: 'DELETE', headers: h }); void load(); },
        },
      ]);
    } else {
      Alert.alert(post.caption ?? 'Brouillon', undefined, [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Publier maintenant',
          onPress: async () => { await fetch(`${API}/posts/${post.id}/publish`, { method: 'POST', headers: h }); void load(); },
        },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => { await fetch(`${API}/posts/${post.id}`, { method: 'DELETE', headers: h }); void load(); },
        },
      ]);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.title}>Archivés & brouillons</Text>
        <View style={{ width: 30 }} />
      </View>

      <View style={styles.tabs}>
        {(['archived', 'drafts'] as const).map((t) => (
          <Pressable key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabTxt, tab === t && styles.tabTxtActive]}>
              {t === 'archived' ? '📁 Archivés' : '📝 Brouillons'}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={posts}
          numColumns={3}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          renderItem={({ item }) => (
            <Pressable style={styles.gridItem} onPress={() => act(item)}>
              {item.mediaUrls[0] ? (
                <Image source={{ uri: item.mediaUrls[0] }} style={styles.gridImg} />
              ) : (
                <View style={[styles.gridImg, styles.gridPlaceholder]}><Text style={{ fontSize: 22 }}>📷</Text></View>
              )}
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 44, marginBottom: 10 }}>{tab === 'archived' ? '📁' : '📝'}</Text>
              <Text style={styles.emptyTxt}>
                {tab === 'archived'
                  ? 'Aucun post archivé.\nAppui long sur un post de ton profil → Archiver.'
                  : 'Aucun brouillon.\nDans « Nouvelle publication », choisis « Enregistrer comme brouillon ».'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { fontSize: 22, color: colors.brand },
  title: { ...typography.h3, color: colors.text },
  tabs: { flexDirection: 'row', margin: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: radius.md },
  tabBtnActive: { backgroundColor: colors.background },
  tabTxt: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  tabTxtActive: { color: colors.brand, fontWeight: '700' },
  gridItem: { width: GRID_ITEM, height: GRID_ITEM, margin: 0.5 },
  gridImg: { width: '100%', height: '100%' },
  gridPlaceholder: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 40 },
  emptyTxt: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
});
