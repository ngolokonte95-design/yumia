/**
 * Mes commandes — statut, articles et suivi du colis.
 * Style boutique haut de gamme (17/11/2026) : cartes sobres en cascade, frise
 * d'avancement animée au dégradé de marque, total en typographie forte.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, radius, spacing } from '../../theme/tokens';
import { shopApi, formatPrice, type Order } from '../../lib/shop-api';
import { isHttpsUrl, openExternalHttps } from '../../lib/external-link';
import { OrderTimeline } from '../../components/shop/OrderTimeline';
import { useI18n } from '../../lib/useI18n';
import { GradientButton, ShopEmpty, ShopHeader } from '../../components/shop/ShopChrome';
import { PressableScale, Reveal } from '../../components/ui';
import type { TranslationKey } from '../../lib/translations';

/**
 * Clé de libellé + couleur par statut — le client ne voit jamais l'énum
 * brute. Le libellé est traduit au rendu, dans la langue active.
 */
const STATUS: Record<Order['status'], { labelKey: TranslationKey; color: string }> = {
  pending:    { labelKey: 'shop_orders_status_pending',    color: colors.warning },
  paid:       { labelKey: 'shop_orders_status_paid',       color: colors.success },
  fulfilling: { labelKey: 'shop_orders_status_fulfilling', color: colors.brandSoft },
  shipped:    { labelKey: 'shop_orders_status_shipped',    color: colors.brandSoft },
  delivered:  { labelKey: 'shop_orders_status_delivered',  color: colors.success },
  cancelled:  { labelKey: 'shop_orders_status_cancelled',  color: colors.textMuted },
  refunded:   { labelKey: 'shop_orders_status_refunded',   color: colors.textMuted },
};

/** Commandes terminées : les seules que le client peut retirer de sa liste. */
const HIDEABLE: ReadonlySet<Order['status']> = new Set(['delivered', 'cancelled', 'refunded']);

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { t, locale } = useI18n();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      setOrders(await shopApi.orders(accessToken));
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const confirmHide = (order: Order) => {
    if (!accessToken) return;
    Alert.alert(t('shop_orders_delete_title'), t('shop_orders_delete_body'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('shop_orders_delete_confirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            await shopApi.hideOrder(accessToken, order.id);
            setOrders((prev) => prev.filter((o) => o.id !== order.id));
          } catch {
            Alert.alert(t('error_generic'));
          }
        },
      },
    ]);
  };

  // Le paiement se termine dans le navigateur : au retour dans l'app, le
  // statut a pu changer entre-temps (webhook Stripe).
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ShopHeader title={t('shop_orders_title')} onBack={() => router.back()} backLabel={t('gs_back')} />

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : orders.length === 0 ? (
        <ShopEmpty emoji="📦" title={t('shop_orders_empty_title')} text={t('shop_orders_empty_text')}>
          <GradientButton size="md" style={styles.shopBtn} label={t('shop_orders_go_to_shop')} onPress={() => router.replace('/shop' as never)} />
        </ShopEmpty>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} />}
        >
          {orders.map((o, i) => {
            const status = STATUS[o.status];
            return (
              <Reveal key={o.id} index={Math.min(i, 5)} style={styles.card}>
                <View style={styles.cardHead}>
                  <View>
                    <Text style={styles.reference}>{o.reference}</Text>
                    <Text style={styles.date}>
                      {new Date(o.createdAt).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: `${status.color}22`, borderColor: status.color }]}>
                    <Text style={[styles.statusTxt, { color: status.color }]}>{t(status.labelKey)}</Text>
                  </View>
                </View>

                <OrderTimeline order={o} />

                <View style={styles.items}>
                  {o.items.map((item) => (
                    <View key={item.id} style={styles.item}>
                      {item.imageSnapshot ? (
                        <Image source={{ uri: item.imageSnapshot }} style={styles.itemImage} contentFit="cover" />
                      ) : (
                        <View style={[styles.itemImage, styles.itemPlaceholder]}><Text>🛍️</Text></View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle} numberOfLines={2}>{item.titleSnapshot}</Text>
                        {item.variantLabel && <Text style={styles.itemVariant}>{item.variantLabel}</Text>}
                        <Text style={styles.itemQty}>
                          {item.quantity} × {formatPrice(item.unitPriceCents, o.currency)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.totalLabel}>{t('shop_orders_total')}</Text>
                  <Text style={styles.totalValue}>{formatPrice(o.totalCents, o.currency)}</Text>
                </View>

                {isHttpsUrl(o.trackingUrl) && (
                  <PressableScale style={styles.trackBtn} onPress={() => void openExternalHttps(o.trackingUrl).catch(() => {})} scaleTo={0.97}>
                    <Text style={styles.trackTxt} numberOfLines={1}>
                      📍  {o.trackingNumber
                        ? t('shop_orders_track_with_number').replace('{number}', o.trackingNumber)
                        : t('shop_orders_track')}
                    </Text>
                  </PressableScale>
                )}

                {HIDEABLE.has(o.status) && (
                  <Pressable style={styles.deleteBtn} onPress={() => confirmHide(o)} hitSlop={6}>
                    <Text style={styles.deleteTxt}>{t('shop_orders_delete')}</Text>
                  </Pressable>
                )}
              </Reveal>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  shopBtn: { marginTop: spacing.md, alignSelf: 'stretch' },

  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)', padding: spacing.md, gap: spacing.md,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  reference: { fontSize: 16, fontWeight: '900', color: colors.textPrimary, letterSpacing: 0.3 },
  date: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontWeight: '600' },
  statusPill: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 5 },
  statusTxt: { fontSize: 12, fontWeight: '800' },

  items: { gap: spacing.sm },
  item: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  itemImage: { width: 60, height: 70, borderRadius: radius.md, backgroundColor: colors.surfaceElevated },
  itemPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 14, color: colors.textPrimary, fontWeight: '700', lineHeight: 19 },
  itemVariant: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  itemQty: { fontSize: 13, color: colors.textSecondary, marginTop: 3, fontWeight: '600' },

  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)',
  },
  totalLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' },
  totalValue: { fontSize: 22, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.5 },

  trackBtn: {
    borderRadius: radius.pill, paddingVertical: 13, paddingHorizontal: spacing.md, alignItems: 'center',
    backgroundColor: 'rgba(31,31,42,0.72)', borderWidth: 1, borderColor: colors.brand,
  },
  trackTxt: { color: colors.textPrimary, fontWeight: '800', fontSize: 14 },
  deleteBtn: { alignSelf: 'center', paddingVertical: 4, paddingHorizontal: 12 },
  deleteTxt: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
});
