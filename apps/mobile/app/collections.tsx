/**
 * Enregistrements & collections — grille des posts enregistrés, organisables
 * en collections nommées.
 * Backend : GET /posts/saved (?collectionId=), GET/POST/DELETE /posts/collections.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Modal, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';
import type { FeedPost } from '../lib/feed-api';

const API = API_BASE_URL;

interface Collection {
  id: string;
  name: string;
  coverUrl?: string | null;
  itemsCount: number;
}

export default function CollectionsScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [collections, setCollections] = useState<Collection[]>([]);
  const [selected, setSelected] = useState<Collection | null>(null); // null = tout
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const auth = useCallback(
    () => ({ Authorization: `Bearer ${accessToken}` }),
    [accessToken],
  );

  const loadCollections = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${API}/posts/collections`, { headers: auth() });
      if (res.ok) setCollections(await res.json() as Collection[]);
    } catch { /* best-effort */ }
  }, [accessToken, auth]);

  const loadPosts = useCallback(async (collectionId?: string) => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const qs = collectionId ? `?limit=60&collectionId=${collectionId}` : '?limit=60';
      const res = await fetch(`${API}/posts/saved${qs}`, { headers: auth() });
      if (res.ok) setPosts(await res.json() as FeedPost[]);
    } catch { /* best-effort */ }
    setLoading(false);
  }, [accessToken, auth]);

  useEffect(() => {
    void loadCollections();
    void loadPosts();
  }, [loadCollections, loadPosts]);

  const selectCollection = (c: Collection | null) => {
    setSelected(c);
    void loadPosts(c?.id);
  };

  const create = async () => {
    const name = newName.trim();
    if (!accessToken || !name) return;
    setCreating(true);
    try {
      const res = await fetch(`${API}/posts/collections`, {
        method: 'POST',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setNewName('');
        setShowCreate(false);
        await loadCollections();
      }
    } catch { /* best-effort */ }
    setCreating(false);
  };

  const remove = (c: Collection) => {
    Alert.alert(
      'Supprimer la collection',
      `« ${c.name} » sera supprimée. Les posts resteront enregistrés.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            if (!accessToken) return;
            await fetch(`${API}/posts/collections/${c.id}`, { method: 'DELETE', headers: auth() }).catch(() => undefined);
            if (selected?.id === c.id) selectCollection(null);
            await loadCollections();
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.title}>Enregistrements</Text>
        <Pressable onPress={() => setShowCreate(true)}><Text style={styles.plus}>＋</Text></Pressable>
      </View>

      {/* Filtres collections */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Pressable
            style={[styles.chip, selected === null && styles.chipActive]}
            onPress={() => selectCollection(null)}
          >
            <Text style={[styles.chipTxt, selected === null && styles.chipTxtActive]}>🔖 Tout</Text>
          </Pressable>
          {collections.map((c) => (
            <Pressable
              key={c.id}
              style={[styles.chip, selected?.id === c.id && styles.chipActive]}
              onPress={() => selectCollection(c)}
              onLongPress={() => remove(c)}
            >
              <Text style={[styles.chipTxt, selected?.id === c.id && styles.chipTxtActive]}>
                {c.name} · {c.itemsCount}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          numColumns={3}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🔖</Text>
              <Text style={styles.emptyTitle}>Aucun post enregistré</Text>
              <Text style={styles.emptyText}>
                Appuyez sur 🔖 sous une publication pour la retrouver ici.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const thumb = item.coverUrl ?? item.mediaUrls[0];
            return (
              <Pressable style={styles.cell} onPress={() => router.push(`/post/${item.id}` as never)}>
                {thumb ? (
                  <Image source={{ uri: thumb }} style={styles.cellImg} />
                ) : (
                  <View style={[styles.cellImg, styles.cellFallback]}>
                    <Text numberOfLines={3} style={styles.cellCaption}>{item.caption ?? '📝'}</Text>
                  </View>
                )}
                {item.videoUrl ? <Text style={styles.videoBadge}>▶</Text> : null}
              </Pressable>
            );
          }}
        />
      )}

      {/* Modale création */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowCreate(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>Nouvelle collection</Text>
            <TextInput
              style={styles.input}
              placeholder="Nom (ex. Restos à tester)"
              placeholderTextColor={colors.textMuted}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              maxLength={40}
            />
            <Pressable
              style={[styles.createBtn, (!newName.trim() || creating) && { opacity: 0.5 }]}
              disabled={!newName.trim() || creating}
              onPress={() => void create()}
            >
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createTxt}>Créer</Text>}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { fontSize: 22, color: colors.brand },
  title: { ...typography.h2, color: colors.text },
  plus: { fontSize: 22, color: colors.brand, width: 40, textAlign: 'right' },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.md, paddingVertical: 10 },
  chip: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { color: colors.text, fontSize: 13, fontWeight: '600' },
  chipTxtActive: { color: '#fff' },
  cell: { flex: 1 / 3, aspectRatio: 1, padding: 1 },
  cellImg: { flex: 1, backgroundColor: colors.surface },
  cellFallback: { alignItems: 'center', justifyContent: 'center', padding: 6 },
  cellCaption: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  videoBadge: { position: 'absolute', top: 6, right: 8, color: '#fff', fontSize: 12, textShadowColor: '#000', textShadowRadius: 4 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 52, marginBottom: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 40 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  sheet: { backgroundColor: colors.background, borderRadius: radius.lg, padding: spacing.lg, width: '85%', gap: 14, borderWidth: 1, borderColor: colors.border },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, borderWidth: 1, borderColor: colors.border },
  createBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  createTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
