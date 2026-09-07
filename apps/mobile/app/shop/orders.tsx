/** Mes commandes — statut, articles et suivi du colis. */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { shopApi, formatPrice, type Order } from '../../lib/shop-api';

/** Libellé + couleur par statut — le client ne voit jamais l'énum brute. */
const STATUS: Record<Order['status'], { label: string; color: string }> = {
  pending:    { label: 'En attente de paiement', color: colors.warning },
  paid:       { label: 'Paiement confirmé',      color: colors.success },
  fulfilling: { label: 'En préparation',         color: colors.brandSoft },
  shipped:    { label: 'Expédiée',               color: colors.brandSoft },
  delivered:  { label: 'Livrée',                 color: colors.success },
  cancelled:  { label: 'Annulée',                color: colors.textMuted },
  refunded:   { label: 'Remboursée',             color: colors.textMuted },
};

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();

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

  // Le paiement se termine dans le navigateur : au retour dans l'app, le
  // statut a pu changer entre-temps (webhook Stripe).
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>Mes commandes</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : orders.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>📦</Text>
          <Text style={styles.emptyTitle}>Aucune commande</Text>
          <Text style={styles.emptyText}>Tes commandes apparaîtront ici une fois validées.</Text>
          <Pressable style={styles.shopBtn} onPress={() => router.replace('/shop' as never)}>
            <Text style={styles.shopBtnTxt}>Aller à la boutique</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, paddingBottom: insets.bottom + spacing.xl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} />}
        >
          {orders.map((o) => {
            const status = STATUS[o.status];
            return (
              <View key={o.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <View>
                    <Text style={styles.reference}>{o.reference}</Text>
                    <Text style={styles.date}>
                      {new Date(o.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: `${status.color}22`, borderColor: status.color }]}>
                    <Text style={[styles.statusTxt, { color: status.color }]}>{status.label}</Text>
                  </View>
                </View>

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
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>{formatPrice(o.totalCents, o.currency)}</Text>
                </View>

                {o.trackingUrl && (
                  <Pressable style={styles.trackBtn} onPress={() => Linking.openURL(o.trackingUrl!)}>
                    <Text style={styles.trackTxt}>
                      Suivre mon colis{o.trackingNumber ? ` · ${o.trackingNumber}` : ''}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </ScrollView>
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

  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  reference: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  date: { fontSize: 11, color: colors.textMuted },
  statusPill: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  statusTxt: { fontSize: 11, fontWeight: '700' },

  items: { gap: spacing.sm },
  item: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  itemImage: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: colors.surfaceElevated },
  itemPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
  itemVariant: { fontSize: 11, color: colors.textMuted },
  itemQty: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  totalLabel: { fontSize: 13, color: colors.textSecondary },
  totalValue: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },

  trackBtn: { backgroundColor: colors.surfaceElevated, borderRadius: radius.pill, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  trackTxt: { color: colors.brandSoft, fontWeight: '700', fontSize: 13 },
});
