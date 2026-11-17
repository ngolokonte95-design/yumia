/**
 * BOUTIQUE — accueil.
 * Vitrine (sélection mise en avant) en grand carrousel photo, rayons,
 * meilleures ventes et nouveautés.
 * Les prix arrivent en centimes (voir shop-api) et ne sont formatés qu'ici.
 *
 * Style boutique haut de gamme (17/11/2026) : une seule couleur d'accent (le
 * dégradé de marque), verre sobre, typographie forte, apparition en cascade.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../lib/auth-context';
import { colors, gradients, radius, spacing } from '../../theme/tokens';
import { shopApi, type ProductListItem, type ShopCategory } from '../../lib/shop-api';
import { ProductCard } from '../../components/shop/ProductCard';
import { ShowcaseCarousel } from '../../components/shop/ShowcaseCarousel';
import { GlassIconButton, SectionHeader, ShopEmpty } from '../../components/shop/ShopChrome';
import { GradientText, PressableScale, Reveal } from '../../components/ui';
import { FeatureTip } from '../../components/FeatureTip';
import { useI18n } from '../../lib/useI18n';
import { shopCategoryName } from '../../lib/shop-category-name';

export default function ShopHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { t } = useI18n();

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
      // `productsCount` n'est plus affiché sous les rayons, mais reste lu ici :
      // un rayon vide ne doit pas figurer dans la liste.
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

  const openProduct = (p: ProductListItem) => router.push(`/shop/product/${p.slug}` as never);
  const isEmpty = !loading && !featured.length && !bestsellers.length && !newest.length;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Barre du haut : retour, commandes, panier */}
      <View style={styles.topBar}>
        <GlassIconButton icon="←" onPress={() => router.back()} accessibilityLabel={t('gs_back')} />
        <View style={styles.topRight}>
          <GlassIconButton
            icon="📦"
            onPress={() => router.push('/shop/orders' as never)}
            accessibilityLabel={t('shop_home_orders_a11y')}
          />
          <GlassIconButton
            icon="🛒"
            badge={cartCount}
            onPress={() => router.push('/shop/cart' as never)}
            accessibilityLabel={t('shop_grid_cart_a11y')}
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} />
          }
        >
          {/* Titre + recherche */}
          <Reveal index={0} style={styles.hero}>
            <GradientText style={styles.heroTitle}>{t('explorer_action_shop_label')}</GradientText>
            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder={t('shop_home_search_placeholder')}
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
                onSubmitEditing={submitSearch}
                returnKeyType="search"
              />
              {search.trim() ? (
                <PressableScale style={styles.searchGo} onPress={submitSearch} scaleTo={0.9}>
                  <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                  <Text style={styles.searchGoTxt}>→</Text>
                </PressableScale>
              ) : null}
            </View>
          </Reveal>

          {isEmpty ? (
            <ShopEmpty emoji="🛍️" title={t('shop_home_empty_title')} text={t('shop_home_empty_text')} />
          ) : (
            <>
              {/* Vitrine */}
              {featured.length > 0 ? (
                <Reveal index={1} style={styles.section}>
                  <SectionHeader
                    title={t('shop_home_featured')}
                    actionLabel={t('shop_home_see_all')}
                    onAction={() => router.push('/shop/search?featured=true')}
                  />
                  <ShowcaseCarousel products={featured} onOpen={openProduct} />
                </Reveal>
              ) : null}

              {/* Rayons */}
              {categories.length > 0 ? (
                <Reveal index={2} style={styles.section}>
                  <SectionHeader title={t('shop_home_categories')} />
                  <View style={styles.categoryGrid}>
                    {categories.map((c) => (
                      <PressableScale
                        key={c.id}
                        style={styles.categoryTile}
                        onPress={() => router.push(`/shop/category/${c.slug}` as never)}
                        scaleTo={0.92}
                      >
                        <View style={styles.categoryMedal}>
                          <LinearGradient colors={gradients.brandSoft} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                          <Text style={styles.categoryEmoji}>{c.emoji}</Text>
                        </View>
                        <Text style={styles.categoryName} numberOfLines={2}>{shopCategoryName(t, c.slug, c.nameFr)}</Text>
                      </PressableScale>
                    ))}
                  </View>
                </Reveal>
              ) : null}

              {/* Le rang n'est affiché que sur les meilleures ventes : c'est la
                  seule liste dont l'ordre est un classement. */}
              <ProductRow
                index={3}
                title={t('shop_home_bestsellers')}
                products={bestsellers}
                ranked
                onSeeAll={() => router.push('/shop/search?sort=bestsellers')}
                onOpen={openProduct}
              />
              <ProductRow
                index={4}
                title={t('shop_home_newest')}
                products={newest}
                onSeeAll={() => router.push('/shop/search?sort=newest')}
                onOpen={openProduct}
              />
            </>
          )}
        </ScrollView>
      )}
      <FeatureTip feature="shop" />
    </View>
  );
}

function ProductRow({ index, title, products, ranked, onSeeAll, onOpen }: {
  index: number;
  title: string;
  products: ProductListItem[];
  ranked?: boolean;
  onSeeAll: () => void;
  onOpen: (p: ProductListItem) => void;
}) {
  const { t } = useI18n();
  if (!products.length) return null;
  return (
    <Reveal index={index} style={styles.section}>
      <SectionHeader title={title} actionLabel={t('shop_home_see_all')} onAction={onSeeAll} />
      <FlatList
        horizontal
        data={products}
        keyExtractor={(p) => p.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        renderItem={({ item, index: i }) => (
          <ProductCard product={item} rank={ranked ? i + 1 : undefined} onPress={() => onOpen(item)} />
        )}
      />
    </Reveal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  topRight: { flexDirection: 'row', gap: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  hero: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, gap: spacing.md },
  heroTitle: { fontSize: 38, fontWeight: '900', letterSpacing: -1.2 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(31,31,42,0.72)', borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)',
    paddingLeft: spacing.md, paddingRight: 6, minHeight: 50,
  },
  searchIcon: { fontSize: 15 },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 15, paddingVertical: 12 },
  searchGo: {
    width: 38, height: 38, borderRadius: 19, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  searchGoTxt: { color: '#fff', fontSize: 17, fontWeight: '900' },

  section: { marginTop: spacing.xl },
  row: { gap: spacing.md, paddingHorizontal: spacing.md },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.md },
  // Quatre par ligne : avec 25 rayons, trois colonnes imposaient neuf lignes et
  // reléguaient la moitié du magasin sous la ligne de flottaison.
  categoryTile: {
    width: '23%', backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)',
    paddingVertical: spacing.md, paddingHorizontal: 3, alignItems: 'center', gap: 6,
  },
  categoryMedal: {
    width: 44, height: 44, borderRadius: 22, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
  },
  categoryEmoji: { fontSize: 21 },
  categoryName: { color: colors.textPrimary, fontSize: 10, fontWeight: '700', textAlign: 'center', lineHeight: 13 },
});
