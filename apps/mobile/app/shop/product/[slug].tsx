/**
 * Fiche produit — carrousel, déclinaisons, description, spécifications, avis,
 * suggestions, et barre d'achat fixe en bas.
 *
 * Style boutique haut de gamme (17/11/2026) : galerie plein écran en
 * parallaxe (elle s'étire quand on tire la fiche vers le bas), boutons en
 * verre, fiche qui remonte sur la photo avec un bord arrondi, prix en
 * typographie forte, barre d'achat vitrée au dégradé de marque. Aucun voile
 * dégradé vers le fond : la fiche se pose sur la photo.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Pressable,
  StyleSheet, Text, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue,
  withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../lib/auth-context';
import { colors, gradients, motion, radius, spacing } from '../../../theme/tokens';
import { shopApi, formatPrice, type ProductDetail } from '../../../lib/shop-api';
import { ProductCard } from '../../../components/shop/ProductCard';
import { GlassIconButton, GradientButton, PricePop, ShopEmpty } from '../../../components/shop/ShopChrome';
import { PressableScale, Reveal } from '../../../components/ui';
import { haptics } from '../../../lib/useHaptics';
import { useI18n } from '../../../lib/useI18n';
import { shopCategoryName } from '../../../lib/shop-category-name';

const { width: SCREEN_W } = Dimensions.get('window');
/** Hauteur de la galerie : un peu plus haute que large, façon magazine. */
const GALLERY_H = Math.round(SCREEN_W * 1.12);

