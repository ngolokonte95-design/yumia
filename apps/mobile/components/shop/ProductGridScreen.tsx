/**
 * Écran de listing produits — mutualisé entre un rayon (`/shop/category/[slug]`)
 * et la recherche (`/shop/search`) : même grille, mêmes filtres, même tri, seule
 * la source du titre et le filtre initial changent.
 *
 * Style boutique haut de gamme (17/11/2026) : en-tête et boutons en verre,
 * onglets et tri au dégradé de marque (seule couleur d'accent), grille aérée
 * à grandes photos, feuille de filtres sombre.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, gradients, radius, spacing } from '../../theme/tokens';
import { shopApi, type ProductListItem, type ProductQuery } from '../../lib/shop-api';
import { ProductCard } from './ProductCard';
import { GlassIconButton, GhostButton, GradientButton, ShopEmpty } from './ShopChrome';
import { PressableScale, Reveal } from '../ui';
import { haptics } from '../../lib/useHaptics';
import { useI18n } from '../../lib/useI18n';

const PAGE_SIZE = 20;

interface Props {
  title: string;
  /** Filtres imposés par la route (rayon, recherche...), non modifiables par l'utilisateur. */
  baseQuery: ProductQuery;
  /** Affiche le champ de recherche en permanence (écran Recherche). */
  showSearchInput?: boolean;
  /**
   * Nom du rayon, pour une recherche limitée à ce rayon : une loupe dans
   * l'en-tête déplie le champ à la demande, sans prendre de place sinon.
   */
  searchScopeLabel?: string;
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
  searchScopeLabel,
  tabs,
  activeTab,
  onTabChange,
}: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const { t } = useI18n();

  const SORTS: { key: NonNullable<ProductQuery['sort']>; label: string }[] = [
    { key: 'relevance', label: t('shop_grid_sort_relevance') },
    { key: 'bestsellers', label: t('shop_grid_sort_bestsellers') },
    { key: 'price_asc', label: t('shop_grid_sort_price_asc') },
    { key: 'price_desc', label: t('shop_grid_sort_price_desc') },
    { key: 'rating', label: t('shop_grid_sort_rating') },
    { key: 'newest', label: t('shop_grid_sort_newest') },
  ];

  const [items, setItems] = useState<ProductListItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Deux états : ce qui est tapé, et ce qui part à l'API. Sans ce délai, chaque
  // lettre déclencherait une requête et la grille clignoterait à chaque frappe.
  const [searchInput, setSearchInput] = useState(baseQuery.q ?? '');
  const [search, setSearch] = useState(baseQuery.q ?? '');
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  const searchVisible = showSearchInput || searchOpen;
  const closeSearch = () => {
    setSearchOpen(false);
    setSearchInput('');
    setSearch('');
  };
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
        <GlassIconButton icon="←" onPress={() => router.back()} accessibilityLabel={t('gs_back')} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {/* Taille du catalogue : indicateur de pilotage, réservé à l'admin. */}
          {!loading && user?.isAdmin && <Text style={styles.count}>{t(total > 1 ? 'shop_grid_count_other' : 'shop_grid_count_one').replace('{n}', String(total))}</Text>}
        </View>
        {searchScopeLabel && !showSearchInput && (
          <GlassIconButton
            icon="🔍"
            active={searchOpen}
            onPress={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
            accessibilityLabel={searchOpen ? t('shop_grid_close_search') : t('shop_grid_search_in').replace('{scope}', searchScopeLabel)}
          />
        )}
        <GlassIconButton
          icon="🛒"
          onPress={() => router.push('/shop/cart' as never)}
          accessibilityLabel={t('shop_grid_cart_a11y')}
        />
      </View>

      {searchVisible && (
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder={searchScopeLabel ? t('shop_grid_search_in').replace('{scope}', searchScopeLabel) : t('shop_home_search_placeholder')}
            placeholderTextColor={colors.textMuted}
            value={searchInput}
            onChangeText={setSearchInput}
            // Valider n'attend pas la fin du délai de frappe.
            onSubmitEditing={() => setSearch(searchInput)}
            returnKeyType="search"
            autoFocus={searchOpen}
            autoCorrect={false}
            clearButtonMode="never"
          />
          {searchInput.length > 0 && (
            <Pressable onPress={() => { setSearchInput(''); setSearch(''); }} hitSlop={8} accessibilityLabel={t('srch_clear')}>
              <Text style={styles.clearIcon}>✕</Text>
            </Pressable>
          )}
        </View>
      )}

      {tabs && tabs.length > 0 && (
        <View style={styles.tabRow}>
          {tabs.map((tab) => {
            const on = activeTab === tab.key;
            return (
              <PressableScale
                key={tab.key}
                style={[styles.tab, on && styles.tabActive]}
                onPress={() => { haptics.select(); onTabChange?.(tab.key); }}
                scaleTo={0.94}
              >
                {on ? <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
                <Text style={[styles.tabTxt, on && styles.tabTxtActive]} numberOfLines={1}>
                  {tab.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      )}

      {/* Tri + filtres */}
      <View style={styles.toolbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow}>
          {SORTS.map((s) => {
            const on = sort === s.key;
            return (
              <PressableScale
                key={s.key}
                style={[styles.sortChip, on && styles.sortChipActive]}
                onPress={() => { haptics.select(); setSort(s.key); }}
                scaleTo={0.94}
              >
                {on ? <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
                <Text style={[styles.sortTxt, on && styles.sortTxtActive]}>{s.label}</Text>
              </PressableScale>
            );
          })}
        </ScrollView>
        <PressableScale style={[styles.filterBtn, activeFilters > 0 && styles.filterBtnOn]} onPress={() => setFiltersOpen(true)} scaleTo={0.94}>
          <Text style={styles.filterTxt}>
            ⚙︎ {activeFilters
              ? t('shop_grid_filters_count').replace('{n}', String(activeFilters))
              : t('shop_grid_filters')}
          </Text>
        </PressableScale>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : items.length === 0 ? (
        <ShopEmpty
          emoji="🔍"
          title={t('shop_grid_empty_title')}
          text={searchScopeLabel && search.trim()
            ? t('shop_grid_empty_in_scope').replace('{q}', search.trim()).replace('{scope}', searchScopeLabel)
            : t('shop_grid_empty_text')}
        >
          {/* Le produit existe peut-être, mais rangé dans un autre rayon. */}
          {searchScopeLabel && search.trim() ? (
            <GradientButton
              size="md"
              style={styles.widenBtn}
              label={t('shop_grid_widen')}
              onPress={() => router.push(`/shop/search?q=${encodeURIComponent(search.trim())}` as never)}
            />
          ) : undefined}
        </ShopEmpty>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={styles.column}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
          renderItem={({ item, index }) => (
            // Cascade sur le premier écran seulement : plus bas, les cartes
            // arrivent hors champ, un délai ne ferait que ralentir.
            <Reveal index={index < 6 ? index : 0} from={index < 6 ? 'below' : 'fade'} style={styles.gridCell}>
              <ProductCard product={item} variant="grid" onPress={() => router.push(`/shop/product/${item.slug}` as never)} />
            </Reveal>
          )}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing.md }} /> : undefined}
        />
      )}

      {/* Filtres */}
      <Modal visible={filtersOpen} animationType="slide" transparent onRequestClose={() => setFiltersOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFiltersOpen(false)}>
          <Pressable style={[styles.modalSheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>{t('shop_grid_filters')}</Text>

            <Text style={styles.fieldLabel}>{t('shop_grid_price_label')}</Text>
            <View style={styles.priceRow}>
              <TextInput
                style={styles.priceInput}
                placeholder={t('shop_grid_price_min')}
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                value={minPrice}
                onChangeText={setMinPrice}
              />
              <Text style={styles.priceSep}>—</Text>
              <TextInput
                style={styles.priceInput}
                placeholder={t('shop_grid_price_max')}
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                value={maxPrice}
                onChangeText={setMaxPrice}
              />
            </View>

            <Text style={styles.fieldLabel}>{t('shop_grid_min_rating')}</Text>
            <View style={styles.ratingRow}>
              {[undefined, 3, 4, 4.5].map((r) => {
                const on = minRating === r;
                return (
                  <PressableScale
                    key={String(r)}
                    style={[styles.ratingChip, on && styles.ratingChipActive]}
                    onPress={() => { haptics.select(); setMinRating(r); }}
                    scaleTo={0.94}
                  >
                    {on ? <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
                    <Text style={[styles.ratingTxt, on && styles.ratingTxtActive]}>
                      {r ? `★ ${r}+` : t('shop_grid_rating_all')}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>

            <View style={styles.modalActions}>
              <GhostButton
                style={styles.resetBtn}
                label={t('shop_grid_reset')}
                onPress={() => { setMinPrice(''); setMaxPrice(''); setMinRating(undefined); }}
              />
              <GradientButton style={styles.applyBtn} label={t('shop_grid_apply')} onPress={() => setFiltersOpen(false)} />
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
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  count: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: spacing.md, marginBottom: spacing.xs,
    backgroundColor: 'rgba(31,31,42,0.72)', borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: spacing.md, minHeight: 48,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 15, paddingVertical: 11 },
  clearIcon: { fontSize: 14, color: colors.textMuted, paddingHorizontal: 4 },

  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingRight: spacing.md, paddingVertical: spacing.sm },
  sortRow: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.md },
  // Les onglets se partagent la largeur : trois ou quatre sous-rayons tiennent
  // toujours sur une ligne, sans défilement horizontal.
  tabRow: {
    flexDirection: 'row', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.xs,
  },
  tab: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, paddingHorizontal: 4,
    borderRadius: radius.pill, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: colors.surface,
  },
  tabActive: { borderColor: 'transparent' },
  tabTxt: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  tabTxtActive: { color: '#fff', fontWeight: '900' },
  sortChip: {
    backgroundColor: colors.surface, borderRadius: radius.pill, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 14, paddingVertical: 8,
  },
  sortChipActive: { borderColor: 'transparent' },
  sortTxt: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  sortTxtActive: { color: '#fff', fontWeight: '900' },
  filterBtn: {
    backgroundColor: 'rgba(31,31,42,0.72)', borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 14, paddingVertical: 8,
  },
  filterBtnOn: { borderColor: colors.brand, borderWidth: 1.5 },
  filterTxt: { fontSize: 12, fontWeight: '800', color: colors.textPrimary },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  widenBtn: { marginTop: spacing.md, alignSelf: 'stretch' },

  list: { paddingHorizontal: spacing.md, paddingTop: spacing.xs, gap: spacing.md },
  column: { gap: spacing.md },
  gridCell: { flex: 1, marginBottom: spacing.xs },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
    padding: spacing.lg, paddingTop: spacing.md, gap: spacing.sm,
  },
  sheetHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.brand, marginBottom: spacing.sm },
  modalTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '900', letterSpacing: -0.3, marginBottom: spacing.xs },
  fieldLabel: {
    color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.4,
    textTransform: 'uppercase', marginTop: spacing.md,
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  priceInput: {
    flex: 1, backgroundColor: colors.surfaceElevated, borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)', paddingHorizontal: spacing.md,
    paddingVertical: 12, color: colors.textPrimary, fontSize: 15, fontWeight: '700',
  },
  priceSep: { color: colors.textMuted },
  ratingRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  ratingChip: {
    backgroundColor: colors.surfaceElevated, borderRadius: radius.pill, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 14, paddingVertical: 8,
  },
  ratingChipActive: { borderColor: 'transparent' },
  ratingTxt: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  ratingTxtActive: { color: '#fff', fontWeight: '900' },

  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  resetBtn: { flex: 1 },
  applyBtn: { flex: 2 },
});
