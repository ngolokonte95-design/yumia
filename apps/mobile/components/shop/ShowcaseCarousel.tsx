/**
 * Vitrine de l'accueil Boutique : grandes cartes photo qu'on fait glisser une
 * à une, points de pagination animés. Le voile sombre reste confiné au bas de
 * CHAQUE photo (lisibilité du texte), jamais posé sur le fond de l'écran.
 */
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { colors, gradients, radius, spacing } from '../../theme/tokens';
import { formatPrice, type ProductListItem } from '../../lib/shop-api';
import { useI18n } from '../../lib/useI18n';
import { shopCategoryName } from '../../lib/shop-category-name';
import { PressableScale } from '../ui';

const GAP = 12;
const CARD_H = 400;

export function ShowcaseCarousel({ products, onOpen }: {
  products: ProductListItem[];
  onOpen: (p: ProductListItem) => void;
}) {
  const { width } = useWindowDimensions();
  const cardW = width - spacing.lg * 2;
  const step = cardW + GAP;
  const x = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { x.value = e.contentOffset.x; });

  if (!products.length) return null;
  return (
    <View>
      <Animated.FlatList
        horizontal
        data={products}
        keyExtractor={(p) => p.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: GAP }}
        renderItem={({ item, index }) => (
          <ShowcaseCard product={item} width={cardW} index={index} step={step} x={x} onPress={() => onOpen(item)} />
        )}
      />
      {products.length > 1 ? (
        <View style={styles.dots}>
          {products.map((p, i) => <Dot key={p.id} index={i} step={step} x={x} />)}
        </View>
      ) : null}
    </View>
  );
}

function ShowcaseCard({ product, width, index, step, x, onPress }: {
  product: ProductListItem;
  width: number;
  index: number;
  step: number;
  x: SharedValue<number>;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const image = product.images[0];
  const hasDiscount = product.compareAtCents != null && product.compareAtCents > product.priceCents;

  // La photo glisse un peu moins vite que la carte : profondeur.
  const photoStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(x.value, [(index - 1) * step, index * step, (index + 1) * step], [-40, 0, 40], Extrapolation.CLAMP) },
      { scale: 1.18 },
    ],
  }));

  return (
    <PressableScale style={[styles.card, { width }]} onPress={onPress} scaleTo={0.97}>
      <Animated.View style={[StyleSheet.absoluteFill, photoStyle]}>
        {image ? (
          <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} recyclingKey={image} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
            <Text style={styles.placeholderEmoji}>{product.category.emoji}</Text>
          </View>
        )}
      </Animated.View>
      {/* Voile confiné au bas de la photo, pour lire le texte. */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.88)']}
        locations={[0.4, 0.7, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.cardBody}>
        <Text style={styles.kicker} numberOfLines={1}>
          {product.category.emoji} {shopCategoryName(t, product.category.slug, product.category.nameFr)}
        </Text>
        <Text style={styles.title} numberOfLines={2}>{product.title}</Text>
        <View style={styles.bottomRow}>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatPrice(product.priceCents, product.currency)}</Text>
            {hasDiscount ? (
              <Text style={styles.compareAt}>{formatPrice(product.compareAtCents!, product.currency)}</Text>
            ) : null}
          </View>
          <View style={styles.go}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Text style={styles.goTxt}>→</Text>
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

function Dot({ index, step, x }: { index: number; step: number; x: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const d = Math.abs(x.value / step - index);
    const on = Math.max(0, 1 - d);
    return { width: 6 + on * 16, opacity: 0.35 + on * 0.65 };
  });
  return (
    <Animated.View style={[styles.dot, style]}>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: CARD_H, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'flex-end',
  },
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated },
  placeholderEmoji: { fontSize: 72 },
  cardBody: { padding: spacing.lg, gap: 6 },
  kicker: {
    color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '800',
    letterSpacing: 1.6, textTransform: 'uppercase',
  },
  title: {
    color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: -0.5, lineHeight: 28,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 2 },
  },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexShrink: 1 },
  price: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  compareAt: { color: 'rgba(255,255,255,0.65)', fontSize: 14, textDecorationLine: 'line-through' },
  go: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  goTxt: { color: '#fff', fontSize: 20, fontWeight: '900' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: spacing.md },
  dot: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.border },
});
