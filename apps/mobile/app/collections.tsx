/**
 * Enregistrements & collections — grille des posts enregistrés, organisables
 * en collections nommées.
 * Backend : GET /posts/saved (?collectionId=), GET/POST/DELETE /posts/collections.
 *
 * Habillage sobre (18/11/2026) : pastilles blanches/verre, vignettes à coins
 * arrondis ; seul accent de couleur : le bouton « Créer » de la fenêtre.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Image, Modal, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors, radius, spacing } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';
import type { FeedPost } from '../lib/feed-api';
import { useI18n } from '../lib/useI18n';
import { BrandButton } from '../components/social/SocialChrome';
import { GridTile, TileBadge } from '../components/p2b/ProfileVisuals';
import {
  QUIET_GLASS, QuietChip, QuietEmpty, QuietHeader, RoundGlassButton, SPINNER_COLOR,
} from '../components/pb2/Pb2Chrome';

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
  const { t } = useI18n();

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
      t('col_delete_collection_title'),
      t('col_delete_collection_body').replace('{name}', c.name),
      [
        { text: t('col_cancel'), style: 'cancel' },
        {
          text: t('col_delete'),
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
      <QuietHeader
        title={t('col_title')}
        onBack={() => router.back()}
        right={<RoundGlassButton label="＋" onPress={() => setShowCreate(true)} accessibilityLabel={t('col_new_collection')} />}
      />

      {/* Filtres collections — appui long sur une collection : la supprimer. */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <QuietChip label={t('col_all')} active={selected === null} onPress={() => selectCollection(null)} />
          {collections.map((c) => (
            <QuietChip
              key={c.id}
              label={`${c.name} · ${c.itemsCount}`}
              active={selected?.id === c.id}
              onPress={() => selectCollection(c)}
              onLongPress={() => remove(c)}
            />
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={SPINNER_COLOR} /></View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          numColumns={3}
          columnWrapperStyle={styles.gridRow}
          ItemSeparatorComponent={GridGap}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          ListEmptyComponent={
            <QuietEmpty emoji="🔖" title={t('col_empty_title')} text={t('col_empty_text')} />
          }
          renderItem={({ item, index }) => {
            const thumb = item.coverUrl ?? item.mediaUrls[0];
            return (
              <GridTile size={TILE} index={index} onPress={() => router.push(`/post/${item.id}` as never)}>
                {thumb ? (
                  <Image source={{ uri: thumb }} style={styles.cellImg} />
                ) : (
                  <View style={[styles.cellImg, styles.cellFallback]}>
                    <Text numberOfLines={3} style={styles.cellCaption}>{item.caption ?? '📝'}</Text>
                  </View>
                )}
                {item.videoUrl ? (
                  <TileBadge corner="tr"><Text style={styles.videoBadge}>▶</Text></TileBadge>
                ) : null}
              </GridTile>
            );
          }}
        />
      )}

      {/* Modale création */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowCreate(false)}>
          <Pressable style={[QUIET_GLASS, styles.sheet]} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>{t('col_new_collection')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('col_name_placeholder')}
              placeholderTextColor={colors.textMuted}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              maxLength={40}
            />
            <BrandButton
              label={t('col_create')}
              loading={creating}
              disabled={!newName.trim() || creating}
              onPress={() => void create()}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const GRID_GAP = 4;
/** Vignette : 3 par ligne, avec marges et espaces. */
const TILE = Math.floor((Dimensions.get('window').width - spacing.md * 2 - GRID_GAP * 2) / 3);

function GridGap() {
  return <View style={{ height: GRID_GAP }} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  gridRow: { gap: GRID_GAP, paddingHorizontal: spacing.md },
  cellImg: { width: '100%', height: '100%', backgroundColor: colors.surface },
  cellFallback: { alignItems: 'center', justifyContent: 'center', padding: 6 },
  cellCaption: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  videoBadge: { color: '#fff', fontSize: 10, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)', alignItems: 'center', justifyContent: 'center' },
  sheet: {
    backgroundColor: colors.bg, borderRadius: radius.xl, padding: spacing.lg, width: '86%', gap: spacing.md,
  },
  sheetTitle: { fontSize: 19, fontWeight: '900', letterSpacing: -0.3, color: colors.text },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12,
    color: colors.text, fontSize: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)',
  },
});
