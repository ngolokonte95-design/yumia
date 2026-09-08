/**
 * Fiche produit — carrousel, déclinaisons, description, spécifications, avis,
 * suggestions, et barre d'achat fixe en bas.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../lib/auth-context';
import { colors, radius, spacing, typography } from '../../../theme/tokens';
import { shopApi, formatPrice, type ProductDetail } from '../../../lib/shop-api';
import { ProductCard } from '../../../components/shop/ProductCard';
import { haptics } from '../../../lib/useHaptics';

const { width: SCREEN_W } = Dimensions.get('window');

export default function ProductDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageIndex, setImageIndex] = useState(0);
  const [variantId, setVariantId] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !slug) return;
    try {
      const p = await shopApi.product(accessToken, slug);
      setProduct(p);
      setWishlisted(p.isWishlisted);
      // Présélectionne la première déclinaison disponible : obliger l'utilisateur
      // à choisir alors qu'il n'y a qu'une option en stock n'apporte rien.
      const firstInStock = p.variants.find((v) => v.stock > 0) ?? p.variants[0];
      if (firstInStock) setVariantId(firstInStock.id);
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
      Alert.alert('Choisis une option', 'Sélectionne une déclinaison avant d\'ajouter au panier.');
      return;
    }
    setAdding(true);
    try {
      await shopApi.addToCart(accessToken, product.id, variantId);
      haptics.success();
      Alert.alert('Ajouté au panier', product.title, [
        { text: 'Continuer mes achats', style: 'cancel' },
        { text: 'Voir le panier', onPress: () => router.push('/shop/cart' as never) },
      ]);
    } catch (e) {
      Alert.alert('Impossible d\'ajouter', e instanceof Error ? e.message : 'Réessaie dans un instant.');
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
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emptyEmoji}>😕</Text>
        <Text style={styles.emptyTitle}>Produit introuvable</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnTxt}>Retour</Text>
        </Pressable>
      </View>
    );
  }

  const selectedVariant = product.variants.find((v) => v.id === variantId);
  const priceCents = selectedVariant?.priceCents ?? product.priceCents;
  const hasDiscount = product.compareAtCents != null && product.compareAtCents > priceCents;
  const outOfStock = product.variants.length > 0 && product.variants.every((v) => v.stock === 0);

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
      >
        {/* Carrousel */}
        <View>
          <FlatList
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            data={product.images.length ? product.images : ['']}
            keyExtractor={(uri, i) => `${uri}-${i}`}
            onMomentumScrollEnd={(e) => setImageIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))}
            renderItem={({ item }) =>
              item ? (
                <Image source={{ uri: item }} style={styles.heroImage} contentFit="cover" transition={150} />
              ) : (
                <View style={[styles.heroImage, styles.heroPlaceholder]}>
                  <Text style={{ fontSize: 56 }}>{product.category.emoji}</Text>
                </View>
              )
            }
          />
          <Pressable style={[styles.floatingBtn, { top: insets.top + 8, left: spacing.md }]} onPress={() => router.back()}>
            <Text style={styles.floatingIcon}>←</Text>
          </Pressable>
          <Pressable style={[styles.floatingBtn, { top: insets.top + 8, right: spacing.md }]} onPress={toggleWishlist}>
            <Text style={styles.floatingIcon}>{wishlisted ? '❤️' : '🤍'}</Text>
          </Pressable>
          {product.images.length > 1 && (
            <View style={styles.dots}>
              {product.images.map((_, i) => (
                <View key={i} style={[styles.dot, i === imageIndex && styles.dotActive]} />
              ))}
            </View>
          )}
        </View>

        <View style={styles.body}>
          <Pressable onPress={() => router.push(`/shop/category/${product.category.slug}` as never)}>
            <Text style={styles.categoryLink}>{product.category.emoji} {product.category.nameFr}</Text>
          </Pressable>

          <Text style={styles.title}>{product.title}</Text>

          <View style={styles.metaRow}>
            {product.rating != null && (
              <View style={styles.ratingPill}>
                <Text style={styles.star}>★</Text>
                <Text style={styles.ratingTxt}>{product.rating.toFixed(1)}</Text>
                <Text style={styles.reviewsTxt}>({product.reviewsCount})</Text>
              </View>
            )}
            {product.salesCount > 0 && <Text style={styles.sales}>{product.salesCount} vendus</Text>}
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatPrice(priceCents, product.currency)}</Text>
            {hasDiscount && (
              <Text style={styles.compareAt}>{formatPrice(product.compareAtCents!, product.currency)}</Text>
            )}
          </View>

          {/* Bloc admin — l'API ne renvoie `adminMargin` qu'aux comptes admin. */}
          {product.adminMargin && (
            <View style={styles.marginBox}>
              <Text style={styles.marginTitle}>Marge (visible par toi seul)</Text>
              <View style={styles.marginRow}>
                <Text style={styles.marginValue}>
                  {formatPrice(product.adminMargin.marginCents, product.currency)}
                </Text>
                <Text style={styles.marginPct}>{product.adminMargin.marginPercent} % du prix de vente</Text>
              </View>
              <Text style={styles.marginCost}>
                Prix d'achat {formatPrice(product.adminMargin.costCents, product.currency)} · coefficient ×
                {product.adminMargin.multiplier}
              </Text>
            </View>
          )}

          {product.deliveryDays != null && (
            <Text style={styles.delivery}>🚚 Livraison estimée sous {product.deliveryDays} jours</Text>
          )}

          {/* Déclinaisons */}
          {product.variants.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>
                {product.variants[0].optionName ?? 'Options'}
              </Text>
              <View style={styles.variantRow}>
                {product.variants.map((v) => {
                  const disabled = v.stock === 0;
                  const active = v.id === variantId;
                  return (
                    <Pressable
                      key={v.id}
                      disabled={disabled}
                      style={[styles.variantChip, active && styles.variantChipActive, disabled && styles.variantChipDisabled]}
                      onPress={() => { setVariantId(v.id); haptics.select(); }}
                    >
                      <Text style={[styles.variantTxt, active && styles.variantTxtActive, disabled && styles.variantTxtDisabled]}>
                        {v.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Description */}
          {product.description && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Description</Text>
              <Text style={styles.description} numberOfLines={descExpanded ? undefined : 5}>
                {product.description}
              </Text>
              <Pressable onPress={() => setDescExpanded((v) => !v)}>
                <Text style={styles.more}>{descExpanded ? 'Voir moins' : 'Voir plus'}</Text>
              </Pressable>
            </View>
          )}

          {/* Caractéristiques */}
          {product.specifications.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Caractéristiques</Text>
              {product.specifications.slice(0, 12).map((s, i) => (
                <View key={`${s.name}-${i}`} style={styles.specRow}>
                  <Text style={styles.specName}>{s.name}</Text>
                  <Text style={styles.specValue}>{s.value}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Avis */}
          {product.reviews.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Avis clients</Text>
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
              <Text style={styles.blockTitle}>Vous aimerez aussi</Text>
              <FlatList
                horizontal
                data={product.related}
                keyExtractor={(p) => p.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: spacing.sm }}
                renderItem={({ item }) => (
                  <ProductCard product={item} onPress={() => router.replace(`/shop/product/${item.slug}` as never)} />
                )}
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/* Barre d'achat */}
      <View style={[styles.buyBar, { paddingBottom: insets.bottom + spacing.sm }]}>
        <View>
          <Text style={styles.buyPrice}>{formatPrice(priceCents, product.currency)}</Text>
          {selectedVariant && <Text style={styles.buyVariant}>{selectedVariant.label}</Text>}
        </View>
        <Pressable
          style={[styles.addBtn, (adding || outOfStock) && styles.addBtnDisabled]}
          onPress={addToCart}
          disabled={adding || outOfStock}
        >
          {adding
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.addBtnTxt}>{outOfStock ? 'Indisponible' : 'Ajouter au panier'}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { ...typography.h3, color: colors.textPrimary },
  backBtn: { marginTop: spacing.md, backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 24, paddingVertical: 12 },
  backBtnTxt: { color: '#fff', fontWeight: '700' },

  heroImage: { width: SCREEN_W, height: SCREEN_W, backgroundColor: colors.surfaceElevated },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  floatingBtn: {
    position: 'absolute', width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  floatingIcon: { fontSize: 18, color: '#fff' },
  dots: { position: 'absolute', bottom: 10, alignSelf: 'center', flexDirection: 'row', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { backgroundColor: '#fff', width: 16 },

  body: { padding: spacing.md, gap: 6 },
  categoryLink: { ...typography.label, color: colors.brandSoft },
  title: { ...typography.h2, color: colors.textPrimary, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  star: { color: colors.warning, fontSize: 13 },
  ratingTxt: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  reviewsTxt: { fontSize: 12, color: colors.textMuted },
  sales: { fontSize: 12, color: colors.textMuted },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: 4 },
  price: { fontSize: 26, fontWeight: '800', color: colors.textPrimary },
  compareAt: { fontSize: 15, color: colors.textMuted, textDecorationLine: 'line-through' },
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
  delivery: { fontSize: 13, color: colors.success, marginTop: 2 },

  block: { marginTop: spacing.lg, gap: spacing.sm },
  blockTitle: { ...typography.title, color: colors.textPrimary },
  variantRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  variantChip: {
    backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 9,
  },
  variantChipActive: { borderColor: colors.brand, backgroundColor: `${colors.brand}22` },
  variantChipDisabled: { opacity: 0.35 },
  variantTxt: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  variantTxtActive: { color: colors.brandSoft },
  variantTxtDisabled: { textDecorationLine: 'line-through' },

  description: { fontSize: 14, color: colors.textSecondary, lineHeight: 21 },
  more: { ...typography.caption, color: colors.brandSoft },

  specRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  specName: { fontSize: 13, color: colors.textMuted, flex: 1 },
  specValue: { fontSize: 13, color: colors.textPrimary, flex: 1, textAlign: 'right' },

  review: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  reviewHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewAuthor: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  reviewStars: { fontSize: 12, color: colors.warning },
  reviewComment: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },

  buyBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
    paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.md,
  },
  buyPrice: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  buyVariant: { fontSize: 11, color: colors.textMuted },
  addBtn: { flex: 1, maxWidth: 220, alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 14 },
  addBtnDisabled: { opacity: 0.5 },
  addBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
