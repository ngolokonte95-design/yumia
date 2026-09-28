/**
 * Commandes de la boutique — liste par onglet.
 *
 * « En cours » en premier : c'est là que se trouvent les commandes à payer
 * chez AliExpress, la seule chose de cet écran qui se dégrade avec le temps
 * (sans paiement, AliExpress annule). Textes en français sans i18n, comme le
 * reste de l'administration.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import {
  adminOrdersApi, euros, STATUS_LABEL, TAB_LABEL, type AdminOrderRow, type AdminOrdersTab,
} from '../lib/admin-orders';
import { fmtDateTime } from '../lib/admin-users';
import { colors, radius, spacing, typography } from '../theme/tokens';

const TABS: AdminOrdersTab[] = ['in_progress', 'to_transmit', 'shipped', 'delivered', 'all'];

export default function AdminOrdersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accessToken } = useAuth();
  const [tab, setTab] = useState<AdminOrdersTab>('in_progress');
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [counts, setCounts] = useState<Partial<Record<AdminOrdersTab, number>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (which: AdminOrdersTab) => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminOrdersApi.list(accessToken, which);
      setOrders(res.orders);
      setCounts(res.counts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  // Au retour d'une fiche (paiement, retransmission), la liste est relue.
  useFocusEffect(useCallback(() => { void load(tab); }, [load, tab]));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.title}>Commandes</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
        {TABS.map((k) => {
          const n = counts[k];
          const active = tab === k;
          return (
            <Pressable key={k} style={[styles.tab, active && styles.tabActive]} onPress={() => setTab(k)}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {TAB_LABEL[k]}{typeof n === 'number' ? ` · ${n}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {tab === 'in_progress' && (counts.in_progress ?? 0) > 0 ? (
        <Text style={styles.hint}>
          Ouvre chaque commande pour voir si elle attend d'être payée chez AliExpress : sans paiement, elle est annulée.
        </Text>
      ) : null}
      {tab === 'to_transmit' && (counts.to_transmit ?? 0) > 0 ? (
        <Text style={styles.hint}>
          Payées par le client mais pas (ou plus) chez AliExpress : refus d'adresse, ou annulées faute de paiement. Ouvre-les pour les retransmettre.
        </Text>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={orders}
        keyExtractor={(o) => o.reference}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load(tab)} tintColor={colors.brand} />}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, paddingBottom: insets.bottom + 40 }}
        ListEmptyComponent={
          loading ? <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
          : <Text style={styles.empty}>Aucune commande ici.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
            onPress={() => router.push(`/admin-order?ref=${encodeURIComponent(item.reference)}` as never)}
          >
            <View style={styles.row}>
              <Text style={styles.ref}>{item.reference}</Text>
              <Text style={styles.total}>{euros(item.totalCents, item.currency)}</Text>
            </View>
            <Text style={styles.status}>{STATUS_LABEL[item.status] ?? item.status}</Text>
            <Text style={styles.meta}>
              {fmtDateTime(item.createdAt)} · {item.itemCount} article{item.itemCount > 1 ? 's' : ''}
              {item.customer ? ` · ${item.customer}` : ''}
            </Text>
            {item.trackingNumber ? <Text style={styles.meta}>Suivi : {item.trackingNumber}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  back: { fontSize: 24, color: colors.brandSoft },
  title: { ...typography.h2, color: colors.text },
  tabsScroll: { flexGrow: 0, flexShrink: 0 },
  tabs: { gap: 8, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: '#fff' },
  hint: { ...typography.caption, color: colors.textSecondary, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  error: { color: colors.danger, paddingHorizontal: spacing.md },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: 40 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ref: { fontSize: 15, fontWeight: '700', color: colors.text },
  total: { fontSize: 15, fontWeight: '700', color: colors.brandSoft },
  status: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textMuted },
});
