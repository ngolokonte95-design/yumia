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
import { useI18n } from '../../lib/useI18n';
import type { TranslationKey } from '../../lib/translations';

type StepKey = 'ordered' | 'paid' | 'preparing' | 'shipped' | 'delivered';

/** Étapes et clés de libellé — traduites au rendu, dans la langue active. */
const STEPS: { key: StepKey; labelKey: TranslationKey }[] = [
  { key: 'ordered', labelKey: 'shop_timeline_step_ordered' },
  { key: 'paid', labelKey: 'shop_timeline_step_paid' },
  { key: 'preparing', labelKey: 'shop_timeline_step_preparing' },
  { key: 'shipped', labelKey: 'shop_timeline_step_shipped' },
  { key: 'delivered', labelKey: 'shop_timeline_step_delivered' },
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
const CURRENT_HINT: Partial<Record<StepKey, TranslationKey>> = {
  ordered: 'shop_timeline_hint_ordered',
  paid: 'shop_timeline_hint_paid',
  preparing: 'shop_timeline_hint_preparing',
  shipped: 'shop_timeline_hint_shipped',
};

function fmt(locale: string, iso?: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

export function OrderTimeline({ order }: { order: Order }) {
  const { t, locale } = useI18n();
  const reached = REACHED[order.status];
  if (reached < 0) return null; // annulée / remboursée : le badge de statut suffit

  const dates: Partial<Record<StepKey, string | null>> = {
    ordered: fmt(locale, order.createdAt),
    paid: fmt(locale, order.paidAt),
    shipped: fmt(locale, order.shippedAt),
    // Pas de date de livraison dédiée : la dernière mise à jour de la
    // commande livrée est celle où la synchro l'a passée en « Livrée ».
    delivered: order.status === 'delivered' ? fmt(locale, order.updatedAt) : null,
  };

  return (
    <View style={styles.wrap}>
      {STEPS.map((step, i) => {
        const done = i < reached || (i === reached && step.key === 'delivered');
        const current = i === reached && !done;
        const last = i === STEPS.length - 1;
        const date = dates[step.key];
        const hintKey = CURRENT_HINT[step.key];
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
                <Text style={[styles.label, (done || current) && styles.labelActive]}>{t(step.labelKey)}</Text>
                {date && (done || current) ? <Text style={styles.date}>{date}</Text> : null}
              </View>
              {current && hintKey ? <Text style={styles.hint}>{t(hintKey)}</Text> : null}
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
