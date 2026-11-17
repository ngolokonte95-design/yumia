/**
 * Frise d'avancement d'une commande : Commandée → Paiement confirmé →
 * En préparation → Expédiée → Livrée.
 *
 * Construite à partir du statut et des dates que l'API tient déjà à jour
 * (la synchro AliExpress, toutes les 2 h, fait avancer le statut). Le détail
 * du transport, étape par étape, reste sur la page du transporteur (bouton
 * « Suivre mon colis ») : AliExpress ne le fournit pas de façon exploitable.
 *
 * Mise en scène (17/11/2026) : étapes franchies en pastilles au dégradé de
 * marque, segments qui se dessinent de haut en bas l'un après l'autre, halo
 * qui « respire » autour de l'étape en cours (arrêté hors de l'écran).
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming,
} from 'react-native-reanimated';
import { colors, gradients, motion, spacing } from '../../theme/tokens';
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

/** Segment franchi : se dessine de haut en bas, après le précédent. */
function DrawnSegment({ order }: { order: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(order * 160, withTiming(1, { duration: motion.duration.normal, easing: Easing.out(Easing.cubic) }));
  }, [order, p]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: p.value }] }));
  return (
    <Animated.View style={[styles.lineFill, { transformOrigin: 'top' }, style]}>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

/** Halo qui respire autour de l'étape en cours. */
function Pulse() {
  const focused = useIsFocused();
  const p = useSharedValue(0);
  useEffect(() => {
    if (!focused) { cancelAnimation(p); p.value = 0; return; }
    p.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1);
    return () => cancelAnimation(p);
  }, [focused, p]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.6 * (1 - p.value),
    transform: [{ scale: 1 + p.value * 0.9 }],
  }));
  return <Animated.View style={[styles.pulse, style]} pointerEvents="none" />;
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
              <View style={styles.dotBox}>
                {current ? <Pulse /> : null}
                <View style={[styles.dot, done && styles.dotDone, current && styles.dotCurrent]}>
                  {done ? (
                    <>
                      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                      <Text style={styles.check}>✓</Text>
                    </>
                  ) : null}
                </View>
              </View>
              {!last ? (
                <View style={styles.line}>
                  {i < reached ? <DrawnSegment order={i} /> : null}
                </View>
              ) : null}
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

const DOT = 22;

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.md },
  rail: { width: DOT, alignItems: 'center' },
  dotBox: { width: DOT, height: DOT, alignItems: 'center', justifyContent: 'center' },
  dot: {
    width: DOT, height: DOT, borderRadius: DOT / 2, overflow: 'hidden',
    borderWidth: 2, borderColor: colors.border, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  dotDone: { borderWidth: 0 },
  dotCurrent: { borderColor: colors.brand, borderWidth: 3 },
  pulse: {
    position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2,
    backgroundColor: colors.brand,
  },
  check: { color: '#fff', fontSize: 11, fontWeight: '900', lineHeight: 13 },
  line: {
    width: 3, flex: 1, minHeight: 16, borderRadius: 2, overflow: 'hidden',
    backgroundColor: colors.border, marginVertical: 3,
  },
  lineFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  body: { flex: 1, paddingTop: 1 },
  bodySpacing: { paddingBottom: 12 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: DOT },
  label: { fontSize: 14, color: colors.textMuted, fontWeight: '500' },
  labelActive: { color: colors.textPrimary, fontWeight: '800' },
  date: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  hint: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 17 },
});
