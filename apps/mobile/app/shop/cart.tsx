/**
 * Panier — quantités, indisponibilités, récapitulatif et accès au paiement.
 * Style boutique haut de gamme (17/11/2026) : cartes à grande vignette,
 * sélecteur de quantité en verre, total qui rebondit quand il change,
 * bouton de paiement au dégradé de marque.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, motion, radius, spacing } from '../../theme/tokens';
import { shopApi, formatPrice, type CartSummary } from '../../lib/shop-api';
import { haptics } from '../../lib/useHaptics';
import { GradientButton, PricePop, ShopEmpty, ShopHeader } from '../../components/shop/ShopChrome';
import { PressableScale, Reveal } from '../../components/ui';
import { useI18n } from '../../lib/useI18n';

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { t } = useI18n();

  const [cart, setCart] = useState<CartSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      setCart(await shopApi.cart(accessToken));
    } catch {
      setCart(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  /**
   * Tirer pour rafraîchir : relit le panier sur le serveur (prix, stocks,
   * quantités à jour). Contrairement à `load`, un échec réseau ne vide pas
   * le panier affiché.
   */
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    if (!accessToken) return;
    setRefreshing(true);
    try {
      setCart(await shopApi.cart(accessToken));
    } catch {
      // Réseau indisponible : on garde le panier affiché.
    } finally {
      setRefreshing(false);
    }
  }, [accessToken]);

  async function changeQuantity(itemId: string, quantity: number) {
    if (!accessToken || busyItemId) return;
    setBusyItemId(itemId);
    haptics.select();
    try {
      setCart(await shopApi.updateCartItem(accessToken, itemId, quantity));
    } catch {
      // Le panier affiché reste celui d'avant : rien n'est perdu, l'utilisateur
      // peut réessayer.
    } finally {
      setBusyItemId(null);
    }
  }

  async function removeItem(itemId: string) {
    if (!accessToken || busyItemId) return;
    setBusyItemId(itemId);
    haptics.light();
    try {
      setCart(await shopApi.removeCartItem(accessToken, itemId));
    } finally {
      setBusyItemId(null);
    }
  }

  const isEmpty = !loading && (!cart || cart.lines.length === 0);
  const hasBuyable = !!cart && cart.lines.some((l) => l.available);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ShopHeader
        title={t('shop_cart_title')}
        onBack={() => router.back()}
        backLabel={t('gs_back')}
      />

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : isEmpty ? (
        <ShopEmpty emoji="🛒" title={t('shop_cart_empty_title')} text={t('shop_cart_empty_text')}>
          <GradientButton size="md" style={styles.shopBtn} label={t('shop_cart_discover_shop')} onPress={() => router.replace('/shop' as never)} />
        </ShopEmpty>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 280 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.brand} colors={[colors.brand]} />
            }
          >
            {cart!.lines.map((line, i) => (
              <Animated.View
                key={line.id}
                layout={LinearTransition.duration(motion.duration.normal)}
                exiting={FadeOut.duration(motion.duration.fast)}
              >
              <Reveal index={Math.min(i, 6)} style={[styles.line, !line.available && styles.lineUnavailable]}>
                <PressableScale onPress={() => router.push(`/shop/product/${line.slug}` as never)} scaleTo={0.95}>
                  {line.imageUrl ? (
                    <Image source={{ uri: line.imageUrl }} style={styles.lineImage} contentFit="cover" />
                  ) : (
                    <View style={[styles.lineImage, styles.linePlaceholder]}><Text style={{ fontSize: 28 }}>🛍️</Text></View>
                  )}
                </PressableScale>

                <View style={styles.lineBody}>
                  <Text style={styles.lineTitle} numberOfLines={2}>{line.title}</Text>
                  {line.variantLabel && <Text style={styles.lineVariant}>{line.variantLabel}</Text>}
                  {!line.available && <Text style={styles.unavailable}>{t('shop_cart_line_unavailable')}</Text>}

                  <View style={styles.lineFooter}>
                    <PricePop style={styles.linePrice} text={formatPrice(line.lineTotalCents, cart!.currency)} />
                    <View style={styles.qtyRow}>
                      <Pressable
                        style={styles.qtyBtn}
                        onPress={() => (line.quantity <= 1 ? removeItem(line.id) : changeQuantity(line.id, line.quantity - 1))}
                        disabled={busyItemId === line.id}
                        accessibilityRole="button"
                        accessibilityLabel={t(line.quantity <= 1 ? 'shop_cart_remove_item' : 'shop_cart_decrease_qty')}
                      >
                        <Text style={styles.qtyBtnTxt}>{line.quantity <= 1 ? '🗑' : '−'}</Text>
                      </Pressable>
                      <Text style={styles.qty}>{line.quantity}</Text>
                      <Pressable
                        style={styles.qtyBtn}
                        onPress={() => changeQuantity(line.id, line.quantity + 1)}
                        disabled={busyItemId === line.id}
                        accessibilityRole="button"
                        accessibilityLabel={t('shop_cart_increase_qty')}
                      >
                        <Text style={styles.qtyBtnTxt}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </Reveal>
              </Animated.View>
            ))}
          </ScrollView>

          {/* Récapitulatif */}
          <View style={[styles.summary, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('shop_cart_subtotal')}</Text>
              <Text style={styles.summaryValue}>{formatPrice(cart!.subtotalCents, cart!.currency)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('shop_cart_shipping')}</Text>
              <Text style={[styles.summaryValue, cart!.shippingCents === 0 && styles.free]}>
                {cart!.shippingCents === 0 ? t('shop_cart_shipping_free') : formatPrice(cart!.shippingCents, cart!.currency)}
              </Text>
            </View>
            <View style={[styles.summaryRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>{t('sor_total')}</Text>
              <PricePop style={styles.totalValue} text={formatPrice(cart!.totalCents, cart!.currency)} />
            </View>
            <GradientButton
              style={styles.checkoutBtn}
              icon="🔒"
              label={t('shop_cart_checkout')}
              onPress={() => router.push('/shop/checkout' as never)}
              disabled={!hasBuyable}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  shopBtn: { marginTop: spacing.md, alignSelf: 'stretch' },

  line: {
    flexDirection: 'row', gap: spacing.md, backgroundColor: colors.surface,
    borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)',
    padding: spacing.sm,
  },
  lineUnavailable: { opacity: 0.6, borderColor: colors.danger },
  lineImage: { width: 96, height: 112, borderRadius: radius.md, backgroundColor: colors.surfaceElevated },
  linePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  lineBody: { flex: 1, justifyContent: 'space-between', paddingVertical: 2 },
  lineTitle: { fontSize: 14, color: colors.textPrimary, fontWeight: '700', lineHeight: 19 },
  lineVariant: { fontSize: 12, color: colors.textMuted, marginTop: 3, fontWeight: '600' },
  unavailable: { fontSize: 12, color: colors.danger, marginTop: 3, fontWeight: '700' },
  lineFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  linePrice: { fontSize: 18, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.3 },
  qtyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4, padding: 3, borderRadius: radius.pill,
    backgroundColor: 'rgba(31,31,42,0.72)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)',
  },
  qtyBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnTxt: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  qty: { color: colors.textPrimary, fontSize: 15, fontWeight: '900', minWidth: 22, textAlign: 'center' },

  summary: {
    position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(14,14,18,0.97)',
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
    padding: spacing.lg, paddingBottom: spacing.md, gap: 8,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  summaryValue: { fontSize: 15, color: colors.textPrimary, fontWeight: '700' },
  free: { color: colors.success },
  totalRow: {
    marginTop: 4, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.14)',
  },
  totalLabel: { fontSize: 13, fontWeight: '800', color: colors.textMuted, letterSpacing: 1.4, textTransform: 'uppercase' },
  totalValue: { fontSize: 28, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.8 },
  checkoutBtn: { marginTop: spacing.sm },
});
