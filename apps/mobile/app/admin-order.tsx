/**
 * Fiche d'une commande — état en direct chez AliExpress, lien de paiement,
 * suivi, et actions : actualiser, retransmettre.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { adminOrdersApi, euros, STAGE_LABEL, STATUS_LABEL, type AdminOrderDetail } from '../lib/admin-orders';
import { fmtDateTime } from '../lib/admin-users';
import { openExternalHttps } from '../lib/external-link';
import { colors, radius, spacing, typography } from '../theme/tokens';

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
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.title}>{ref}</Text>
      </View>

      {loading && !order ? <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {order ? (
        <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: insets.bottom + 40 }}>
          <View style={styles.card}>
            <Text style={styles.status}>{STATUS_LABEL[order.status] ?? order.status}</Text>
            <Text style={styles.meta}>Commandée le {fmtDateTime(order.createdAt)}</Text>
            {order.paidAt ? <Text style={styles.meta}>Payée par le client le {fmtDateTime(order.paidAt)}</Text> : null}
            {order.shippedAt ? <Text style={styles.meta}>Expédiée le {fmtDateTime(order.shippedAt)}</Text> : null}
            <Text style={styles.total}>{euros(order.totalCents, order.currency)}</Text>
          </View>

          {/* ── AliExpress ── */}
          <Text style={styles.section}>Chez AliExpress</Text>
          {order.aliexpress.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.meta}>Pas transmise à AliExpress.</Text>
              {order.status === 'paid' ? (
                <Pressable style={styles.primaryBtn} onPress={retransmit} disabled={busy !== null}>
                  <Text style={styles.primaryTxt}>{busy === 'retransmit' ? '…' : 'Transmettre à AliExpress'}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            order.aliexpress.map((ae) => (
              <View key={ae.id} style={[styles.card, ae.stage === 'awaiting_payment' && styles.cardAlert]}>
                <Text style={styles.stage}>{STAGE_LABEL[ae.stage]}</Text>
                <Text style={styles.meta}>N° {ae.id}{ae.amount ? ` · ${ae.amount}` : ''}</Text>
                {ae.endReason ? <Text style={styles.meta}>Motif : {ae.endReason}</Text> : null}
                {ae.trackingNumber ? (
                  <Text style={styles.meta}>Suivi : {ae.trackingNumber}{ae.carrier ? ` (${ae.carrier})` : ''}</Text>
                ) : null}
                <Pressable
                  style={ae.stage === 'awaiting_payment' ? styles.primaryBtn : styles.secondaryBtn}
                  onPress={() => void openExternalHttps(ae.url)}
                >
                  <Text style={ae.stage === 'awaiting_payment' ? styles.primaryTxt : styles.secondaryTxt}>
                    {ae.stage === 'awaiting_payment' ? 'Payer sur AliExpress' : 'Ouvrir chez AliExpress'}
                  </Text>
                </Pressable>
              </View>
            ))
          )}

          <View style={styles.actions}>
            {order.aliexpress.length > 0 ? (
              <Pressable style={styles.secondaryBtn} onPress={() => void sync()} disabled={busy !== null}>
                <Text style={styles.secondaryTxt}>{busy === 'sync' ? '…' : '↻ Actualiser le statut'}</Text>
              </Pressable>
            ) : null}
            {order.trackingUrl ? (
              <Pressable style={styles.secondaryBtn} onPress={() => void openExternalHttps(order.trackingUrl)}>
                <Text style={styles.secondaryTxt}>Suivre le colis</Text>
              </Pressable>
            ) : null}
          </View>

          {/* ── Articles ── */}
          <Text style={styles.section}>Articles</Text>
          {order.items.map((it, k) => (
            <View key={k} style={[styles.card, styles.itemRow]}>
              {it.image ? <Image source={{ uri: it.image }} style={styles.itemImg} /> : null}
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.itemTitle} numberOfLines={2}>{it.title}</Text>
                {it.variant ? <Text style={styles.meta}>{it.variant}</Text> : null}
                <Text style={styles.meta}>{it.quantity} × {euros(it.unitPriceCents, order.currency)}</Text>
              </View>
            </View>
          ))}

          {/* ── Client ── */}
          <Text style={styles.section}>Livraison</Text>
          <View style={styles.card}>
            {order.customer ? <Text style={styles.itemTitle}>{order.customer.name} · {order.customer.email}</Text> : (
              <Text style={styles.meta}>Compte supprimé</Text>
            )}
            <Text style={styles.meta}>{address.fullName}</Text>
            <Text style={styles.meta}>{[address.line1, address.line2].filter(Boolean).join(', ')}</Text>
            <Text style={styles.meta}>{[address.postalCode, address.city, address.countryCode].filter(Boolean).join(' ')}</Text>
            {address.phone ? <Text style={styles.meta}>{address.phone}</Text> : null}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  back: { fontSize: 24, color: colors.brandSoft },
  title: { ...typography.h2, color: colors.text },
  error: { color: colors.danger, padding: spacing.md },
  section: { ...typography.h3, color: colors.text, marginTop: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 6 },
  cardAlert: { borderColor: colors.brand },
  status: { fontSize: 15, fontWeight: '700', color: colors.text },
  stage: { fontSize: 15, fontWeight: '700', color: colors.text },
  total: { fontSize: 18, fontWeight: '800', color: colors.brandSoft, marginTop: 4 },
  meta: { fontSize: 13, color: colors.textSecondary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  primaryBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', marginTop: 4 },
  primaryTxt: { color: '#fff', fontWeight: '700' },
  secondaryBtn: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', marginTop: 4 },
  secondaryTxt: { color: colors.text, fontWeight: '600' },
  itemRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  itemImg: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceElevated },
  itemTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
});