export default function ProductDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { t } = useI18n();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageIndex, setImageIndex] = useState(0);
  const [variantId, setVariantId] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  // Parallaxe de la galerie : elle glisse à demi-vitesse et s'étire quand on
  // tire la fiche vers le bas.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y; });
  const galleryStyle = useAnimatedStyle(() => ({
    transform: [
      // Tirée vers le bas (rebond iOS) : la galerie reste collée en haut et
      // s'agrandit. Défilée vers le haut : elle glisse à demi-vitesse.
      { translateY: interpolate(scrollY.value, [-240, 0, GALLERY_H], [-120, 0, GALLERY_H * 0.5], Extrapolation.CLAMP) },
      { scale: interpolate(scrollY.value, [-240, 0], [1.5, 1], Extrapolation.CLAMP) },
    ],
  }));
  // Les boutons flottants s'effacent une fois la galerie passée.
  const floatStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, GALLERY_H * 0.6], [1, 0], Extrapolation.CLAMP),
  }));
  // Le cœur rebondit à chaque bascule.
  const heart = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heart.value }] }));

  const load = useCallback(async () => {
    if (!accessToken || !slug) return;
    try {
      const p = await shopApi.product(accessToken, slug);
      setProduct(p);
      setWishlisted(p.isWishlisted);
      // Présélectionne la déclinaison disponible la moins chère : obliger
      // l'utilisateur à choisir alors qu'il n'y a qu'une option en stock
      // n'apporte rien. La moins chère et non la première, parce que c'est
      // elle que la carte du rayon affiche : ouvrir la fiche doit montrer le
      // même prix que celui sur lequel on a cliqué.
      const enStock = p.variants.filter((v) => v.stock > 0);
      const candidates = enStock.length > 0 ? enStock : p.variants;
      const moinsChere = [...candidates].sort(
        (a, b) => (a.priceCents ?? p.priceCents) - (b.priceCents ?? p.priceCents),
      )[0];
      if (moinsChere) setVariantId(moinsChere.id);
    } catch {
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, slug]);

  useEffect(() => { void load(); }, [load]);

  async function addToCart() {
    if (!accessToken || !product || adding) return;
    // Une déclinaison non choisie enverrait au panier un article que le
    // fournisseur ne saurait pas préparer.
    if (product.variants.length > 0 && !variantId) {
      Alert.alert(t('shop_product_choose_option_title'), t('shop_product_choose_option_body'));
      return;
    }
    setAdding(true);
    try {
      await shopApi.addToCart(accessToken, product.id, variantId);
      haptics.success();
      Alert.alert(t('shop_product_added_title'), product.title, [
        { text: t('shop_product_continue_shopping'), style: 'cancel' },
        { text: t('shop_product_view_cart'), onPress: () => router.push('/shop/cart' as never) },
      ]);
    } catch (e) {
      Alert.alert(t('shop_product_add_failed_title'), e instanceof Error ? e.message : t('shop_product_retry_soon'));
    } finally {
      setAdding(false);
    }
  }

  async function toggleWishlist() {
    if (!accessToken || !product) return;
    // Bascule optimiste : l'icône répond immédiatement, on revient en arrière
    // si le serveur refuse.
    const next = !wishlisted;
    setWishlisted(next);
    haptics.light();
    heart.value = withSequence(withTiming(1.3, { duration: motion.duration.instant }), withSpring(1, motion.spring.bouncy));
    try {
      const res = await shopApi.toggleWishlist(accessToken, product.id);
      setWishlisted(res.wishlisted);
    } catch {
      setWishlisted(!next);
    }
  }

  if (loading) {
    return <View style={[styles.screen, styles.center]}><ActivityIndicator color={colors.brand} size="large" /></View>;
  }
  if (!product) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ShopEmpty emoji="😕" title={t('shop_product_not_found')}>
          <GradientButton size="md" style={styles.backBtn} label={t('gs_back')} onPress={() => router.back()} />
        </ShopEmpty>
      </View>
    );
  }

  const selectedVariant = product.variants.find((v) => v.id === variantId);
  const priceCents = selectedVariant?.priceCents ?? product.priceCents;
  const hasDiscount = product.compareAtCents != null && product.compareAtCents > priceCents;
  const outOfStock = product.variants.length > 0 && product.variants.every((v) => v.stock === 0);
  const discountPercent = hasDiscount ? Math.round((1 - priceCents / product.compareAtCents!) * 100) : 0;
  const images = product.images.length ? product.images : [''];

  return (
    <View style={styles.screen}>
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
      >
        {/* Galerie dans le défilement (les glissements horizontaux lui
            parviennent), en parallaxe : elle descend à demi-vitesse et
            s'étire quand on tire vers le bas. */}
        <Animated.View style={[styles.gallery, galleryStyle]}>
          <FlatList
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            data={images}
            keyExtractor={(uri, i) => `${uri}-${i}`}
            onMomentumScrollEnd={(e) => setImageIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))}
            renderItem={({ item }) =>
              item ? (
                <Image source={{ uri: item }} style={styles.heroImage} contentFit="cover" transition={180} />
              ) : (
                <View style={[styles.heroImage, styles.heroPlaceholder]}>
                  <Text style={{ fontSize: 72 }}>{product.category.emoji}</Text>
                </View>
              )
            }
          />
          {product.images.length > 1 && (
            <View style={styles.dots} pointerEvents="none">
              <View style={styles.dotsPill}>
                {product.images.map((_, i) => (
                  <View key={i} style={[styles.dot, i === imageIndex && styles.dotActive]} />
                ))}
              </View>
            </View>
          )}
        </Animated.View>

        <View style={styles.body}>
          <Reveal index={0}>
            <PressableScale
              style={styles.categoryPill}
              onPress={() => router.push(`/shop/category/${product.category.slug}` as never)}
              scaleTo={0.95}
            >
              <Text style={styles.categoryLink}>{product.category.emoji} {shopCategoryName(t, product.category.slug, product.category.nameFr)}</Text>
            </PressableScale>
          </Reveal>

          <Reveal index={1}>
            <Text style={styles.title}>{product.title}</Text>
          </Reveal>

          <View style={styles.metaRow}>
            {/* rating/reviewsCount restent l'agregat AliExpress tant que
                product.reviews (les vrais avis YUMIA, listes plus bas) est
                vide : on n'affiche l'etoile que si de vrais avis existent,
                meme regle que la section « Avis clients » juste en dessous —
                directive Omnibus (UE) 2019/2161. */}
            {product.rating != null && product.reviews.length > 0 && (
              <View style={styles.ratingPill}>
                <Text style={styles.star}>★</Text>
                <Text style={styles.ratingTxt}>{product.rating.toFixed(1)}</Text>
                <Text style={styles.reviewsTxt}>({product.reviewsCount})</Text>
              </View>
            )}
            {product.salesCount > 0 && (
              <Text style={styles.sales}>
                {t(product.salesCount === 1 ? 'shop_product_sold_one' : 'shop_product_sold_other')
                  .replace('{n}', String(product.salesCount))}
              </Text>
            )}
          </View>

          <Reveal index={2} style={styles.priceRow}>
            <PricePop style={styles.price} text={formatPrice(priceCents, product.currency)} />
            {hasDiscount && (
              <>
                <Text style={styles.compareAt}>{formatPrice(product.compareAtCents!, product.currency)}</Text>
                {/* Remise réelle uniquement : prix barré supérieur au prix affiché. */}
                <View style={styles.discountPill}>
                  <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                  <Text style={styles.discountTxt}>-{discountPercent}%</Text>
                </View>
              </>
            )}
          </Reveal>

          {/* Bloc admin — l'API ne renvoie `adminMargin` qu'aux comptes admin. */}
          {product.adminMargin && (
            <View style={styles.marginBox}>
              <Text style={styles.marginTitle}>{t('shop_product_margin_title')}</Text>
              <View style={styles.marginRow}>
                <Text style={styles.marginValue}>
                  {formatPrice(product.adminMargin.marginCents, product.currency)}
                </Text>
                <Text style={styles.marginPct}>
                  {t('shop_product_margin_percent').replace('{pct}', String(product.adminMargin.marginPercent))}
                </Text>
              </View>
              <Text style={styles.marginCost}>
                {t('shop_product_margin_cost')
                  .replace('{cost}', formatPrice(product.adminMargin.costCents, product.currency))
                  .replace('{multiplier}', String(product.adminMargin.multiplier))}
              </Text>
            </View>
          )}

          {product.deliveryDays != null && (
            <View style={styles.deliveryPill}>
              <Text style={styles.delivery}>
                🚚  {t(product.deliveryDays === 1 ? 'shop_product_delivery_one' : 'shop_product_delivery_other')
                  .replace('{n}', String(product.deliveryDays))}
              </Text>
            </View>
          )}

          {/* Déclinaisons */}
          {product.variants.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>
                {product.variants[0].optionName ?? t('shop_product_options')}
              </Text>
              <View style={styles.variantRow}>
                {product.variants.map((v) => {
                  const disabled = v.stock === 0;
                  const active = v.id === variantId;
                  return (
                    <PressableScale
                      key={v.id}
                      disabled={disabled}
                      style={[styles.variantChip, active && styles.variantChipActive, disabled && styles.variantChipDisabled]}
                      onPress={() => { setVariantId(v.id); haptics.select(); }}
                      scaleTo={0.94}
                    >
                      {active ? <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
                      <Text style={[styles.variantTxt, active && styles.variantTxtActive, disabled && styles.variantTxtDisabled]}>
                        {v.label}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>
            </View>
          )}

          {/* Description */}
          {product.description && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>{t('shop_product_description')}</Text>
              <Text style={styles.description} numberOfLines={descExpanded ? undefined : 5}>
                {product.description}
              </Text>
              <Pressable onPress={() => setDescExpanded((v) => !v)}>
                <Text style={styles.more}>{descExpanded ? t('shop_product_see_less') : t('explorer_see_more')}</Text>
              </Pressable>
            </View>
          )}

          {/* Caractéristiques */}
          {product.specifications.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>{t('shop_product_specifications')}</Text>
              <View style={styles.panel}>
              {product.specifications.slice(0, 12).map((s, i, arr) => (
                <View key={`${s.name}-${i}`} style={[styles.specRow, i === arr.length - 1 && styles.specRowLast]}>
                  <Text style={styles.specName}>{s.name}</Text>
                  <Text style={styles.specValue}>{s.value}</Text>
                </View>
              ))}
              </View>
            </View>
          )}

          {/* Avis */}
          {product.reviews.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>{t('shop_product_reviews')}</Text>
              {product.reviews.slice(0, 5).map((r) => (
                <View key={r.id} style={styles.review}>
                  <View style={styles.reviewHead}>
                    <Text style={styles.reviewAuthor}>{r.user.displayName}</Text>
                    <Text style={styles.reviewStars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Text>
                  </View>
                  {r.comment && <Text style={styles.reviewComment}>{r.comment}</Text>}
                </View>
              ))}
            </View>
          )}

          {/* Suggestions */}
          {product.related.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>{t('shop_product_related')}</Text>
              <FlatList
                horizontal
                data={product.related}
                keyExtractor={(p) => p.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: spacing.md }}
                renderItem={({ item }) => (
                  <ProductCard product={item} onPress={() => router.replace(`/shop/product/${item.slug}` as never)} />
                )}
              />
            </View>
          )}
        </View>
      </Animated.ScrollView>

      {/* Boutons flottants en verre : retour et favori */}
      <Animated.View style={[styles.floatRow, { top: insets.top + 8 }, floatStyle]} pointerEvents="box-none">
        <GlassIconButton icon="←" onPress={() => router.back()} accessibilityLabel={t('gs_back')} />
        <Animated.View style={heartStyle}>
          <GlassIconButton
            icon={wishlisted ? '❤️' : '🤍'}
            active={wishlisted}
            onPress={toggleWishlist}
            accessibilityLabel={t(wishlisted ? 'shop_product_wishlist_remove' : 'shop_product_wishlist_add')}
          />
        </Animated.View>
      </Animated.View>

      {/* Barre d'achat */}
      <View style={[styles.buyBar, { paddingBottom: insets.bottom + spacing.sm }]}>
        <View style={styles.buyPriceCol}>
          <PricePop style={styles.buyPrice} text={formatPrice(priceCents, product.currency)} />
          {selectedVariant && <Text style={styles.buyVariant} numberOfLines={1}>{selectedVariant.label}</Text>}
        </View>
        <GradientButton
          style={styles.addBtn}
          icon={outOfStock ? undefined : '🛍️'}
          label={outOfStock ? t('shop_product_unavailable') : t('shop_product_add_to_cart')}
          onPress={addToCart}
          loading={adding}
          disabled={outOfStock}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  backBtn: { marginTop: spacing.md, alignSelf: 'stretch' },

  gallery: { height: GALLERY_H, backgroundColor: colors.surfaceElevated },
  heroImage: { width: SCREEN_W, height: GALLERY_H, backgroundColor: colors.surfaceElevated },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  floatRow: {
    position: 'absolute', left: spacing.md, right: spacing.md,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  // Au-dessus du bord arrondi de la fiche (qui remonte de 28 px).
  dots: { position: 'absolute', left: 0, right: 0, bottom: 28 + spacing.sm, alignItems: 'center' },
  dotsPill: {
    flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill,
    backgroundColor: 'rgba(14,14,18,0.55)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.2)',
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotActive: { backgroundColor: '#fff', width: 18 },

  // La fiche remonte sur la photo : bord arrondi, fond plein (pas de voile).
  body: {
    zIndex: 1,
    backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    marginTop: -28, padding: spacing.lg, paddingTop: spacing.lg, gap: 8, minHeight: 400,
  },
  categoryPill: {
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill,
    backgroundColor: 'rgba(31,31,42,0.72)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)',
  },
  categoryLink: { color: colors.textSecondary, fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  title: { color: colors.textPrimary, fontSize: 26, fontWeight: '900', letterSpacing: -0.6, lineHeight: 31, marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  star: { color: colors.warning, fontSize: 13 },
  ratingTxt: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  reviewsTxt: { fontSize: 12, color: colors.textMuted },
  sales: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6, flexWrap: 'wrap' },
  price: { fontSize: 34, fontWeight: '900', color: colors.textPrimary, letterSpacing: -1 },
  compareAt: { fontSize: 16, color: colors.textMuted, textDecorationLine: 'line-through' },
  discountPill: { borderRadius: radius.pill, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 4 },
  discountTxt: { color: '#fff', fontSize: 13, fontWeight: '900' },
  // Encadré distinct du reste de la fiche : cette information n'est pas
  // destinée au client, elle ne doit jamais se lire comme un argument de vente.
  marginBox: {
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: radius.md,
    borderStyle: 'dashed',
    padding: spacing.sm,
    gap: 2,
    marginTop: spacing.xs,
  },
  marginTitle: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  marginRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  marginValue: { fontSize: 18, fontWeight: '800', color: colors.success },
  marginPct: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  marginCost: { fontSize: 11, color: colors.textMuted },
  deliveryPill: {
    alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill,
    backgroundColor: 'rgba(31,31,42,0.72)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  delivery: { fontSize: 13, color: colors.textPrimary, fontWeight: '700' },

  block: { marginTop: spacing.xl, gap: spacing.md },
  blockTitle: {
    color: colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 1.6, textTransform: 'uppercase',
  },
  variantRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  variantChip: {
    backgroundColor: colors.surface, borderRadius: radius.pill, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  variantChipActive: { borderColor: 'transparent' },
  variantChipDisabled: { opacity: 0.35 },
  variantTxt: { fontSize: 13, color: colors.textSecondary, fontWeight: '700' },
  variantTxtActive: { color: '#fff', fontWeight: '900' },
  variantTxtDisabled: { textDecorationLine: 'line-through' },

  description: { fontSize: 15, color: colors.textSecondary, lineHeight: 23 },
  more: { fontSize: 13, color: colors.brandSoft, fontWeight: '800' },

  panel: {
    backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)',
  },
  specRow: {
    flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.10)',
  },
  specRowLast: { borderBottomWidth: 0 },
  specName: { fontSize: 13, color: colors.textMuted, flex: 1 },
  specValue: { fontSize: 13, color: colors.textPrimary, flex: 1, textAlign: 'right', fontWeight: '600' },

  review: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: 6,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)',
  },
  reviewHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewAuthor: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  reviewStars: { fontSize: 12, color: colors.warning },
  reviewComment: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },

  buyBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(14,14,18,0.96)', borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.md,
  },
  buyPriceCol: { flexShrink: 1 },
  buyPrice: { fontSize: 24, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.6 },
  buyVariant: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  addBtn: { flex: 1, maxWidth: 240 },
});
