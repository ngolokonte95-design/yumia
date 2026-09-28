/**
 * Frise d'avancement d'une commande : Commandée → Paiement confirmé →
 * En préparation → Expédiée → Livrée.
 *
 * Construite à partir du statut et des dates que l'API tient déjà à jour
 * (la synchro AliExpress, toutes les 2 h, fait avancer le statut). Le détail
 * du transport, étape par étape, reste sur la page du transporteur (bouton
 * « Suivre mon colis ») : AliExpress ne le fournit pas de façon exploitable.
 */
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../theme/tokens';
import type { Order } from '../../lib/shop-api';

type StepKey = 'ordered' | 'paid' | 'preparing' | 'shipped' | 'delivered';

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'ordered', label: 'Commandée' },
  { key: 'paid', label: 'Paiement confirmé' },
  { key: 'preparing', label: 'En préparation' },
  { key: 'shipped', label: 'Expédiée' },
  { key: 'delivered', label: 'Livrée' },
];

/** Étape atteinte, selon le statut de la commande. */
const REACHED: Record<Order['status'], number> = {
  pending: 0,
  paid: 1,
  fulfilling: 2,
  shipped: 3,
  delivered: 4,
  cancelled: -1,
  refunded: -1,
};

/** Précision affichée sous l'étape en cours. */
const CURRENT_HINT: Partial<Record<StepKey, string>> = {
  ordered: 'En attente de la confirmation du paiement.',
  paid: 'Ta commande part chez notre fournisseur.',
  preparing: 'Le vendeur prépare ton colis. Le numéro de suivi arrivera à l\'expédition.',
  shipped: 'En cours d\'acheminement — 7 à 15 jours en général.',
};

function fmt(iso?: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function OrderTimeline({ order }: { order: Order }) {
  const reached = REACHED[order.status];
  if (reached < 0) return null; // annulée / remboursée : le badge de statut suffit

  const dates: Partial<Record<StepKey, string | null>> = {
    ordered: fmt(order.createdAt),
    paid: fmt(order.paidAt),
    shipped: fmt(order.shippedAt),
    // Pas de date de livraison dédiée : la dernière mise à jour de la
    // commande livrée est celle où la synchro l'a passée en « Livrée ».
    delivered: order.status === 'delivered' ? fmt(order.updatedAt) : null,
  };

  return (
    <View style={styles.wrap}>
      {STEPS.map((step, i) => {
        const done = i < reached || (i === reached && step.key === 'delivered');
        const current = i === reached && !done;
        const last = i === STEPS.length - 1;
        const date = dates[step.key];
        return (
          <View key={step.key} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, done && styles.dotDone, current && styles.dotCurrent]}>
                {done ? <Text style={styles.check}>✓</Text> : null}
              </View>
              {!last ? <View style={[styles.line, i < reached && styles.lineDone]} /> : null}
            </View>
            <View style={[styles.body, !last && styles.bodySpacing]}>
              <View style={styles.labelRow}>
                <Text style={[styles.label, (done || current) && styles.labelActive]}>{step.label}</Text>
                {date && (done || current) ? <Text style={styles.date}>{date}</Text> : null}
              </View>
              {current && CURRENT_HINT[step.key] ? <Text style={styles.hint}>{CURRENT_HINT[step.key]}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const DOT = 18;

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  rail: { width: DOT, alignItems: 'center' },
  dot: {
    width: DOT, height: DOT, borderRadius: DOT / 2,
    borderWidth: 2, borderColor: colors.border, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.brand, borderColor: colors.brand },
  dotCurrent: { borderColor: colors.brand, borderWidth: 3 },
  check: { color: '#fff', fontSize: 10, fontWeight: '800', lineHeight: 12 },
  line: { width: 2, flex: 1, minHeight: 14, backgroundColor: colors.border, marginVertical: 2 },
  lineDone: { backgroundColor: colors.brand },
  body: { flex: 1, paddingTop: 0 },
  bodySpacing: { paddingBottom: 10 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: DOT },
  label: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
  labelActive: { color: colors.textPrimary, fontWeight: '700' },
  date: { fontSize: 12, color: colors.textSecondary },
  hint: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
});
