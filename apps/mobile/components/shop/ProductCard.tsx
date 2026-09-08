/**
 * Carte produit — utilisée en rangée horizontale (accueil) et en grille
 * (rayon, recherche, wishlist). `variant` change uniquement la largeur :
 * en grille la carte s'adapte à la colonne, en rangée elle est fixe.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatPrice, type ProductListItem } from '../../lib/shop-api';

interface Props {
  product: ProductListItem;
  onPress: () => void;
  variant?: 'row' | 'grid';
}

export function ProductCard({ product, onPress, variant = 'row' }: Props) {
  const image = product.images[0];
  // Une remise n'est affichée que si le prix barré est réellement supérieur —
  // sinon le pourcentage serait nul ou négatif, donc mensonger.
  const hasDiscount = product.compareAtCents != null && product.compareAtCents > product.priceCents;
  const discountPercent = hasDiscount
    ? Math.round((1 - product.priceCents / product.compareAtCents!) * 100)
    : 0;

  return (
    <Pressable style={[styles.card, variant === 'grid' && styles.cardGrid]} onPress={onPress}>
      <View style={styles.imageWrap}>
        {image ? (
          <Image source={{ uri: image }} style={styles.image} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text style={styles.placeholderEmoji}>{product.category.emoji}</Text>
          </View>
        )}
        {hasDiscount && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountTxt}>-{discountPercent}%</Text>
          </View>
        )}
      </View>

      <Text style={styles.title} numberOfLines={2}>{product.title}</Text>

      {product.rating != null && (
        <View style={styles.ratingRow}>
          <Text style={styles.star}>★</Text>
          <Text style={styles.rating}>{product.rating.toFixed(1)}</Text>
          {product.reviewsCount > 0 && <Text style={styles.reviews}>({product.reviewsCount})</Text>}
        </View>
      )}

      <View style={styles.priceRow}>
        <Text style={styles.price}>{formatPrice(product.priceCents, product.currency)}</Text>
        {hasDiscount && (
          <Text style={styles.compareAt}>{formatPrice(product.compareAtCents!, product.currency)}</Text>
        )}
      </View>

      {/* Servi par l'API aux seuls comptes admin — absent des autres réponses. */}
      {product.adminMargin && (
        <View style={styles.marginBox}>
          <Text style={styles.marginTxt}>
            Marge {formatPrice(product.adminMargin.marginCents, product.currency)}
            {'  ·  '}
            {product.adminMargin.marginPercent}%
          </Text>
          <Text style={styles.marginCost}>
            Achat {formatPrice(product.adminMargin.costCents, product.currency)} · ×
            {product.adminMargin.multiplier}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 150, backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden', padding: spacing.sm, gap: 4,
  },
  // En grille, la largeur vient de la colonne parente (flex), pas de la carte.
  cardGrid: { width: '100%' },
  imageWrap: { position: 'relative' },
  image: { width: '100%', aspectRatio: 1, borderRadius: radius.sm, backgroundColor: colors.surfaceElevated },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderEmoji: { fontSize: 32 },
  discountBadge: {
    position: 'absolute', top: 6, left: 6, backgroundColor: colors.brand,
    borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2,
  },
  discountTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  title: { ...typography.caption, color: colors.textPrimary, fontWeight: '600', minHeight: 34 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  star: { color: colors.warning, fontSize: 11 },
  rating: { fontSize: 11, color: colors.textSecondary, fontWeight: '700' },
  reviews: { fontSize: 10, color: colors.textMuted },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  price: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  compareAt: { fontSize: 11, color: colors.textMuted, textDecorationLine: 'line-through' },
  // Encart admin : volontairement sobre et détaché du bloc prix, pour qu'un
  // coup d'œil ne le confonde jamais avec une information client.
  marginBox: {
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 4,
    gap: 1,
  },
  marginTxt: { fontSize: 11, fontWeight: '800', color: colors.success },
  marginCost: { fontSize: 10, color: colors.textMuted },
});
