import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Modal, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard, PressableScale, Reveal } from '../components/ui';
import { useAuth } from '../lib/auth-context';
import { safeMeta } from '../lib/universeMeta';
import { colors, gradients, radius, spacing, typography } from '../theme/tokens';
import {
  favoritesApi,
  type FavoriteCollection, type FavoriteItem, type FavoriteKind, type FavoriteSort,
} from '../lib/favorites-api';

/** Onglet de type — `null` signifie « tout ». */
type KindFilter = FavoriteKind | null;

const SORT_LABEL: Record<FavoriteSort, string> = {
  recent: 'Récents',
  oldest: 'Anciens',
  name: 'A → Z',
};

/**
 * Espace Favoris unifié : lieux et publications enregistrées au même endroit,
 * organisables en collections communes.
 *
 * Remplace les deux écrans historiques (« Mes adresses » et « Enregistrements »)
 * qui ne se parlaient pas.
 */
export default function FavoritesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accessToken } = useAuth();

  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [collections, setCollections] = useState<FavoriteCollection[]>([]);
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [kind, setKind] = useState<KindFilter>(null);
  const [sort, setSort] = useState<FavoriteSort>('recent');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [assigning, setAssigning] = useState<FavoriteItem | null>(null);

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!accessToken) return;
    if (!opts.silent) setLoading(true);
    const [list, cols] = await Promise.all([
      favoritesApi.list(accessToken, {
        collectionId: activeCollection ?? undefined,
        q: search.trim() || undefined,
        kind: kind ?? undefined,
        sort,
      }),
      favoritesApi.collections(accessToken),
    ]);
    setItems(list);
    setCollections(cols);
    setLoading(false);
    setRefreshing(false);
  }, [accessToken, activeCollection, search, kind, sort]);

  // La recherche est temporisée : sans ça, chaque frappe déclencherait un
  // aller-retour réseau.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void load({ silent: true }), 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [load]);

  // Recharge au retour sur l'écran : un favori a pu être ajouté ailleurs.
  useFocusEffect(useCallback(() => { void load({ silent: true }); }, [load]));

  const createCollection = async () => {
    const name = newName.trim();
    if (!accessToken || !name) return;
    await favoritesApi.createCollection(accessToken, name);
    setNewName('');
    setShowCreate(false);
    void load({ silent: true });
  };

  const removeCollection = (c: FavoriteCollection) => {
    Alert.alert(
      'Supprimer la collection',
      `« ${c.name} » sera supprimée. Son contenu reste dans tes favoris.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            if (!accessToken) return;
            await favoritesApi.deleteCollection(accessToken, c.id);
            if (activeCollection === c.id) setActiveCollection(null);
            void load({ silent: true });
          },
        },
      ],
    );
  };

  const assignTo = async (collectionId: string | null) => {
    if (!accessToken || !assigning) return;
    await favoritesApi.setCollection(accessToken, assigning.kind, assigning.id, collectionId);
    setAssigning(null);
    void load({ silent: true });
  };

  const openItem = (item: FavoriteItem) => {
    if (item.kind === 'post') router.push(`/post/${item.id}` as never);
    else router.push(`/place?id=${item.id}` as never);
  };

  const total = useMemo(
    () => collections.reduce((n, c) => n + c.itemsCount, 0),
    [collections],
  );

  return (
    <View style={styles.screen}>
      {/* Dégradé d'ambiance discret en haut d'écran */}
      <LinearGradient
        colors={gradients.brandSoft}
        style={styles.ambient}
        pointerEvents="none"
      />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <PressableScale onPress={() => router.back()} hitSlop={12} style={styles.headerBtn}>
          <Text style={styles.headerIcon}>←</Text>
        </PressableScale>
        <Text style={styles.headerTitle}>Favoris</Text>
        <PressableScale onPress={() => setShowCreate(true)} hitSlop={12} style={styles.headerBtn}>
          <Text style={styles.headerIcon}>＋</Text>
        </PressableScale>
      </View>

      {/* Recherche */}
      <GlassCard variant="pill" rounded={radius.pill} style={styles.searchCard} sheen={false}>
        <View style={styles.searchInner}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher dans mes favoris"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <PressableScale onPress={() => setSearch('')} hitSlop={10}>
              <Text style={styles.searchClear}>✕</Text>
            </PressableScale>
          )}
        </View>
      </GlassCard>

      {/* Collections */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        <Chip
          label={`Tout${total ? ` · ${items.length}` : ''}`}
          active={activeCollection === null}
          onPress={() => setActiveCollection(null)}
        />
        {collections.map((c) => (
          <Chip
            key={c.id}
            label={`${c.name} · ${c.itemsCount}`}
            active={activeCollection === c.id}
            onPress={() => setActiveCollection(c.id)}
            onLongPress={() => removeCollection(c)}
          />
        ))}
      </ScrollView>

      {/* Filtres de type + tri */}
      <View style={styles.filters}>
        <View style={styles.kindRow}>
          {([null, 'place', 'post'] as KindFilter[]).map((k) => (
            <PressableScale
              key={String(k)}
              scaleTo={0.94}
              onPress={() => setKind(k)}
              style={[styles.kindBtn, kind === k && styles.kindBtnActive]}
            >
              <Text style={[styles.kindTxt, kind === k && styles.kindTxtActive]}>
                {k === null ? 'Tout' : k === 'place' ? '📍 Lieux' : '🖼️ Posts'}
              </Text>
            </PressableScale>
          ))}
        </View>

        <PressableScale
          scaleTo={0.94}
          onPress={() => setSort((s) => (s === 'recent' ? 'name' : s === 'name' ? 'oldest' : 'recent'))}
          style={styles.sortBtn}
        >
          <Text style={styles.sortTxt}>⇅ {SORT_LABEL[sort]}</Text>
        </PressableScale>
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => `${i.kind}-${i.id}`}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void load({ silent: true }); }}
              tintColor={colors.brand}
            />
          }
          ListEmptyComponent={<EmptyState search={search} collection={activeCollection} />}
          renderItem={({ item, index }) => (
            <Reveal index={Math.min(index, 8)}>
              <FavoriteRow
                item={item}
                onPress={() => openItem(item)}
                onOrganize={() => setAssigning(item)}
              />
            </Reveal>
          )}
        />
      )}

      <CreateCollectionModal
        visible={showCreate}
        name={newName}
        onChangeName={setNewName}
        onClose={() => setShowCreate(false)}
        onCreate={() => void createCollection()}
      />

      <AssignModal
        item={assigning}
        collections={collections}
        onClose={() => setAssigning(null)}
        onAssign={(id) => void assignTo(id)}
      />
    </View>
  );
}

// ── Sous-composants ──────────────────────────────────────────────────────────

function Chip({
  label, active, onPress, onLongPress,
}: {
  label: string; active: boolean; onPress: () => void; onLongPress?: () => void;
}) {
  return (
    <PressableScale scaleTo={0.94} onPress={onPress} onLongPress={onLongPress}>
      <View style={[styles.chip, active && styles.chipActive]}>
        <Text style={[styles.chipTxt, active && styles.chipTxtActive]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

function FavoriteRow({
  item, onPress, onOrganize,
}: {
  item: FavoriteItem; onPress: () => void; onOrganize: () => void;
}) {
  const meta = item.universe ? safeMeta(item.universe) : null;

  return (
    <PressableScale onPress={onPress} scaleTo={0.98} style={styles.rowWrap}>
      <GlassCard rounded={radius.md}>
        <View style={styles.row}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbFallback]}>
              <Text style={styles.thumbEmoji}>
                {item.kind === 'post' ? '🖼️' : meta?.emoji ?? '📍'}
              </Text>
            </View>
          )}

          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.rowMeta} numberOfLines={1}>
              {item.kind === 'post' ? 'Publication' : meta?.labelFr ?? 'Lieu'}
              {item.subtitle ? ` · ${item.subtitle}` : ''}
            </Text>
          </View>

          <PressableScale onPress={onOrganize} hitSlop={12} style={styles.organize}>
            <Text style={styles.organizeIcon}>⋯</Text>
          </PressableScale>
        </View>
      </GlassCard>
    </PressableScale>
  );
}

function EmptyState({ search, collection }: { search: string; collection: string | null }) {
  const message = search
    ? 'Aucun favori ne correspond à cette recherche.'
    : collection
      ? 'Cette collection est encore vide. Range-y un favori depuis le menu ⋯.'
      : 'Appuie sur ❤️ sur un lieu ou une publication pour le retrouver ici.';

  return (
    <View style={styles.empty}>
      <Text style={styles.emptyEmoji}>{search ? '🔍' : '❤️'}</Text>
      <Text style={styles.emptyTitle}>{search ? 'Rien trouvé' : 'Aucun favori'}</Text>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

function CreateCollectionModal({
  visible, name, onChangeName, onClose, onCreate,
}: {
  visible: boolean; name: string;
  onChangeName: (v: string) => void; onClose: () => void; onCreate: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <PressableScale onPress={onClose} scaleTo={1} style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Nouvelle collection</Text>
          <Text style={styles.sheetHint}>
            Une collection peut contenir aussi bien des lieux que des publications.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Ex. Week-end, Road trip, À tester"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={onChangeName}
            autoFocus
            maxLength={40}
          />
          <PressableScale
            haptic
            onPress={onCreate}
            disabled={!name.trim()}
            style={[styles.primaryBtn, !name.trim() && styles.primaryBtnDisabled]}
          >
            <Text style={styles.primaryBtnTxt}>Créer</Text>
          </PressableScale>
        </View>
      </PressableScale>
    </Modal>
  );
}

function AssignModal({
  item, collections, onClose, onAssign,
}: {
  item: FavoriteItem | null;
  collections: FavoriteCollection[];
  onClose: () => void;
  onAssign: (collectionId: string | null) => void;
}) {
  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
      <PressableScale onPress={onClose} scaleTo={1} style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Ranger dans…</Text>
          <Text style={styles.sheetHint} numberOfLines={1}>{item?.title}</Text>

          <ScrollView style={styles.assignList}>
            {collections.map((c) => (
              <PressableScale
                key={c.id}
                onPress={() => onAssign(c.id)}
                style={[styles.assignRow, item?.collectionId === c.id && styles.assignRowActive]}
              >
                <Text style={styles.assignName}>{c.name}</Text>
                <Text style={styles.assignCount}>
                  {item?.collectionId === c.id ? '✓' : c.itemsCount}
                </Text>
              </PressableScale>
            ))}
            {collections.length === 0 && (
              <Text style={styles.assignEmpty}>
                Aucune collection. Crée-en une avec ＋ en haut de l'écran.
              </Text>
            )}
          </ScrollView>

          {item?.collectionId && (
            <PressableScale onPress={() => onAssign(null)} style={styles.removeBtn}>
              <Text style={styles.removeTxt}>Retirer de la collection</Text>
            </PressableScale>
          )}
        </View>
      </PressableScale>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  ambient: { position: 'absolute', top: 0, left: 0, right: 0, height: 260 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
  },
  headerBtn: { width: 40 },
  headerIcon: { fontSize: 24, color: colors.textPrimary, fontWeight: '700' },
  headerTitle: { ...typography.title, color: colors.textPrimary },

  searchCard: { marginHorizontal: spacing.md, marginBottom: spacing.sm },
  searchInner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  searchIcon: { fontSize: 15 },
  searchInput: { flex: 1, ...typography.body, color: colors.textPrimary, padding: 0 },
  searchClear: { ...typography.body, color: colors.textMuted },

  chips: { paddingHorizontal: spacing.md, gap: spacing.sm, paddingBottom: spacing.sm },
  chip: {
    backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border, borderRadius: radius.pill,
    paddingHorizontal: 14, paddingVertical: 7, maxWidth: 190,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  chipTxtActive: { color: '#fff', fontWeight: '700' },

  filters: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm,
  },
  kindRow: {
    flexDirection: 'row', backgroundColor: colors.surface,
    borderRadius: radius.pill, padding: 3, gap: 2,
  },
  kindBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill },
  kindBtnActive: { backgroundColor: colors.surfaceElevated },
  kindTxt: { ...typography.caption, color: colors.textMuted, fontWeight: '600' },
  kindTxtActive: { color: colors.textPrimary, fontWeight: '700' },
  sortBtn: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: radius.pill, backgroundColor: colors.surface,
  },
  sortTxt: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },

  list: { paddingHorizontal: spacing.md, gap: spacing.sm },
  rowWrap: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, gap: spacing.md },
  thumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceElevated },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  thumbEmoji: { fontSize: 24 },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  rowMeta: { ...typography.caption, color: colors.textMuted },
  organize: { paddingHorizontal: spacing.sm },
  organizeIcon: { fontSize: 20, color: colors.textMuted, letterSpacing: 1 },

  empty: { alignItems: 'center', paddingTop: 90, gap: spacing.sm },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { ...typography.title, color: colors.textPrimary },
  emptyText: {
    ...typography.body, color: colors.textSecondary,
    textAlign: 'center', paddingHorizontal: spacing.xl, lineHeight: 21,
  },

  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  sheet: {
    width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  sheetTitle: { ...typography.heading, color: colors.textPrimary },
  sheetHint: { ...typography.caption, color: colors.textMuted, marginBottom: 4 },
  input: {
    backgroundColor: colors.surfaceElevated, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    color: colors.textPrimary, ...typography.body,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  primaryBtn: {
    backgroundColor: colors.brand, borderRadius: radius.md,
    paddingVertical: 13, alignItems: 'center', marginTop: 4,
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnTxt: { ...typography.body, color: '#fff', fontWeight: '700' },

  assignList: { maxHeight: 280 },
  assignRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, paddingHorizontal: spacing.md,
    borderRadius: radius.md, marginBottom: 4,
    backgroundColor: colors.surfaceElevated,
  },
  assignRowActive: { backgroundColor: `${colors.brand}26` },
  assignName: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  assignCount: { ...typography.caption, color: colors.textMuted },
  assignEmpty: {
    ...typography.caption, color: colors.textMuted,
    textAlign: 'center', paddingVertical: spacing.lg, lineHeight: 19,
  },
  removeBtn: { paddingVertical: 12, alignItems: 'center' },
  removeTxt: { ...typography.body, color: colors.danger, fontWeight: '600' },
});
