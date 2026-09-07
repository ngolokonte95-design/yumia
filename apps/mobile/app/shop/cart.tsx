/** Panier — quantités, indisponibilités, récapitulatif et accès au paiement. */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { shopApi, formatPrice, type CartSummary } from '../../lib/shop-api';
import { haptics } from '../../lib/useHaptics';

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();

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
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>Mon panier</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : isEmpty ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🛒</Text>
          <Text style={styles.emptyTitle}>Ton panier est vide</Text>
          <Text style={styles.emptyText}>Parcours la boutique et ajoute tes premiers articles.</Text>
          <Pressable style={styles.shopBtn} onPress={() => router.replace('/shop' as never)}>
            <Text style={styles.shopBtnTxt}>Découvrir la boutique</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, paddingBottom: 200 }}>
            {cart!.lines.map((line) => (
              <View key={line.id} style={[styles.line, !line.available && styles.lineUnavailable]}>
                <Pressable onPress={() => router.push(`/shop/product/${line.slug}` as never)}>
                  {line.imageUrl ? (
                    <Image source={{ uri: line.imageUrl }} style={styles.lineImage} contentFit="cover" />
                  ) : (
                    <View style={[styles.lineImage, styles.linePlaceholder]}><Text>🛍️</Text></View>
                  )}
                </Pressable>

                <View style={styles.lineBody}>
                  <Text style={styles.lineTitle} numberOfLines={2}>{line.title}</Text>
                  {line.variantLabel && <Text style={styles.lineVariant}>{line.variantLabel}</Text>}
                  {!line.available && <Text style={styles.unavailable}>Indisponible — retire-le pour continuer</Text>}

                  <View style={styles.lineFooter}>
                    <Text style={styles.linePrice}>{formatPrice(line.lineTotalCents, cart!.currency)}</Text>
                    <View style={styles.qtyRow}>
                      <Pressable
                        style={styles.qtyBtn}
                        onPress={() => (line.quantity <= 1 ? removeItem(line.id) : changeQuantity(line.id, line.quantity - 1))}
                        disabled={busyItemId === line.id}
                      >
                        <Text style={styles.qtyBtnTxt}>{line.quantity <= 1 ? '🗑' : '−'}</Text>
                      </Pressable>
                      <Text style={styles.qty}>{line.quantity}</Text>
                      <Pressable
                        style={styles.qtyBtn}
                        onPress={() => changeQuantity(line.id, line.quantity + 1)}
                        disabled={busyItemId === line.id}
                      >
                        <Text style={styles.qtyBtnTxt}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Récapitulatif */}
          <View style={[styles.summary, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Sous-total</Text>
              <Text style={styles.summaryValue}>{formatPrice(cart!.subtotalCents, cart!.currency)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Livraison</Text>
              <Text style={[styles.summaryValue, cart!.shippingCents === 0 && styles.free]}>
                {cart!.shippingCents === 0 ? 'Offerte' : formatPrice(cart!.shippingCents, cart!.currency)}
              </Text>
            </View>
            <View style={[styles.summaryRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatPrice(cart!.totalCents, cart!.currency)}</Text>
            </View>
            <Pressable
              style={[styles.checkoutBtn, !hasBuyable && styles.checkoutBtnDisabled]}
              onPress={() => router.push('/shop/checkout' as never)}
              disabled={!hasBuyable}
            >
              <Text style={styles.checkoutTxt}>Passer commande</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  back: { fontSize: 24, color: colors.brandSoft },
  title: { ...typography.h3, color: colors.textPrimary },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { ...typography.h3, color: colors.textPrimary },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  shopBtn: { marginTop: spacing.md, backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 24, paddingVertical: 12 },
  shopBtnTxt: { color: '#fff', fontWeight: '700' },

  line: {
    flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm,
  },
  lineUnavailable: { opacity: 0.6, borderColor: colors.danger },
  lineImage: { width: 84, height: 84, borderRadius: radius.sm, backgroundColor: colors.surfaceElevated },
  linePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  lineBody: { flex: 1, justifyContent: 'space-between' },
  lineTitle: { ...typography.caption, color: colors.textPrimary, fontWeight: '600' },
  lineVariant: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  unavailable: { fontSize: 11, color: colors.danger, marginTop: 2 },
  lineFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  linePrice: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  qtyBtn: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
  },
  qtyBtnTxt: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  qty: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', minWidth: 18, textAlign: 'center' },

  summary: {
    position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.md, gap: 6,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 13, color: colors.textSecondary },
  summaryValue: { fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
  free: { color: colors.success },
  totalRow: { marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  totalLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  totalValue: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  checkoutBtn: { marginTop: spacing.sm, backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 15, alignItems: 'center' },
  checkoutBtnDisabled: { opacity: 0.5 },
  checkoutTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
