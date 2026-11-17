/**
 * Carte produit — utilisée en rangée horizontale (accueil) et en grille
 * (rayon, recherche, idées cadeaux). `variant` change uniquement la largeur :
 * en grille la carte s'adapte à la colonne, en rangée elle est fixe.
 *
 * Style boutique haut de gamme (17/11/2026) : grande photo au format 4:5,
 * typographie de prix forte, une seule couleur d'accent (dégradé de marque)
 * pour la remise et le rang.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, spacing } from '../../theme/tokens';
import { formatPrice, type ProductListItem } from '../../lib/shop-api';
import { useI18n } from '../../lib/useI18n';
import { PressableScale } from '../ui';

interface Props {
  product: ProductListItem;
  onPress: () => void;
  variant?: 'row' | 'grid';
  /**
   * Rang dans une liste réellement triée (meilleures ventes) : affiché en
   * grand sur la photo. Ne le passer que si l'ordre a ce sens.
   */
  rank?: number;
}

export function ProductCard({ product, onPress, variant = 'row', rank }: Props) {
  const { t } = useI18n();
  const image = product.images[0];
  // Une remise n'est affichée que si le prix barré est réellement supérieur —
  // sinon le pourcentage serait nul ou négatif, donc mensonger.
  const hasDiscount = product.compareAtCents != null && product.compareAtCents > product.priceCents;
  const discountPercent = hasDiscount
    ? Math.round((1 - product.priceCents / product.compareAtCents!) * 100)
    : 0;

  return (
    <PressableScale style={[styles.card, variant === 'grid' && styles.cardGrid]} onPress={onPress} scaleTo={0.96}>
      <View style={styles.imageWrap}>
        {image ? (
          <Image source={{ uri: image }} style={styles.image} contentFit="cover" transition={180} recyclingKey={image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text style={styles.placeholderEmoji}>{product.category.emoji}</Text>
          </View>
        )}
        {hasDiscount ? (
          <View style={styles.discountBadge}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Text style={styles.discountTxt}>-{discountPercent}%</Text>
          </View>
        ) : null}
        {rank != null ? (
          <View style={styles.rankBadge}>
            <Text style={styles.rankTxt}>{rank}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{product.title}</Text>

        {/* `rating`/`reviewsCount` sont l'agregat AliExpress tant qu'aucun vrai
            avis YUMIA n'existe (cf. shop-api.ts) : on n'affiche l'etoile que si
            _count.reviews le confirme, sinon on presenterait des avis clients
            qui ne sont pas les notres — directive Omnibus (UE) 2019/2161. */}
        {product.rating != null && product._count.reviews > 0 && (
          <View style={styles.ratingRow}>
            <Text style={styles.star}>★</Text>
            <Text style={styles.rating}>{product.rating.toFixed(1)}</Text>
            <Text style={styles.reviews}>({product.reviewsCount})</Text>
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
              {t('shop_card_admin_margin')
                .replace('{amount}', formatPrice(product.adminMargin.marginCents, product.currency))
                .replace('{percent}', String(product.adminMargin.marginPercent))}
            </Text>
            <Text style={styles.marginCost}>
              {t('shop_card_admin_cost')
                .replace('{amount}', formatPrice(product.adminMargin.costCents, product.currency))
                .replace('{multiplier}', String(product.adminMargin.multiplier))}
            </Text>
          </View>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 168, backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)', overflow: 'hidden',
  },
  // En grille, la largeur vient de la colonne parente (flex), pas de la carte.
  cardGrid: { width: '100%' },
  imageWrap: { position: 'relative' },
  image: { width: '100%', aspectRatio: 4 / 5, backgroundColor: colors.surfaceElevated },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderEmoji: { fontSize: 40 },
  discountBadge: {
    position: 'absolute', top: 8, left: 8, overflow: 'hidden',
    borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3,
  },
  discountTxt: { color: '#fff', fontSize: 11, fontWeight: '900' },
  rankBadge: {
    position: 'absolute', bottom: 8, left: 8, minWidth: 30, height: 30, borderRadius: 15,
    paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(14,14,18,0.72)', borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  rankTxt: { color: '#fff', fontSize: 15, fontWeight: '900' },
  body: { padding: spacing.sm + 2, gap: 4 },
  title: { fontSize: 13, color: colors.textPrimary, fontWeight: '600', lineHeight: 17, minHeight: 34 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  star: { color: colors.warning, fontSize: 11 },
  rating: { fontSize: 11, color: colors.textSecondary, fontWeight: '700' },
  reviews: { fontSize: 10, color: colors.textMuted },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  price: { fontSize: 18, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.3 },
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
