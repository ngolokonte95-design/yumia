/**
 * Commande — choix/saisie de l'adresse puis paiement Stripe.
 *
 * Le paiement passe par Stripe Checkout (page hébergée ouverte dans le
 * navigateur) et non par la Payment Sheet native : celle-ci impose
 * @stripe/stripe-react-native, un module natif absent d'Expo Go. Le paiement
 * est confirmé côté serveur par le webhook Stripe, jamais par le retour de
 * l'app — un client qui ferme le navigateur ne casse donc rien.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { shopApi, formatPrice, type CartSummary, type ShippingAddress } from '../../lib/shop-api';

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();

  const [cart, setCart] = useState<CartSummary | null>(null);
  const [addresses, setAddresses] = useState<ShippingAddress[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    fullName: '', line1: '', line2: '', city: '', postalCode: '', phone: '', countryCode: 'FR',
  });

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [c, addr] = await Promise.all([shopApi.cart(accessToken), shopApi.addresses(accessToken)]);
      setCart(c);
      setAddresses(addr);
      setSelectedId(addr.find((a) => a.isDefault)?.id ?? addr[0]?.id ?? null);
      // Sans adresse enregistrée, le formulaire s'ouvre d'emblée : c'est de
      // toute façon l'étape obligatoire suivante.
      setShowForm(addr.length === 0);
    } catch {
      setCart(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  async function saveAddress() {
    if (!accessToken) return;
    const required: Array<[keyof typeof form, string]> = [
      ['fullName', 'Nom complet'], ['line1', 'Adresse'], ['city', 'Ville'],
      ['postalCode', 'Code postal'], ['phone', 'Téléphone'],
    ];
    const missing = required.filter(([k]) => !form[k].trim()).map(([, label]) => label);
    if (missing.length) {
      Alert.alert('Champs manquants', missing.join(', '));
      return;
    }
    try {
      const created = await shopApi.createAddress(accessToken, {
        ...form,
        line2: form.line2 || null,
        isDefault: addresses.length === 0,
      });
      setAddresses((prev) => [...prev, created]);
      setSelectedId(created.id);
      setShowForm(false);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Adresse non enregistrée.');
    }
  }

  async function pay() {
    if (!accessToken || !selectedId || paying) return;
    setPaying(true);
    try {
      const res = await shopApi.checkout(accessToken, selectedId);
      if (!res.checkoutUrl) {
        Alert.alert('Paiement indisponible', 'Le paiement n\'est pas encore configuré. Réessaie plus tard.');
        return;
      }
      await Linking.openURL(res.checkoutUrl);
      // La commande est créée et en attente : on renvoie vers le suivi plutôt
      // que de laisser l'utilisateur sur un panier qui semble inchangé.
      router.replace('/shop/orders');
    } catch (e) {
      Alert.alert('Commande impossible', e instanceof Error ? e.message : 'Réessaie dans un instant.');
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return <View style={[styles.screen, styles.center]}><ActivityIndicator color={colors.brand} size="large" /></View>;
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>Commande</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 180 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>Adresse de livraison</Text>

        {addresses.map((a) => (
          <Pressable
            key={a.id}
            style={[styles.addressCard, selectedId === a.id && styles.addressCardActive]}
            onPress={() => setSelectedId(a.id)}
          >
            <View style={styles.radio}>{selectedId === a.id && <View style={styles.radioDot} />}</View>
            <View style={{ flex: 1 }}>
              <Text style={styles.addressName}>{a.fullName}</Text>
              <Text style={styles.addressLine}>
                {a.line1}{a.line2 ? `, ${a.line2}` : ''}
              </Text>
              <Text style={styles.addressLine}>{a.postalCode} {a.city} · {a.countryCode}</Text>
              <Text style={styles.addressPhone}>{a.phone}</Text>
            </View>
          </Pressable>
        ))}

        {showForm ? (
          <View style={styles.form}>
            <Text style={styles.formTitle}>Nouvelle adresse</Text>
            {([
              ['fullName', 'Nom complet', 'default'],
              ['line1', 'Adresse', 'default'],
              ['line2', 'Complément (optionnel)', 'default'],
              ['postalCode', 'Code postal', 'number-pad'],
              ['city', 'Ville', 'default'],
              ['phone', 'Téléphone', 'phone-pad'],
            ] as const).map(([key, placeholder, keyboard]) => (
              <TextInput
                key={key}
                style={styles.input}
                placeholder={placeholder}
                placeholderTextColor={colors.textMuted}
                keyboardType={keyboard}
                value={form[key]}
                onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
              />
            ))}
            <View style={styles.formActions}>
              {addresses.length > 0 && (
                <Pressable style={styles.cancelBtn} onPress={() => setShowForm(false)}>
                  <Text style={styles.cancelTxt}>Annuler</Text>
                </Pressable>
              )}
              <Pressable style={styles.saveBtn} onPress={saveAddress}>
                <Text style={styles.saveTxt}>Enregistrer</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={styles.addAddressBtn} onPress={() => setShowForm(true)}>
            <Text style={styles.addAddressTxt}>+ Ajouter une adresse</Text>
          </Pressable>
        )}

        {cart && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Récapitulatif</Text>
            <View style={styles.recap}>
              {cart.lines.filter((l) => l.available).map((l) => (
                <View key={l.id} style={styles.recapRow}>
                  <Text style={styles.recapItem} numberOfLines={1}>
                    {l.quantity} × {l.title}
                  </Text>
                  <Text style={styles.recapPrice}>{formatPrice(l.lineTotalCents, cart.currency)}</Text>
                </View>
              ))}
              <View style={styles.recapRow}>
                <Text style={styles.recapItem}>Livraison</Text>
                <Text style={[styles.recapPrice, cart.shippingCents === 0 && styles.free]}>
                  {cart.shippingCents === 0 ? 'Offerte' : formatPrice(cart.shippingCents, cart.currency)}
                </Text>
              </View>
            </View>
          </>
        )}

        <Text style={styles.legal}>
          Paiement sécurisé par Stripe. Tu disposes d'un droit de rétractation de 14 jours
          et de la garantie légale de conformité de 2 ans.
        </Text>
      </ScrollView>

      {cart && (
        <View style={[styles.payBar, { paddingBottom: insets.bottom + spacing.md }]}>
          <View>
            <Text style={styles.payLabel}>Total</Text>
            <Text style={styles.payTotal}>{formatPrice(cart.totalCents, cart.currency)}</Text>
          </View>
          <Pressable
            style={[styles.payBtn, (!selectedId || paying) && styles.payBtnDisabled]}
            onPress={pay}
            disabled={!selectedId || paying}
          >
            {paying
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.payTxt}>Payer</Text>}
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  back: { fontSize: 24, color: colors.brandSoft },
  title: { ...typography.h3, color: colors.textPrimary },
  sectionTitle: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.sm },

  addressCard: {
    flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm,
  },
  addressCardActive: { borderColor: colors.brand },
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
  addressName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  addressLine: { fontSize: 13, color: colors.textSecondary },
  addressPhone: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  addAddressBtn: {
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    borderStyle: 'dashed', paddingVertical: 14, alignItems: 'center',
  },
  addAddressTxt: { color: colors.brandSoft, fontWeight: '600' },

  form: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  formTitle: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  input: {
    backgroundColor: colors.surfaceElevated, borderRadius: radius.sm, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 11, color: colors.textPrimary,
  },
  formActions: { flexDirection: 'row', gap: spacing.sm, marginTop: 4 },
  cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  cancelTxt: { color: colors.textSecondary, fontWeight: '600' },
  saveBtn: { flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: radius.pill, backgroundColor: colors.brand },
  saveTxt: { color: '#fff', fontWeight: '700' },

  recap: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 8 },
  recapRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  recapItem: { flex: 1, fontSize: 13, color: colors.textSecondary },
  recapPrice: { fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
  free: { color: colors.success },

  legal: { fontSize: 11, color: colors.textMuted, lineHeight: 17, marginTop: spacing.lg, textAlign: 'center' },

  payBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.md,
  },
  payLabel: { fontSize: 11, color: colors.textMuted },
  payTotal: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  payBtn: { flex: 1, maxWidth: 200, alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 15 },
  payBtnDisabled: { opacity: 0.5 },
  payTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
