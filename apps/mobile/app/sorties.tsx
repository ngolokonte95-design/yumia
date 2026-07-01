/**
 * SORTIES & BILLETS — établissements mis en avant et leurs événements.
 * Branché sur GET /venues/boosted et POST /tickets/purchase (commission 15%).
 */
import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Modal, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { useLocation } from '../lib/useLocation';
import { fetchBoostedVenues, purchaseTicket, type Venue } from '../lib/business-api';

export default function SortiesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { coords, resolving } = useLocation();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Venue | null>(null);

  useEffect(() => {
    if (resolving) return;
    fetchBoostedVenues({ lat: coords.lat, lng: coords.lng, radius: 50000 })
      .then(setVenues)
      .catch(() => setVenues([]))
      .finally(() => setLoading(false));
  }, [coords.lat, coords.lng, resolving]);

  function formatDate(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🎟️ Sorties & billets</Text>
          <Text style={styles.subtitle}>Les événements à ne pas manquer près de toi.</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.md }}>
          {venues.length === 0 ? (
            <Text style={styles.empty}>Aucun événement à l'affiche pour l'instant. Reviens bientôt !</Text>
          ) : (
            venues.map((v) => (
              <View key={v.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.venueName}>{v.name}</Text>
                  {v.boostLevel >= 3 ? <Text style={styles.hotBadge}>🔥 À la une</Text> : null}
                </View>
                {v.eventName ? <Text style={styles.eventName}>{v.eventName}</Text> : null}
                <Text style={styles.eventMeta}>
                  📍 {v.city} · 📅 {formatDate(v.eventDate)}
                </Text>
                <View style={styles.cardBottom}>
                  <Text style={styles.price}>
                    {v.ticketPrice != null ? `${v.ticketPrice}€` : 'Gratuit'}
                    <Text style={styles.priceUnit}> / billet</Text>
                  </Text>
                  <Pressable
                    style={styles.buyBtn}
                    onPress={() => setSelected(v)}
                    disabled={v.ticketPrice == null}
                  >
                    <Text style={styles.buyText}>Réserver</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <TicketModal
        venue={selected}
        canBuy={!!accessToken}
        onClose={() => setSelected(null)}
        onConfirm={async (qty) => {
          if (!accessToken || !selected || selected.ticketPrice == null) return;
          try {
            await purchaseTicket(
              accessToken,
              selected.id,
              `${selected.id}-event`,
              qty,
              selected.ticketPrice,
            );
            setSelected(null);
            Alert.alert('Billet(s) réservé(s) 🎉', `${qty} billet${qty > 1 ? 's' : ''} pour ${selected.eventName}. Le paiement sera finalisé prochainement.`);
          } catch (e) {
            Alert.alert('Erreur', e instanceof Error ? e.message : 'Réservation impossible.');
          }
        }}
      />
    </View>
  );
}

function TicketModal({
  venue, canBuy, onClose, onConfirm,
}: {
  venue: Venue | null;
  canBuy: boolean;
  onClose: () => void;
  onConfirm: (qty: number) => Promise<void>;
}) {
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  if (!venue || venue.ticketPrice == null) return null;
  const total = venue.ticketPrice * qty;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{venue.eventName}</Text>
          <Text style={styles.sheetSub}>{venue.name} · {venue.ticketPrice}€ / billet</Text>

          <Text style={styles.fieldLabel}>Nombre de billets</Text>
          <View style={styles.counterRow}>
            <Pressable style={styles.counterBtn} onPress={() => setQty((q) => Math.max(1, q - 1))}>
              <Text style={styles.counterBtnText}>−</Text>
            </Pressable>
            <Text style={styles.counterValue}>{qty}</Text>
            <Pressable style={styles.counterBtn} onPress={() => setQty((q) => Math.min(20, q + 1))}>
              <Text style={styles.counterBtnText}>+</Text>
            </Pressable>
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{total}€</Text>
          </View>

          {canBuy ? (
            <Pressable
              style={[styles.confirmBtn, submitting && styles.disabled]}
              disabled={submitting}
              onPress={async () => { setSubmitting(true); await onConfirm(qty); setSubmitting(false); }}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>Réserver mes billets</Text>}
            </Pressable>
          ) : (
            <Text style={styles.loginHint}>Connecte-toi pour réserver des billets.</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  backBtn: { paddingTop: 2 },
  backText: { ...typography.heading, color: colors.brandSoft, fontSize: 24 },
  title: { ...typography.heading, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xxl },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  venueName: { ...typography.caption, color: colors.textMuted },
  hotBadge: { ...typography.label, color: '#fff', backgroundColor: colors.brand, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, fontSize: 11 },
  eventName: { ...typography.title, color: colors.textPrimary },
  eventMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  price: { ...typography.heading, color: colors.brandSoft },
  priceUnit: { ...typography.caption, color: colors.textMuted },
  buyBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  buyText: { ...typography.caption, color: '#fff', fontWeight: '700' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.sm },
  sheetTitle: { ...typography.title, color: colors.textPrimary },
  sheetSub: { ...typography.caption, color: colors.textMuted },
  fieldLabel: { ...typography.label, color: colors.textSecondary, marginTop: spacing.md },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.xs },
  counterBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  counterBtnText: { ...typography.title, color: colors.textPrimary },
  counterValue: { ...typography.heading, color: colors.textPrimary, minWidth: 32, textAlign: 'center' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  totalLabel: { ...typography.body, color: colors.textSecondary },
  totalValue: { ...typography.title, color: colors.brandSoft },
  confirmBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.md },
  confirmText: { ...typography.body, color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.6 },
  loginHint: { ...typography.caption, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md },
});
