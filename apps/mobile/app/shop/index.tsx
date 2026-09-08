/**
 * BOUTIQUE — accueil.
 * Rayons, sélection mise en avant, meilleures ventes et nouveautés.
 * Les prix arrivent en centimes (voir shop-api) et ne sont formatés qu'ici.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { shopApi, type ProductListItem, type ShopCategory } from '../../lib/shop-api';
import { ProductCard } from '../../components/shop/ProductCard';

export default function ShopHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();

  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [featured, setFeatured] = useState<ProductListItem[]>([]);
  const [bestsellers, setBestsellers] = useState<ProductListItem[]>([]);
  const [newest, setNewest] = useState<ProductListItem[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [cats, feat, best, recent] = await Promise.all([
        shopApi.categories(accessToken),
        shopApi.products(accessToken, { featured: true, pageSize: 10 }),
        shopApi.products(accessToken, { sort: 'bestsellers', pageSize: 10 }),
        shopApi.products(accessToken, { sort: 'newest', pageSize: 10 }),
      ]);
      // Un rayon vide n'a rien à faire dans la navigation : il mènerait à une
      // page blanche tant que l'import n'a pas tourné dessus. Les sous-rayons
      // n'y figurent pas non plus : ils s'affichent en onglets à l'intérieur de
      // leur parent, dont le compteur les inclut déjà.
      setCategories(cats.filter((c) => c.parentSlug === null && c.productsCount > 0));
      setFeatured(feat.items);
      setBestsellers(best.items);
      setNewest(recent.items);
    } catch {
      // Boutique indisponible (API pas encore déployée, réseau) — les sections
      // restent vides, l'écran affiche son état vide plutôt qu'une erreur.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  // Le compteur du panier doit refléter un ajout fait depuis une fiche produit.
  useFocusEffect(useCallback(() => {
    if (!accessToken) return;
    shopApi.cart(accessToken).then((c) => setCartCount(c.itemsCount)).catch(() => {});
  }, [accessToken]));

  function submitSearch() {
    const q = search.trim();
    if (q) router.push(`/shop/search?q=${encodeURIComponent(q)}` as never);
  }

  const isEmpty = !loading && !featured.length && !bestsellers.length && !newest.length;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* En-tête : retour, recherche, panier */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher un produit"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={submitSearch}
            returnKeyType="search"
          />
        </View>
        <Pressable onPress={() => router.push('/shop/cart' as never)} hitSlop={8} style={styles.cartBtn}>
          <Text style={styles.cartIcon}>🛒</Text>
          {cartCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeTxt}>{cartCount > 9 ? '9+' : cartCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} />
          }
        >
          {isEmpty ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🛍️</Text>
              <Text style={styles.emptyTitle}>Boutique en préparation</Text>
              <Text style={styles.emptyText}>
                Les premiers produits arrivent très bientôt. Reviens dans un moment.
              </Text>
            </View>
          ) : (
            <>
              {/* Rayons */}
              {categories.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Nos rayons</Text>
                  <View style={styles.categoryGrid}>
                    {categories.map((c) => (
                      <Pressable
                        key={c.id}
                        style={styles.categoryTile}
                        onPress={() => router.push(`/shop/category/${c.slug}` as never)}
                      >
                        <Text style={styles.categoryEmoji}>{c.emoji}</Text>
                        <Text style={styles.categoryName} numberOfLines={2}>{c.nameFr}</Text>
                        <Text style={styles.categoryCount}>{c.productsCount}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              <ProductRow title="Sélection YUMIA" products={featured} onSeeAll={() => router.push('/shop/search?featured=true')} />
              <ProductRow title="Meilleures ventes" products={bestsellers} onSeeAll={() => router.push('/shop/search?sort=bestsellers')} />
              <ProductRow title="Nouveautés" products={newest} onSeeAll={() => router.push('/shop/search?sort=newest')} />
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function ProductRow({ title, products, onSeeAll }: { title: string; products: ProductListItem[]; onSeeAll: () => void }) {
  const router = useRouter();
  if (!products.length) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, styles.sectionTitleInHead]}>{title}</Text>
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Text style={styles.seeAll}>Tout voir</Text>
        </Pressable>
      </View>
      <FlatList
        horizontal
        data={products}
        keyExtractor={(p) => p.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        renderItem={({ item }) => (
          <ProductCard product={item} onPress={() => router.push(`/shop/product/${item.slug}` as never)} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  back: { fontSize: 24, color: colors.brandSoft, paddingRight: 4 },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surface, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 14, paddingVertical: 10 },
  cartBtn: { position: 'relative', padding: 4 },
  cartIcon: { fontSize: 22 },
  cartBadge: {
    position: 'absolute', top: 0, right: 0, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  cartBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 10, paddingHorizontal: spacing.xl, paddingTop: spacing.xxl },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { ...typography.h3, color: colors.textPrimary, textAlign: 'center' },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },

  section: { marginTop: spacing.lg },
  sectionHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, marginBottom: spacing.sm,
  },
  sectionTitle: { ...typography.title, color: colors.textPrimary, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  /// Dans sectionHead, le conteneur porte deja le padding et la marge.
  sectionTitleInHead: { paddingHorizontal: 0, marginBottom: 0 },
  seeAll: { ...typography.caption, color: colors.brandSoft },
  row: { gap: spacing.sm, paddingHorizontal: spacing.md },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingHorizontal: spacing.md },
  // Quatre par ligne : avec 25 rayons, trois colonnes imposaient neuf lignes et
  // reléguaient la moitié du magasin sous la ligne de flottaison.
  categoryTile: {
    width: '23.5%', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: 2,
    alignItems: 'center', gap: 2,
  },
  categoryEmoji: { fontSize: 18 },
  categoryName: { ...typography.label, color: colors.textPrimary, fontSize: 9, textAlign: 'center' },
  categoryCount: { fontSize: 8, color: colors.textMuted },
});
