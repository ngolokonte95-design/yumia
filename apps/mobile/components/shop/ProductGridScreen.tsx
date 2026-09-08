/**
 * Écran de listing produits — mutualisé entre un rayon (`/shop/category/[slug]`)
 * et la recherche (`/shop/search`) : même grille, mêmes filtres, même tri, seule
 * la source du titre et le filtre initial changent.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { shopApi, type ProductListItem, type ProductQuery } from '../../lib/shop-api';
import { ProductCard } from './ProductCard';

const SORTS: { key: NonNullable<ProductQuery['sort']>; label: string }[] = [
  { key: 'relevance', label: 'Pertinence' },
  { key: 'bestsellers', label: 'Meilleures ventes' },
  { key: 'price_asc', label: 'Prix croissant' },
  { key: 'price_desc', label: 'Prix décroissant' },
  { key: 'rating', label: 'Mieux notés' },
  { key: 'newest', label: 'Nouveautés' },
];

const PAGE_SIZE = 20;

interface Props {
  title: string;
  /** Filtres imposés par la route (rayon, recherche...), non modifiables par l'utilisateur. */
  baseQuery: ProductQuery;
  /** Affiche le champ de recherche (écran Recherche uniquement). */
  showSearchInput?: boolean;
  /**
   * Onglets de sous-rayon (Femme / Homme / Enfant). Absents pour un rayon
   * simple : la barre n'est alors pas rendue du tout.
   */
  tabs?: Array<{ key: string; label: string }>;
  activeTab?: string;
  onTabChange?: (key: string) => void;
}

