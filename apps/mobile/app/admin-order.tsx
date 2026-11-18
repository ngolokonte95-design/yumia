/**
 * Fiche d'une commande — état en direct chez AliExpress, lien de paiement,
 * suivi, et actions : actualiser, retransmettre.
 *
 * Refonte visuelle du 18/11/2026 (sobre : verre, montant en chiffres forts ;
 * seul le paiement à faire chez AliExpress porte le dégradé de marque) ;
 * logique et confirmations d'origine à l'identique.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { adminOrdersApi, euros, STAGE_LABEL, STATUS_LABEL, type AdminOrderDetail } from '../lib/admin-orders';
import { fmtDateTime } from '../lib/admin-users';
import { openExternalHttps } from '../lib/external-link';
import { colors, radius, spacing } from '../theme/tokens';
import { BrandButton } from '../components/social/SocialChrome';
import { QuietHeader } from '../components/pb2/Pb2Chrome';
import {
  ADMIN_SPINNER, AdminButton, AdminCard, AdminSection, ErrorBanner, StatusBadge,
} from '../components/admin/AdminChrome';

export default function AdminOrderScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accessToken } = useAuth();
  const { ref } = useLocalSearchParams<{ ref?: string }>();
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'sync' | 'retransmit' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !ref) return;
    setLoading(true);
    setError(null);
    try {
      setOrder(await adminOrdersApi.detail(accessToken, ref));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }, [accessToken, ref]);

  // Relue au retour d'AliExpress : on vient souvent de payer.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const sync = async () => {
    if (!accessToken || !ref) return;
    setBusy('sync');
    try {
      const { stage } = await adminOrdersApi.sync(accessToken, ref);
      Alert.alert('Actualisée', STAGE_LABEL[stage]);
      await load();
    } catch (e) {
      Alert.alert('Échec', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setBusy(null);
    }
  };

  const retransmit = () => {
    if (!accessToken || !ref) return;
    Alert.alert(
      'Retransmettre à AliExpress ?',
      'Une nouvelle commande sera créée chez AliExpress. Tu devras ensuite la payer dans ton compte AliExpress.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retransmettre',
          onPress: async () => {
            setBusy('retransmit');
            try {
              const res = await adminOrdersApi.retransmit(accessToken, ref);
              Alert.alert(
                res.aliexpressOrderId ? 'Transmise' : 'Non transmise',
                res.aliexpressOrderId
                  ? 'Commande créée chez AliExpress. Pense à la payer : le lien est dans la fiche.'
                  : 'AliExpress a refusé la commande (souvent l\'adresse ou le téléphone). Voir les journaux du serveur, ou retry-order pour corriger l\'adresse.',
              );
              await load();
            } catch (e) {
              Alert.alert('Échec', e instanceof Error ? e.message : 'Réessaie.');
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  const address = order?.address ?? {};

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <QuietHeader title={ref ?? ''} onBack={() => router.back()} />

      {loading && !order ? <ActivityIndicator color={ADMIN_SPINNER} style={{ marginTop: 40 }} /> : null}
      {error ? <ErrorBanner message={error} /> : null}

      {order ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={ADMIN_SPINNER} colors={[colors.brand]} />}
        >
          <AdminCard style={styles.summary}>
            <StatusBadge label={STATUS_LABEL[order.status] ?? order.status} tone="plan" />
            <Text style={styles.total}>{euros(order.totalCents, order.currency)}</Text>
            <Text style={styles.meta}>Commandée le {fmtDateTime(order.createdAt)}</Text>
            {order.paidAt ? <Text style={styles.meta}>Payée par le client le {fmtDateTime(order.paidAt)}</Text> : null}
            {order.shippedAt ? <Text style={styles.meta}>Expédiée le {fmtDateTime(order.shippedAt)}</Text> : null}
          </AdminCard>

          {/* ── AliExpress ── */}
          <AdminSection title="Chez AliExpress" />
          {order.aliexpress.length === 0 ? (
            <AdminCard style={styles.card}>
              <Text style={styles.meta}>Pas transmise à AliExpress.</Text>
              {order.status === 'paid' ? (
                <BrandButton
                  label={busy === 'retransmit' ? '…' : 'Transmettre à AliExpress'}
                  onPress={retransmit}
                  disabled={busy !== null}
                  style={styles.cardBtn}
                />
              ) : null}
            </AdminCard>
          ) : (
            order.aliexpress.map((ae) => (
              <AdminCard key={ae.id} style={styles.card} alert={ae.stage === 'awaiting_payment'}>
                <Text style={styles.stage}>{STAGE_LABEL[ae.stage]}</Text>
                <Text style={styles.meta}>N° {ae.id}{ae.amount ? ` · ${ae.amount}` : ''}</Text>
                {ae.endReason ? <Text style={styles.meta}>Motif : {ae.endReason}</Text> : null}
                {ae.trackingNumber ? (
                  <Text style={styles.meta}>Suivi : {ae.trackingNumber}{ae.carrier ? ` (${ae.carrier})` : ''}</Text>
                ) : null}
                {ae.stage === 'awaiting_payment' ? (
                  <BrandButton label="Payer sur AliExpress" onPress={() => void openExternalHttps(ae.url)} style={styles.cardBtn} />
                ) : (
                  <AdminButton label="Ouvrir chez AliExpress" onPress={() => void openExternalHttps(ae.url)} style={styles.cardBtn} />
                )}
              </AdminCard>
            ))
          )}

          <View style={styles.actions}>
            {order.aliexpress.length > 0 ? (
              <AdminButton
                label={busy === 'sync' ? '…' : '↻ Actualiser le statut'}
                onPress={() => void sync()}
                disabled={busy !== null}
                style={styles.action}
              />
            ) : null}
            {order.trackingUrl ? (
              <AdminButton label="Suivre le colis" onPress={() => void openExternalHttps(order.trackingUrl)} style={styles.action} />
            ) : null}
          </View>

          {/* ── Articles ── */}
          <AdminSection title="Articles" />
          {order.items.map((it, k) => (
            <AdminCard key={k} style={styles.itemRow}>
              {it.image ? <Image source={{ uri: it.image }} style={styles.itemImg} /> : null}
              <View style={styles.itemText}>
                <Text style={styles.itemTitle} numberOfLines={2}>{it.title}</Text>
                {it.variant ? <Text style={styles.meta}>{it.variant}</Text> : null}
                <Text style={styles.meta}>{it.quantity} × {euros(it.unitPriceCents, order.currency)}</Text>
              </View>
            </AdminCard>
          ))}

          {/* ── Client ── */}
          <AdminSection title="Livraison" />
          <AdminCard style={styles.card}>
            {order.customer ? <Text style={styles.itemTitle}>{order.customer.name} · {order.customer.email}</Text> : (
              <Text style={styles.meta}>Compte supprimé</Text>
            )}
            <Text style={styles.meta}>{address.fullName}</Text>
            <Text style={styles.meta}>{[address.line1, address.line2].filter(Boolean).join(', ')}</Text>
            <Text style={styles.meta}>{[address.postalCode, address.city, address.countryCode].filter(Boolean).join(' ')}</Text>
            {address.phone ? <Text style={styles.meta}>{address.phone}</Text> : null}
          </AdminCard>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  summary: { gap: 4, alignItems: 'flex-start' },
  total: { color: colors.textPrimary, fontSize: 40, fontWeight: '900', letterSpacing: -1.2, fontVariant: ['tabular-nums'], marginTop: 6, marginBottom: 2 },
  card: { gap: 6 },
  cardBtn: { marginTop: spacing.sm },
  stage: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  meta: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginHorizontal: spacing.md, marginTop: spacing.xs },
  action: { flexGrow: 1 },
  itemRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  itemImg: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.surfaceElevated },
  itemText: { flex: 1, minWidth: 0, gap: 2 },
  itemTitle: { color: colors.textPrimary, fontSize: 14.5, fontWeight: '700' },
});
