/**
 * Commandes de la boutique — liste par onglet.
 *
 * « En cours » en premier : c'est là que se trouvent les commandes à payer
 * chez AliExpress, la seule chose de cet écran qui se dégrade avec le temps
 * (sans paiement, AliExpress annule). Textes en français sans i18n, comme le
 * reste de l'administration.
 *
 * Refonte visuelle du 18/11/2026 (sobre : cartes de verre, montant en chiffres
 * forts) ; logique d'origine à l'identique.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import {
  adminOrdersApi, euros, STATUS_LABEL, TAB_LABEL, type AdminOrderRow, type AdminOrdersTab,
} from '../lib/admin-orders';
import { fmtDateTime } from '../lib/admin-users';
import { colors, radius, spacing } from '../theme/tokens';
import { PressableScale } from '../components/ui';
import { CHEVRON, GLASS } from '../components/profile/ProfileChrome';
import { QuietChip, QuietEmpty, QuietHeader } from '../components/pb2/Pb2Chrome';
import { ADMIN_SPINNER, ErrorBanner, StatusBadge } from '../components/admin/AdminChrome';

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
      <QuietHeader title="Commandes" onBack={() => router.back()} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
        {TABS.map((k) => {
          const n = counts[k];
          return (
            <QuietChip
              key={k}
              label={`${TAB_LABEL[k]}${typeof n === 'number' ? ` · ${n}` : ''}`}
              active={tab === k}
              onPress={() => setTab(k)}
            />
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

      {error ? <ErrorBanner message={error} /> : null}

      <FlatList
        data={orders}
        keyExtractor={(o) => o.reference}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load(tab)} tintColor={ADMIN_SPINNER} colors={[colors.brand]} />}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, paddingBottom: insets.bottom + 40 }}
        ListEmptyComponent={
          loading ? <ActivityIndicator color={ADMIN_SPINNER} style={{ marginTop: 40 }} />
          : <QuietEmpty emoji="📦" title="Aucune commande ici." />
        }
        renderItem={({ item }) => (
          <PressableScale
            style={[styles.card, GLASS]}
            onPress={() => router.push(`/admin-order?ref=${encodeURIComponent(item.reference)}` as never)}
            scaleTo={0.98}
          >
            <View style={styles.row}>
              <Text style={styles.ref} numberOfLines={1}>{item.reference}</Text>
              <Text style={styles.total}>{euros(item.totalCents, item.currency)}</Text>
            </View>
            <View style={styles.row}>
              <StatusBadge label={STATUS_LABEL[item.status] ?? item.status} tone="plan" />
              <Text style={styles.chevron}>{CHEVRON}</Text>
            </View>
            <Text style={styles.meta}>
              {fmtDateTime(item.createdAt)} · {item.itemCount} article{item.itemCount > 1 ? 's' : ''}
              {item.customer ? ` · ${item.customer}` : ''}
            </Text>
            {item.trackingNumber ? <Text style={styles.meta}>Suivi : {item.trackingNumber}</Text> : null}
          </PressableScale>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  tabsScroll: { flexGrow: 0, flexShrink: 0 },
  tabs: { gap: 8, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  card: { borderRadius: radius.lg, padding: spacing.md, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  ref: { color: colors.textPrimary, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  total: { color: colors.textPrimary, fontSize: 18, fontWeight: '900', letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  chevron: { color: colors.textMuted, fontSize: 22, fontWeight: '300', marginTop: -2 },
  meta: { color: colors.textMuted, fontSize: 12.5 },
});