export function ProductGridScreen({
  title,
  baseQuery,
  showSearchInput,
  tabs,
  activeTab,
  onTabChange,
}: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();

  const [items, setItems] = useState<ProductListItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [search, setSearch] = useState(baseQuery.q ?? '');
  const [sort, setSort] = useState<ProductQuery['sort']>(baseQuery.sort ?? 'relevance');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minRating, setMinRating] = useState<number | undefined>();

  /** Euros saisis → centimes attendus par l'API. */
  const toCents = (v: string): number | undefined => {
    const n = parseFloat(v.replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : undefined;
  };

  const fetchPage = useCallback(async (targetPage: number, append: boolean) => {
    if (!accessToken) return;
    try {
      const res = await shopApi.products(accessToken, {
        ...baseQuery,
        q: search.trim() || baseQuery.q,
        sort,
        minPrice: toCents(minPrice),
        maxPrice: toCents(maxPrice),
        minRating,
        page: targetPage,
        pageSize: PAGE_SIZE,
      });
      setItems((prev) => (append ? [...prev, ...res.items] : res.items));
      setHasMore(res.hasMore);
      setTotal(res.total);
      setPage(res.page);
    } catch {
      if (!append) setItems([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  // `baseQuery` est un objet littéral recréé à chaque rendu : le sérialiser
  // évite une boucle de rechargement infinie.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, JSON.stringify(baseQuery), search, sort, minPrice, maxPrice, minRating]);

  useEffect(() => {
    setLoading(true);
    void fetchPage(1, false);
  }, [fetchPage]);

  function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    void fetchPage(page + 1, true);
  }

  const activeFilters = [minPrice, maxPrice].filter(Boolean).length + (minRating ? 1 : 0);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {!loading && <Text style={styles.count}>{total} produit{total > 1 ? 's' : ''}</Text>}
        </View>
        <Pressable onPress={() => router.push('/shop/cart' as never)} hitSlop={8}>
          <Text style={styles.cartIcon}>🛒</Text>
        </Pressable>
      </View>

      {showSearchInput && (
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher un produit"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
        </View>
      )}

      {tabs && tabs.length > 0 && (
        <View style={styles.tabRow}>
          {tabs.map((t) => (
            <Pressable
              key={t.key}
              style={[styles.tab, activeTab === t.key && styles.tabActive]}
              onPress={() => onTabChange?.(t.key)}
            >
              <Text style={[styles.tabTxt, activeTab === t.key && styles.tabTxtActive]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Tri + filtres */}
      <View style={styles.toolbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow}>
          {SORTS.map((s) => (
            <Pressable
              key={s.key}
              style={[styles.sortChip, sort === s.key && styles.sortChipActive]}
              onPress={() => setSort(s.key)}
            >
              <Text style={[styles.sortTxt, sort === s.key && styles.sortTxtActive]}>{s.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable style={styles.filterBtn} onPress={() => setFiltersOpen(true)}>
          <Text style={styles.filterTxt}>Filtres{activeFilters ? ` (${activeFilters})` : ''}</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🔍</Text>
          <Text style={styles.emptyTitle}>Aucun produit</Text>
          <Text style={styles.emptyText}>Essaie d'élargir tes filtres ou de changer de recherche.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={styles.column}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
          renderItem={({ item }) => (
            <View style={styles.gridCell}>
              <ProductCard product={item} variant="grid" onPress={() => router.push(`/shop/product/${item.slug}` as never)} />
            </View>
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing.md }} /> : null}
        />
      )}

      {/* Filtres */}
      <Modal visible={filtersOpen} animationType="slide" transparent onRequestClose={() => setFiltersOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFiltersOpen(false)}>
          <Pressable style={[styles.modalSheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Filtres</Text>

            <Text style={styles.fieldLabel}>Prix (€)</Text>
            <View style={styles.priceRow}>
              <TextInput
                style={styles.priceInput}
                placeholder="Min"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                value={minPrice}
                onChangeText={setMinPrice}
              />
              <Text style={styles.priceSep}>—</Text>
              <TextInput
                style={styles.priceInput}
                placeholder="Max"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                value={maxPrice}
                onChangeText={setMaxPrice}
              />
            </View>

            <Text style={styles.fieldLabel}>Note minimum</Text>
            <View style={styles.ratingRow}>
              {[undefined, 3, 4, 4.5].map((r) => (
                <Pressable
                  key={String(r)}
                  style={[styles.ratingChip, minRating === r && styles.ratingChipActive]}
                  onPress={() => setMinRating(r)}
                >
                  <Text style={[styles.ratingTxt, minRating === r && styles.ratingTxtActive]}>
                    {r ? `★ ${r}+` : 'Toutes'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.resetBtn}
                onPress={() => { setMinPrice(''); setMaxPrice(''); setMinRating(undefined); }}
              >
                <Text style={styles.resetTxt}>Réinitialiser</Text>
              </Pressable>
              <Pressable style={styles.applyBtn} onPress={() => setFiltersOpen(false)}>
                <Text style={styles.applyTxt}>Voir les résultats</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  back: { fontSize: 24, color: colors.brandSoft },
  title: { ...typography.h3, color: colors.textPrimary },
  count: { fontSize: 12, color: colors.textMuted },
  cartIcon: { fontSize: 22 },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: spacing.md,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 14, paddingVertical: 10 },

  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingRight: spacing.md, paddingVertical: spacing.sm },
  sortRow: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.md },
  // Les onglets se partagent la largeur : trois ou quatre sous-rayons tiennent
  // toujours sur une ligne, sans défilement horizontal.
  tabRow: {
    flexDirection: 'row', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingBottom: spacing.xs,
  },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: 7,
    borderRadius: radius.pill, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.surface,
  },
  tabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabTxt: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  tabTxtActive: { color: '#fff' },
  sortChip: {
    backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 7,
  },
  sortChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  sortTxt: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  sortTxtActive: { color: '#fff' },
  filterBtn: {
    backgroundColor: colors.surfaceElevated, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 7,
  },
  filterTxt: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { ...typography.h3, color: colors.textPrimary },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },

  list: { paddingHorizontal: spacing.md, gap: spacing.sm },
  column: { gap: spacing.sm },
  gridCell: { flex: 1, marginBottom: spacing.sm },

  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.lg, gap: spacing.sm,
  },
  modalTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm },
  fieldLabel: { ...typography.label, color: colors.textSecondary, marginTop: spacing.sm },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  priceInput: {
    flex: 1, backgroundColor: colors.surfaceElevated, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md,
    paddingVertical: 10, color: colors.textPrimary,
  },
  priceSep: { color: colors.textMuted },
  ratingRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  ratingChip: {
    backgroundColor: colors.surfaceElevated, borderRadius: radius.pill, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 7,
  },
  ratingChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  ratingTxt: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  ratingTxtActive: { color: '#fff' },

  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  resetBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border,
  },
  resetTxt: { color: colors.textSecondary, fontWeight: '700' },
  applyBtn: { flex: 2, alignItems: 'center', paddingVertical: 14, borderRadius: radius.pill, backgroundColor: colors.brand },
  applyTxt: { color: '#fff', fontWeight: '800' },
});
