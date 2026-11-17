/**
 * Commande — choix/saisie de l'adresse puis paiement Stripe.
 *
 * Le paiement passe par Stripe Checkout (page hébergée ouverte dans le
 * navigateur) et non par la Payment Sheet native : celle-ci impose
 * @stripe/stripe-react-native, un module natif absent d'Expo Go. Le paiement
 * est confirmé côté serveur par le webhook Stripe, jamais par le retour de
 * l'app — un client qui ferme le navigateur ne casse donc rien.
 *
 * Style boutique haut de gamme (17/11/2026) : adresses en cartes sélectionnables
 * (liseré et pastille au dégradé de marque), formulaire et récapitulatif sur
 * panneaux sobres, barre de paiement vitrée. Aucun changement du parcours de
 * paiement lui-même.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, gradients, radius, spacing } from '../../theme/tokens';
import { shopApi, formatPrice, type CartSummary, type ShippingAddress } from '../../lib/shop-api';
import { CGV_URL } from '../../lib/legal';
import { isHttpsUrl, openExternalHttps } from '../../lib/external-link';
import { useI18n } from '../../lib/useI18n';
import { GhostButton, GradientButton, PricePop, ShopHeader } from '../../components/shop/ShopChrome';
import { PressableScale, Reveal } from '../../components/ui';
import { haptics } from '../../lib/useHaptics';

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { t } = useI18n();

  const [cart, setCart] = useState<CartSummary | null>(null);
  const [addresses, setAddresses] = useState<ShippingAddress[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    fullName: '', line1: '', line2: '', city: '', province: '',
    postalCode: '', phone: '', countryCode: 'FR',
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

  /** Supprime une adresse enregistrée (les commandes passées gardent la leur). */
  function confirmDeleteAddress(a: ShippingAddress) {
    Alert.alert(t('shop_checkout_delete_address_title'), `${a.fullName}, ${a.line1}, ${a.city}`, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('shop_checkout_delete'),
        style: 'destructive',
        onPress: async () => {
          if (!accessToken) return;
          try {
            await shopApi.deleteAddress(accessToken, a.id);
            setAddresses((prev) => {
              const next = prev.filter((x) => x.id !== a.id);
              if (selectedId === a.id) setSelectedId(next[0]?.id ?? null);
              return next;
            });
          } catch {
            Alert.alert(t('shop_checkout_delete_failed_title'), t('shop_checkout_retry_soon'));
          }
        },
      },
    ]);
  }

  async function saveAddress() {
    if (!accessToken) return;
    const required: Array<[keyof typeof form, string]> = [
      ['fullName', t('shop_checkout_field_full_name')], ['line1', t('shop_checkout_field_line1')], ['city', t('shop_checkout_field_city')],
      // La région est exigée par le transporteur : la rendre facultative
      // ferait échouer l'expédition après le paiement, au pire moment.
      ['province', t('shop_checkout_field_province')],
      ['postalCode', t('shop_checkout_field_postal_code')], ['phone', t('shop_checkout_field_phone')],
    ];
    const missing = required.filter(([k]) => !form[k].trim()).map(([, label]) => label);
    if (missing.length) {
      Alert.alert(t('shop_checkout_missing_fields_title'), missing.join(', '));
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
      Alert.alert(t('shop_checkout_error_title'), e instanceof Error ? e.message : t('shop_checkout_address_not_saved'));
    }
  }

  async function pay() {
    if (!accessToken || !selectedId || paying) return;
    setPaying(true);
    try {
      const res = await shopApi.checkout(accessToken, selectedId);
      if (!isHttpsUrl(res.checkoutUrl)) {
        Alert.alert(t('shop_checkout_payment_unavailable_title'), t('shop_checkout_payment_unavailable_body'));
        return;
      }
      await openExternalHttps(res.checkoutUrl);
      // La commande est créée et en attente : on renvoie vers le suivi plutôt
      // que de laisser l'utilisateur sur un panier qui semble inchangé.
      router.replace('/shop/orders');
    } catch (e) {
      Alert.alert(t('shop_checkout_order_failed_title'), e instanceof Error ? e.message : t('shop_checkout_retry_soon'));
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return <View style={[styles.screen, styles.center]}><ActivityIndicator color={colors.brand} size="large" /></View>;
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top }}>
        <ShopHeader title={t('shop_checkout_title')} onBack={() => router.back()} backLabel={t('gs_back')} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 180 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>{t('shop_checkout_shipping_address')}</Text>

        {addresses.map((a, i) => (
          <Reveal key={a.id} index={Math.min(i, 5)}>
          <PressableScale
            style={[styles.addressCard, selectedId === a.id && styles.addressCardActive]}
            onPress={() => { haptics.select(); setSelectedId(a.id); }}
            scaleTo={0.98}
          >
            <View style={[styles.radio, selectedId === a.id && styles.radioOn]}>
              {selectedId === a.id ? (
                <View style={styles.radioDot}>
                  <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                </View>
              ) : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.addressName}>{a.fullName}</Text>
              <Text style={styles.addressLine}>
                {a.line1}{a.line2 ? `, ${a.line2}` : ''}
              </Text>
              <Text style={styles.addressLine}>{a.postalCode} {a.city} · {a.countryCode}</Text>
              <Text style={styles.addressPhone}>{a.phone}</Text>
            </View>
            <Pressable onPress={() => confirmDeleteAddress(a)} hitSlop={10} accessibilityLabel={t('shop_checkout_delete_address_a11y')}>
              <Text style={styles.addressDelete}>{t('shop_checkout_delete')}</Text>
            </Pressable>
          </PressableScale>
          </Reveal>
        ))}

        {showForm ? (
          <View style={styles.form}>
            <Text style={styles.formTitle}>{t('shop_checkout_new_address')}</Text>
            {([
              // « Prénom et nom » et non « Nom complet » : AliExpress refuse une
              // commande dont le destinataire tient en un seul mot.
              ['fullName', t('shop_checkout_field_full_name'), 'default'],
              ['line1', t('shop_checkout_field_line1'), 'default'],
              ['line2', t('shop_checkout_field_line2'), 'default'],
              ['postalCode', t('shop_checkout_field_postal_code'), 'number-pad'],
              ['city', t('shop_checkout_field_city'), 'default'],
              ['province', t('shop_checkout_field_province'), 'default'],
              ['phone', t('shop_checkout_field_phone'), 'phone-pad'],
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
                <GhostButton style={styles.cancelBtn} label={t('cancel')} onPress={() => setShowForm(false)} />
              )}
              <GradientButton size="md" style={styles.saveBtn} label={t('shop_checkout_save')} onPress={saveAddress} />
            </View>
          </View>
        ) : (
          <PressableScale style={styles.addAddressBtn} onPress={() => setShowForm(true)} scaleTo={0.97}>
            <Text style={styles.addAddressTxt}>＋  {t('shop_checkout_add_address')}</Text>
          </PressableScale>
        )}

        {cart && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>{t('shop_checkout_summary')}</Text>
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
                <Text style={styles.recapItem}>{t('shop_checkout_shipping')}</Text>
                <Text style={[styles.recapPrice, cart.shippingCents === 0 && styles.free]}>
                  {cart.shippingCents === 0 ? t('shop_checkout_shipping_free') : formatPrice(cart.shippingCents, cart.currency)}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* Une seule phrase traduite, avec le marqueur {link} à l'endroit du
            lien CGV : l'ordre des mots reste libre dans chaque langue. */}
        <Text style={styles.legal}>
          {t('shop_checkout_legal').split('{link}').map((part, i, parts) => (
            <Text key={i}>
              {part}
              {i < parts.length - 1 && (
                <Text style={styles.legalLink} onPress={() => void Linking.openURL(CGV_URL)}>
                  {t('shop_checkout_legal_cgv_link')}
                </Text>
              )}
            </Text>
          ))}
        </Text>
      </ScrollView>

      {cart && (
        <View style={[styles.payBar, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.payCol}>
            <Text style={styles.payLabel}>{t('shop_checkout_total')}</Text>
            <PricePop style={styles.payTotal} text={formatPrice(cart.totalCents, cart.currency)} />
          </View>
          <GradientButton
            style={styles.payBtn}
            icon="🔒"
            label={t('shop_checkout_pay')}
            onPress={pay}
            loading={paying}
            disabled={!selectedId}
          />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  sectionTitle: {
    color: colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 1.6,
    textTransform: 'uppercase', marginBottom: spacing.md,
  },

  addressCard: {
    flexDirection: 'row', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)', padding: spacing.md, marginBottom: spacing.sm,
  },
  addressCardActive: { borderColor: colors.brand, borderWidth: 1.5 },
  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  radioOn: { borderColor: colors.brandSoft },
  radioDot: { width: 12, height: 12, borderRadius: 6, overflow: 'hidden' },
  addressName: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  addressLine: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  addressPhone: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  addressDelete: { fontSize: 12, fontWeight: '700', color: colors.danger, marginLeft: spacing.sm },

  addAddressBtn: {
    borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    borderStyle: 'dashed', paddingVertical: 16, alignItems: 'center',
  },
  addAddressTxt: { color: colors.brandSoft, fontWeight: '800', fontSize: 14 },

  form: {
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)', padding: spacing.md, gap: spacing.sm,
  },
  formTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '900', marginBottom: 2 },
  input: {
    backgroundColor: colors.surfaceElevated, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)', paddingHorizontal: spacing.md, paddingVertical: 13,
    color: colors.textPrimary, fontSize: 15,
  },
  formActions: { flexDirection: 'row', gap: spacing.sm, marginTop: 6 },
  cancelBtn: { flex: 1, minHeight: 44 },
  saveBtn: { flex: 2 },

  recap: {
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)', padding: spacing.md, gap: 10,
  },
  recapRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  recapItem: { flex: 1, fontSize: 14, color: colors.textSecondary },
  recapPrice: { fontSize: 14, color: colors.textPrimary, fontWeight: '800' },
  free: { color: colors.success },

  legal: { fontSize: 11, color: colors.textMuted, lineHeight: 17, marginTop: spacing.lg, textAlign: 'center' },
  legalLink: { color: colors.brandSoft, textDecorationLine: 'underline' },

  payBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(14,14,18,0.97)',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.md,
  },
  payCol: { flexShrink: 1 },
  payLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' },
  payTotal: { fontSize: 26, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.7 },
  payBtn: { flex: 1, maxWidth: 220 },
});
